-- ================================================================
-- Checkup 2026-10-28 — lote BD-2: picagens e assiduidade
--   A1-04/A4-01  INSERT direto em picagens: quem não é admin/gestor deixa de gravar
--                picagens já AUTORIZADAS, com validação ou carimbo de servidor forjados.
--   A4-06        Geofence: só autoriza automaticamente com relógio a ≤ 5 min do servidor.
--   A4-05        Horários: a nova atribuição fecha a anterior; o resumo diário tolera
--                sobreposições antigas.
--   A4-04        horas efetivas e obra calculadas (turnos noturnos incluídos), recalculadas
--                quando o gestor valida e, no cron, nos últimos 14 dias.
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
-- Horas efetivas: picagens AUTORIZADAS (hora validada pelo gestor quando existe).
-- Cada ENTRADA cujo dia de Lisboa é p_data emparelha com a ENTRADA/SAIDA seguinte se
-- for SAIDA até 18 h depois (turnos noturnos e prolongamentos depois da meia-noite;
-- 18 h e não 16 h: um dia normal prolongado até à 01:00 são 17 h);
-- as horas contam no dia da ENTRADA, em tempo real (mudança de hora incluída).
-- Pausas: pares PAUSA_INI→PAUSA_FIM dentro de um turno contado; sem pausas picadas,
-- desconta o intervalo do horário se um turno o cobrir.
-- p_colaborador NULL = todos. horas_supl_validadas e validado_* nunca são tocados.
CREATE OR REPLACE FUNCTION public._resumo_assiduidade_calcular(p_data date, p_colaborador uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ini timestamptz := (p_data::timestamp AT TIME ZONE 'Europe/Lisbon');
  v_fim timestamptz := ((p_data + 1)::timestamp AT TIME ZONE 'Europe/Lisbon');
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
       AND (p_colaborador IS NULL OR a.colaborador_id = p_colaborador)
     ORDER BY a.colaborador_id, a.valido_de DESC
  ), pic AS (
    SELECT p.colaborador_id, p.obra_id, p.tipo,
           COALESCE(p.hora_final_validada, p.timestamp_dispositivo) AS hora
      FROM public.picagens p
     WHERE p.resultado = 'AUTORIZADA'
       AND p.colaborador_id IN (SELECT colaborador_id FROM hc)
       AND COALESCE(p.hora_final_validada, p.timestamp_dispositivo) >= v_ini
       AND COALESCE(p.hora_final_validada, p.timestamp_dispositivo) <  v_fim + interval '18 hours'
  ), es AS (
    SELECT colaborador_id, obra_id, tipo, hora,
           lead(tipo) OVER w AS tipo_seg, lead(hora) OVER w AS hora_seg
      FROM pic WHERE tipo IN ('ENTRADA', 'SAIDA')
    WINDOW w AS (PARTITION BY colaborador_id ORDER BY hora)
  ), turnos AS (
    SELECT colaborador_id, obra_id, hora AS ini, hora_seg AS fim
      FROM es
     WHERE tipo = 'ENTRADA' AND tipo_seg = 'SAIDA'
       AND hora < v_fim
       AND hora_seg - hora <= interval '18 hours'
  ), pz AS (
    SELECT colaborador_id, tipo, hora,
           lead(tipo) OVER w AS tipo_seg, lead(hora) OVER w AS hora_seg
      FROM pic WHERE tipo IN ('PAUSA_INI', 'PAUSA_FIM')
    WINDOW w AS (PARTITION BY colaborador_id ORDER BY hora)
  ), trab AS (
    SELECT t.colaborador_id,
           sum(extract(epoch FROM t.fim - t.ini))::numeric / 3600 AS h,
           bool_or(t.ini <= ((p_data + hc.intervalo_inicio) AT TIME ZONE 'Europe/Lisbon')
               AND t.fim >= ((p_data + hc.intervalo_fim)    AT TIME ZONE 'Europe/Lisbon')) AS cobre_intervalo
      FROM turnos t JOIN hc ON hc.colaborador_id = t.colaborador_id
     GROUP BY t.colaborador_id
  ), pausas AS (
    SELECT z.colaborador_id,
           sum(extract(epoch FROM z.hora_seg - z.hora))::numeric / 3600 AS h
      FROM pz z
     WHERE z.tipo = 'PAUSA_INI' AND z.tipo_seg = 'PAUSA_FIM'
       AND EXISTS (SELECT 1 FROM turnos t WHERE t.colaborador_id = z.colaborador_id
                      AND z.hora >= t.ini AND z.hora_seg <= t.fim)
     GROUP BY z.colaborador_id
  ), tem_pausa AS (
    SELECT DISTINCT z.colaborador_id
      FROM pic z JOIN turnos t ON t.colaborador_id = z.colaborador_id
     WHERE z.tipo IN ('PAUSA_INI', 'PAUSA_FIM') AND z.hora BETWEEN t.ini AND t.fim
  ), obra_dia AS (
    SELECT DISTINCT ON (colaborador_id) colaborador_id, obra_id
      FROM turnos ORDER BY colaborador_id, ini
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
                 WHEN hc.intervalo_min IS NOT NULL AND COALESCE(t.cobre_intervalo, false) AND tp.colaborador_id IS NULL
                 THEN hc.intervalo_min::numeric / 60
                 ELSE 0
               END, 2)) AS efe
      FROM hc
      LEFT JOIN trab t      ON t.colaborador_id  = hc.colaborador_id
      LEFT JOIN pausas pa   ON pa.colaborador_id = hc.colaborador_id
      LEFT JOIN tem_pausa tp ON tp.colaborador_id = hc.colaborador_id
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

