-- ================================================================
-- Checkup 2026-10-28 — lote BD-2: picagens e assiduidade
--   A1-04/A4-01  INSERT direto em picagens: quem não é admin/gestor deixa de gravar
--                picagens já AUTORIZADAS, com validação ou carimbo de servidor forjados.
--   A4-06        Geofence: só autoriza automaticamente com relógio a ≤ 5 min do servidor.
--   A4-05        Horários: a nova atribuição fecha a anterior; o resumo diário tolera
--                sobreposições antigas.
--   A4-04        calcular_resumo_dia passa a calcular horas efetivas e obra.
--
-- Picagens que chegam atrasadas (fila offline, horas ou dias depois) NUNCA são
-- recusadas: ficam PENDENTE_VALIDACAO com o desvio gravado, para o gestor decidir.
-- Idempotente. APLICAR: SQL Editor do Supabase Dashboard.
-- ================================================================

-- ── A1-04 / A4-01 — normalizar o INSERT direto ──────────────────────────────
-- current_user = 'authenticated' só no pedido da API: a RPC de geofence (SECURITY
-- DEFINER, corre como dono) e o papel de serviço não passam por aqui.
CREATE OR REPLACE FUNCTION public._picagem_normalizar_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user = 'authenticated'
     AND COALESCE(public.auth_role()::text, '') NOT IN ('admin', 'gestor') THEN
    NEW.resultado              := 'PENDENTE_VALIDACAO';
    NEW.timestamp_servidor     := now();
    -- Limitado ao intervalo de int: um relógio absurdo não pode fazer perder a picagem
    NEW.desvio_relogio_s       := GREATEST(LEAST(round(extract(epoch FROM now() - NEW.timestamp_dispositivo)),
                                                 2147483647), -2147483647)::int;
    NEW.hora_original_proposta := NULL;
    NEW.hora_final_validada    := NULL;
    NEW.validada_por           := NULL;
    NEW.validada_em            := NULL;
    NEW.justificacao           := NULL;
    NEW.posicao                := NULL;
    NEW.distancia_geofence_m   := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._picagem_normalizar_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_picagem_normalizar_insert ON public.picagens;
CREATE TRIGGER trg_picagem_normalizar_insert
  BEFORE INSERT ON public.picagens
  FOR EACH ROW EXECUTE FUNCTION public._picagem_normalizar_insert();