REVOKE ALL ON FUNCTION public._resumo_assiduidade_calcular(date, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.calcular_resumo_dia(p_data date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._resumo_assiduidade_calcular(p_data, NULL);
END;
$$;

-- Só pg_cron (como em 20260929000000); o site não a chama
REVOKE ALL ON FUNCTION public.calcular_resumo_dia(date) FROM PUBLIC, anon, authenticated;

-- Cron: recalcula os últimos dias, para apanhar picagens validadas ou sincronizadas
-- depois do fecho (idempotente; não toca nas suplementares validadas)
CREATE OR REPLACE FUNCTION public.calcular_resumo_recentes(p_dias int DEFAULT 14)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  d date;
BEGIN
  FOR d IN SELECT g::date FROM generate_series(v_hoje - p_dias, v_hoje, interval '1 day') g LOOP
    PERFORM public._resumo_assiduidade_calcular(d, NULL);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.calcular_resumo_recentes(int) FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  PERFORM cron.schedule('calcular-resumo-assiduidade', '30 22 * * *', 'SELECT public.calcular_resumo_recentes(14)');
EXCEPTION WHEN others THEN
  RAISE NOTICE 'pg_cron não disponível — agendar manualmente.';
END $$;

-- Picagem que passa a (ou deixa de ser) AUTORIZADA, ou cuja hora muda, recalcula logo
-- o resumo desse colaborador: o dia da hora e o anterior (pode ser a SAIDA de um turno noturno).
CREATE OR REPLACE FUNCTION public._picagem_recalcular_resumo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hora timestamptz;
  d      date;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.resultado = 'AUTORIZADA' THEN
    v_hora := COALESCE(OLD.hora_final_validada, OLD.timestamp_dispositivo);
    FOR d IN SELECT DISTINCT x FROM unnest(ARRAY[
               (v_hora AT TIME ZONE 'Europe/Lisbon')::date,
               ((v_hora - interval '18 hours') AT TIME ZONE 'Europe/Lisbon')::date]) x LOOP
      PERFORM public._resumo_assiduidade_calcular(d, OLD.colaborador_id);
    END LOOP;
  END IF;
  IF NEW.resultado = 'AUTORIZADA' THEN
    v_hora := COALESCE(NEW.hora_final_validada, NEW.timestamp_dispositivo);
    FOR d IN SELECT DISTINCT x FROM unnest(ARRAY[
               (v_hora AT TIME ZONE 'Europe/Lisbon')::date,
               ((v_hora - interval '18 hours') AT TIME ZONE 'Europe/Lisbon')::date]) x LOOP
      PERFORM public._resumo_assiduidade_calcular(d, NEW.colaborador_id);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._picagem_recalcular_resumo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_picagem_recalcular_resumo_ins ON public.picagens;
CREATE TRIGGER trg_picagem_recalcular_resumo_ins
  AFTER INSERT ON public.picagens
  FOR EACH ROW WHEN (NEW.resultado = 'AUTORIZADA')
  EXECUTE FUNCTION public._picagem_recalcular_resumo();

DROP TRIGGER IF EXISTS trg_picagem_recalcular_resumo_upd ON public.picagens;
CREATE TRIGGER trg_picagem_recalcular_resumo_upd
  AFTER UPDATE OF resultado, hora_final_validada, timestamp_dispositivo, tipo, colaborador_id, obra_id ON public.picagens
  FOR EACH ROW WHEN (OLD.resultado = 'AUTORIZADA' OR NEW.resultado = 'AUTORIZADA')
  EXECUTE FUNCTION public._picagem_recalcular_resumo();

-- ROLLBACK
-- DROP TRIGGER IF EXISTS trg_picagem_recalcular_resumo_ins ON public.picagens;
-- DROP TRIGGER IF EXISTS trg_picagem_recalcular_resumo_upd ON public.picagens;
-- DROP FUNCTION IF EXISTS public._picagem_recalcular_resumo();
-- DROP TRIGGER IF EXISTS trg_picagem_normalizar_insert ON public.picagens;
-- DROP FUNCTION IF EXISTS public._picagem_normalizar_insert();
-- DROP TRIGGER IF EXISTS trg_horario_colaborador_fechar_anterior ON public.horario_colaborador;
-- DROP FUNCTION IF EXISTS public._horario_colaborador_fechar_anterior();
-- DO $$ BEGIN
--   PERFORM cron.schedule('calcular-resumo-assiduidade', '30 22 * * *', 'SELECT public.calcular_resumo_dia(CURRENT_DATE)');
-- EXCEPTION WHEN others THEN RAISE NOTICE 'pg_cron não disponível — agendar manualmente.';
-- END $$;
-- DROP FUNCTION IF EXISTS public.calcular_resumo_recentes(int);
-- CREATE OR REPLACE FUNCTION public.calcular_resumo_dia(p_data date)
-- RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- BEGIN
--   INSERT INTO public.resumo_assiduidade_dia (colaborador_id, data, horas_previstas, horas_efetivas,
--     desvio, horas_supl_propostas, horas_supl_validadas)
--   SELECT c.id, p_data,
--     CASE WHEN f.data IS NOT NULL THEN 0 WHEN NOT (EXTRACT(isodow FROM p_data)::int = ANY(h.dias_semana)) THEN 0 ELSE h.periodo_diario_h END,
--     0,
--     0 - CASE WHEN f.data IS NOT NULL THEN 0 WHEN NOT (EXTRACT(isodow FROM p_data)::int = ANY(h.dias_semana)) THEN 0 ELSE h.periodo_diario_h END,
--     0,
--     NULL
--   FROM public.colaboradores c
--   JOIN public.horario_colaborador hc ON hc.colaborador_id = c.id
--     AND hc.valido_de <= p_data AND (hc.valido_ate IS NULL OR hc.valido_ate >= p_data)
--   JOIN public.horarios h ON h.id = hc.horario_id AND h.ativo = true
--   LEFT JOIN public.feriados_excecoes f ON f.data = p_data
--   WHERE c.ativo = true
--   ON CONFLICT (colaborador_id, data) DO UPDATE SET
--     horas_previstas = EXCLUDED.horas_previstas, horas_efetivas = EXCLUDED.horas_efetivas,
--     desvio = EXCLUDED.desvio, horas_supl_propostas = EXCLUDED.horas_supl_propostas;
-- END; $$;
-- REVOKE ALL ON FUNCTION public.calcular_resumo_dia(date) FROM PUBLIC, anon, authenticated;
-- DROP FUNCTION IF EXISTS public._resumo_assiduidade_calcular(date, uuid);
-- CREATE OR REPLACE FUNCTION public._registar_picagem_geofence_impl(
--   p_colaborador_id uuid, p_obra_id uuid, p_tipo text, p_lat double precision, p_lon double precision,
--   p_precisao_m integer, p_timestamp_disp timestamp with time zone DEFAULT now())
-- RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- DECLARE obra public.obras%rowtype; pt geography; distancia float8; resultado text; nova_id uuid;
-- BEGIN
--   SELECT * INTO obra FROM public.obras WHERE id = p_obra_id;
--   pt := ST_MakePoint(p_lon, p_lat)::geography;
--   IF obra.geofence_tipo = 'RAIO' AND obra.geofence_centro IS NOT NULL THEN
--     distancia := ST_Distance(pt, obra.geofence_centro);
--     resultado := CASE WHEN distancia <= obra.geofence_raio_m THEN 'AUTORIZADA' ELSE 'PENDENTE_VALIDACAO' END;
--   ELSIF obra.geofence_tipo = 'POLIGONO' AND obra.geofence_poligono IS NOT NULL THEN
--     resultado := CASE WHEN ST_Within(pt::geometry, obra.geofence_poligono::geometry) THEN 'AUTORIZADA' ELSE 'PENDENTE_VALIDACAO' END;
--     distancia := ST_Distance(pt, obra.geofence_poligono);
--   ELSE
--     resultado := 'PENDENTE_VALIDACAO'; distancia := NULL;
--   END IF;
--   IF p_precisao_m > 50 THEN resultado := 'PENDENTE_VALIDACAO'; END IF;
--   INSERT INTO public.picagens (colaborador_id, obra_id, tipo, timestamp_dispositivo, posicao, precisao_m,
--     distancia_geofence_m, resultado, origem)
--   VALUES (p_colaborador_id, p_obra_id, p_tipo, p_timestamp_disp, pt, p_precisao_m,
--     CASE WHEN distancia IS NOT NULL THEN distancia::int ELSE NULL END, resultado, 'ONLINE')
--   RETURNING id INTO nova_id;
--   RETURN json_build_object('id', nova_id, 'resultado', resultado,
--     'distancia_m', CASE WHEN distancia IS NOT NULL THEN distancia::int ELSE NULL END);
-- END; $$;
-- REVOKE ALL ON FUNCTION public._registar_picagem_geofence_impl(uuid, uuid, text, double precision, double precision, integer, timestamp with time zone) FROM PUBLIC, anon, authenticated;
-- DROP FUNCTION IF EXISTS public._picagem_dentro_do_desvio(timestamptz);