-- ── A4-06 — geofence: autorização automática só com relógio certo ───────────
CREATE OR REPLACE FUNCTION public._picagem_dentro_do_desvio(p_ts timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT abs(extract(epoch FROM now() - p_ts)) <= 300
$$;

REVOKE ALL ON FUNCTION public._picagem_dentro_do_desvio(timestamptz) FROM PUBLIC, anon, authenticated;

-- Corpo de 20260916200000_fase5_geofence.sql (renomeado para _impl em 20260929000000);
-- muda só: desvio_relogio_s/timestamp_servidor gravados e AUTORIZADA exige relógio certo.
-- pt usa %TYPE e geography() em forma de função para a migration compilar sem PostGIS (testes).
CREATE OR REPLACE FUNCTION public._registar_picagem_geofence_impl(
  p_colaborador_id uuid,
  p_obra_id        uuid,
  p_tipo           text,
  p_lat            double precision,
  p_lon            double precision,
  p_precisao_m     integer,
  p_timestamp_disp timestamp with time zone DEFAULT now()
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  obra        public.obras%rowtype;
  pt          public.picagens.posicao%TYPE;
  distancia   float8;
  v_resultado text;
  v_desvio    int;
  nova_id     uuid;
BEGIN
  SELECT * INTO obra FROM public.obras WHERE id = p_obra_id;
  pt := geography(ST_MakePoint(p_lon, p_lat));

  IF obra.geofence_tipo = 'RAIO' AND obra.geofence_centro IS NOT NULL THEN
    distancia := ST_Distance(pt, obra.geofence_centro);
    v_resultado := CASE
      WHEN distancia <= obra.geofence_raio_m THEN 'AUTORIZADA'
      ELSE 'PENDENTE_VALIDACAO'
    END;

  ELSIF obra.geofence_tipo = 'POLIGONO' AND obra.geofence_poligono IS NOT NULL THEN
    v_resultado := CASE
      WHEN ST_Within(pt::geometry, obra.geofence_poligono::geometry) THEN 'AUTORIZADA'
      ELSE 'PENDENTE_VALIDACAO'
    END;
    distancia := ST_Distance(pt, obra.geofence_poligono);

  ELSE
    v_resultado := 'PENDENTE_VALIDACAO';
    distancia   := NULL;
  END IF;

  -- GPS com precisão fraca → nunca autorizar automaticamente
  IF p_precisao_m > 50 THEN v_resultado := 'PENDENTE_VALIDACAO'; END IF;

  -- Hora do dispositivo longe da do servidor (retroativa ou fila offline) → gestor decide
  IF NOT COALESCE(public._picagem_dentro_do_desvio(p_timestamp_disp), false) THEN
    v_resultado := 'PENDENTE_VALIDACAO';
  END IF;

  v_desvio := GREATEST(LEAST(round(extract(epoch FROM now() - p_timestamp_disp)),
                             2147483647), -2147483647)::int;

  INSERT INTO public.picagens (
    colaborador_id, obra_id, tipo,
    timestamp_dispositivo, timestamp_servidor, desvio_relogio_s, posicao, precisao_m,
    distancia_geofence_m, resultado, origem
  ) VALUES (
    p_colaborador_id, p_obra_id, p_tipo,
    p_timestamp_disp, now(), v_desvio, pt, p_precisao_m,
    CASE WHEN distancia IS NOT NULL THEN distancia::int ELSE NULL END,
    v_resultado, 'ONLINE'
  ) RETURNING id INTO nova_id;

  RETURN json_build_object(
    'id',          nova_id,
    'resultado',   v_resultado,
    'distancia_m', CASE WHEN distancia IS NOT NULL THEN distancia::int ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public._registar_picagem_geofence_impl(uuid, uuid, text, double precision, double precision, integer, timestamp with time zone)
  FROM PUBLIC, anon, authenticated;

-- ── A4-05 — atribuição de horário fecha a anterior ──────────────────────────
CREATE OR REPLACE FUNCTION public._horario_colaborador_fechar_anterior()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_posterior date;
BEGIN
  SELECT min(hc.valido_de) INTO v_posterior
    FROM public.horario_colaborador hc
   WHERE hc.colaborador_id = NEW.colaborador_id
     AND hc.valido_de > NEW.valido_de
     AND (NEW.valido_ate IS NULL OR hc.valido_de <= NEW.valido_ate);
  IF v_posterior IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe um horário atribuído a partir de %', to_char(v_posterior, 'DD/MM/YYYY');
  END IF;

  UPDATE public.horario_colaborador
     SET valido_ate = NEW.valido_de - 1
   WHERE colaborador_id = NEW.colaborador_id
     AND valido_de < NEW.valido_de
     AND (valido_ate IS NULL OR valido_ate >= NEW.valido_de);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._horario_colaborador_fechar_anterior() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_horario_colaborador_fechar_anterior ON public.horario_colaborador;
CREATE TRIGGER trg_horario_colaborador_fechar_anterior
  BEFORE INSERT ON public.horario_colaborador
  FOR EACH ROW EXECUTE FUNCTION public._horario_colaborador_fechar_anterior();

-- ── A4-04 + A4-05 — resumo diário com horas efetivas ────────────────────────
-- Horas efetivas: picagens AUTORIZADAS do dia de Lisboa (hora validada pelo gestor
-- quando existe). Pares ENTRADA→SAIDA menos pares PAUSA_INI→PAUSA_FIM; sem pausas
-- picadas, desconta o intervalo do horário se um turno o cobrir.
-- horas_supl_validadas e validado_* nunca são tocados.
CREATE OR REPLACE FUNCTION public.calcular_resumo_dia(p_data date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH hc AS (
    -- Uma atribuição por colaborador, mesmo com sobreposições antigas
    SELECT DISTINCT ON (a.colaborador_id)
           a.colaborador_id, h.periodo_diario_h, h.dias_semana,
           h.intervalo_min, h.intervalo_inicio, h.intervalo_fim
      FROM public.horario_colaborador a
      JOIN public.horarios h      ON h.id = a.horario_id AND h.ativo = true
      JOIN public.colaboradores c ON c.id = a.colaborador_id AND c.ativo = true
     WHERE a.valido_de <= p_data
       AND (a.valido_ate IS NULL OR a.valido_ate >= p_data)
     ORDER BY a.colaborador_id, a.valido_de DESC
  ), pic AS (
    SELECT p.colaborador_id, p.obra_id, p.tipo,
           COALESCE(p.hora_final_validada, p.timestamp_dispositivo) AS hora
      FROM public.picagens p
     WHERE p.resultado = 'AUTORIZADA'
       AND p.colaborador_id IN (SELECT colaborador_id FROM hc)
       AND (COALESCE(p.hora_final_validada, p.timestamp_dispositivo) AT TIME ZONE 'Europe/Lisbon')::date = p_data
  ), es AS (
    SELECT colaborador_id, tipo, hora,
           lead(tipo) OVER w AS tipo_seg, lead(hora) OVER w AS hora_seg
      FROM pic WHERE tipo IN ('ENTRADA', 'SAIDA')
    WINDOW w AS (PARTITION BY colaborador_id ORDER BY hora)
  ), pz AS (
    SELECT colaborador_id, tipo, hora,
           lead(tipo) OVER w AS tipo_seg, lead(hora) OVER w AS hora_seg
      FROM pic WHERE tipo IN ('PAUSA_INI', 'PAUSA_FIM')
    WINDOW w AS (PARTITION BY colaborador_id ORDER BY hora)
  ), trab AS (
    SELECT es.colaborador_id,
           sum(extract(epoch FROM es.hora_seg - es.hora))::numeric / 3600 AS h,
           bool_or(
             (es.hora AT TIME ZONE 'Europe/Lisbon')::date = (es.hora_seg AT TIME ZONE 'Europe/Lisbon')::date
             AND (es.hora     AT TIME ZONE 'Europe/Lisbon')::time <= hc.intervalo_inicio
             AND (es.hora_seg AT TIME ZONE 'Europe/Lisbon')::time >= hc.intervalo_fim
           ) AS cobre_intervalo
      FROM es JOIN hc ON hc.colaborador_id = es.colaborador_id
     WHERE es.tipo = 'ENTRADA' AND es.tipo_seg = 'SAIDA'
     GROUP BY es.colaborador_id
  ), pausas AS (
    SELECT colaborador_id, sum(extract(epoch FROM hora_seg - hora))::numeric / 3600 AS h
      FROM pz WHERE tipo = 'PAUSA_INI' AND tipo_seg = 'PAUSA_FIM'
     GROUP BY colaborador_id
  ), obra_dia AS (
    SELECT DISTINCT ON (colaborador_id) colaborador_id, obra_id
      FROM pic WHERE tipo = 'ENTRADA'
     ORDER BY colaborador_id, hora
  ), calc AS (
    SELECT hc.colaborador_id, od.obra_id,
           CASE
             WHEN EXISTS (SELECT 1 FROM public.feriados_excecoes f WHERE f.data = p_data) THEN 0
             WHEN NOT (EXTRACT(isodow FROM p_data)::int = ANY(hc.dias_semana)) THEN 0
             ELSE hc.periodo_diario_h
           END::numeric AS prev,
           GREATEST(0, round(
             COALESCE(t.h, 0) - COALESCE(pa.h, 0)
             - CASE
                 WHEN hc.intervalo_min IS NOT NULL AND COALESCE(t.cobre_intervalo, false)
                      AND NOT EXISTS (SELECT 1 FROM pic x WHERE x.colaborador_id = hc.colaborador_id
                                         AND x.tipo IN ('PAUSA_INI', 'PAUSA_FIM'))
                 THEN hc.intervalo_min::numeric / 60
                 ELSE 0
               END, 2)) AS efe
      FROM hc
      LEFT JOIN trab t      ON t.colaborador_id  = hc.colaborador_id
      LEFT JOIN pausas pa   ON pa.colaborador_id = hc.colaborador_id
      LEFT JOIN obra_dia od ON od.colaborador_id = hc.colaborador_id
  )
  INSERT INTO public.resumo_assiduidade_dia (
    colaborador_id, data, obra_id, horas_previstas, horas_efetivas,
    desvio, horas_supl_propostas, horas_supl_validadas
  )
  SELECT colaborador_id, p_data, obra_id, prev, efe,
         efe - prev, GREATEST(efe - prev, 0), NULL
    FROM calc
  ON CONFLICT (colaborador_id, data) DO UPDATE SET
    obra_id              = EXCLUDED.obra_id,
    horas_previstas      = EXCLUDED.horas_previstas,
    horas_efetivas       = EXCLUDED.horas_efetivas,
    desvio               = EXCLUDED.desvio,
    horas_supl_propostas = EXCLUDED.horas_supl_propostas;
END;
$$;

-- Só pg_cron (como em 20260929000000); o site não a chama
REVOKE ALL ON FUNCTION public.calcular_resumo_dia(date) FROM PUBLIC, anon, authenticated;

-- ROLLBACK
-- DROP TRIGGER IF EXISTS trg_picagem_normalizar_insert ON public.picagens;
-- DROP FUNCTION IF EXISTS public._picagem_normalizar_insert();
-- DROP TRIGGER IF EXISTS trg_horario_colaborador_fechar_anterior ON public.horario_colaborador;
-- DROP FUNCTION IF EXISTS public._horario_colaborador_fechar_anterior();
-- Repor _registar_picagem_geofence_impl: recriar com o corpo de registar_picagem_geofence em
--   20260916200000_fase5_geofence.sql (sem o bloco de _picagem_dentro_do_desvio e sem
--   timestamp_servidor/desvio_relogio_s no INSERT), mantendo o nome _impl e o REVOKE acima.
-- DROP FUNCTION IF EXISTS public._picagem_dentro_do_desvio(timestamptz);  -- só depois de repor o _impl
-- Repor calcular_resumo_dia: recriar com o corpo de 20260916000000_fase2_horarios.sql
--   (horas_efetivas = 0, sem obra_id, JOIN sem DISTINCT ON), com SET search_path = public
--   e o mesmo REVOKE ALL … FROM PUBLIC, anon, authenticated.
