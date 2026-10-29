-- Falha rápido em vez de ficar à espera de locks de tráfego em produção.
SET lock_timeout = '5s';

-- ================================================================
-- Checkup 2026-10-28 — lote BD-8: picagens idempotentes (reenvio da fila offline)
--   FE-2 / A5-07  Uma picagem cuja resposta se perde (rede) volta à fila e é reenviada:
--                 sem identificador do cliente ficava duplicada.
--   Coluna picagens.client_id (uuid gerado no dispositivo, um por picagem). Com o mesmo
--   client_id e o mesmo colaborador, o reenvio não cria outra linha:
--     · INSERT direto (site, PostgREST): o trigger devolve NULL → 0 linhas, sem erro;
--     · RPC registar_picagem_geofence(..., p_client_id): devolve a picagem já gravada.
--   O mesmo client_id noutro colaborador é recusado (23505).
--   Sem client_id (site antigo) tudo fica como antes.
-- Idempotente. APLICAR: SQL Editor do Supabase Dashboard, depois de 20261028120700.
-- ================================================================

ALTER TABLE public.picagens ADD COLUMN IF NOT EXISTS client_id uuid;

-- Parcial: as picagens antigas e as do site antigo (NULL) não entram
CREATE UNIQUE INDEX IF NOT EXISTS picagens_client_id_key
  ON public.picagens (client_id) WHERE client_id IS NOT NULL;

-- A coluna fica coberta pelos GRANT de tabela (SELECT, INSERT, UPDATE) a authenticated
-- de 20261020130000; explícito para não depender disso se passarem a ser por coluna.
GRANT SELECT (client_id), INSERT (client_id) ON public.picagens TO authenticated;

-- ── Reenvio pelo INSERT direto ──────────────────────────────────────────────
-- SECURITY DEFINER: tem de ver a linha já gravada mesmo que a RLS a esconda (outro
-- colaborador), para recusar em vez de deixar o índice único dar um erro genérico.
-- O lock serializa reenvios simultâneos do mesmo client_id (separadores, retry).
CREATE OR REPLACE FUNCTION public._picagem_client_id_repetido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_colaborador uuid;
BEGIN
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('picagens.client_id'), hashtext(NEW.client_id::text));
  SELECT colaborador_id INTO v_colaborador FROM public.picagens WHERE client_id = NEW.client_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  IF v_colaborador = NEW.colaborador_id THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'Esta picagem já está registada noutro colaborador (identificador repetido)'
    USING ERRCODE = '23505';
END;
$$;

REVOKE ALL ON FUNCTION public._picagem_client_id_repetido() FROM PUBLIC, anon, authenticated;

-- Nome ordenado antes de trg_picagem_normalizar_insert: o repetido sai antes de normalizar
DROP TRIGGER IF EXISTS trg_picagem_client_id_repetido ON public.picagens;
CREATE TRIGGER trg_picagem_client_id_repetido
  BEFORE INSERT ON public.picagens
  FOR EACH ROW EXECUTE FUNCTION public._picagem_client_id_repetido();

-- ── RPC de geofence com p_client_id ─────────────────────────────────────────
-- Parâmetro novo com DEFAULT NULL: o site atual (7 argumentos) continua a funcionar.
-- A versão de 7 argumentos sai, senão o PostgREST não sabe qual escolher (PGRST203).
DROP FUNCTION IF EXISTS public.registar_picagem_geofence(uuid, uuid, text, double precision, double precision, integer, timestamp with time zone);
DROP FUNCTION IF EXISTS public._registar_picagem_geofence_impl(uuid, uuid, text, double precision, double precision, integer, timestamp with time zone);

-- Corpo de 20261028120200 (BD-2); muda só: client_id gravado e reenvio devolve a existente.
CREATE OR REPLACE FUNCTION public._registar_picagem_geofence_impl(
  p_colaborador_id uuid,
  p_obra_id        uuid,
  p_tipo           text,
  p_lat            double precision,
  p_lon            double precision,
  p_precisao_m     integer,
  p_timestamp_disp timestamp with time zone DEFAULT now(),
  p_client_id      uuid DEFAULT NULL
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
  v_existente record;
BEGIN
  IF p_client_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('picagens.client_id'), hashtext(p_client_id::text));
    SELECT id, colaborador_id, resultado, distancia_geofence_m INTO v_existente
      FROM public.picagens WHERE client_id = p_client_id;
    IF FOUND THEN
      IF v_existente.colaborador_id <> p_colaborador_id THEN
        RAISE EXCEPTION 'Esta picagem já está registada noutro colaborador (identificador repetido)'
          USING ERRCODE = '23505';
      END IF;
      RETURN json_build_object(
        'id',          v_existente.id,
        'resultado',   v_existente.resultado,
        'distancia_m', v_existente.distancia_geofence_m
      );
    END IF;
  END IF;

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
    distancia_geofence_m, resultado, origem, client_id
  ) VALUES (
    p_colaborador_id, p_obra_id, p_tipo,
    p_timestamp_disp, now(), v_desvio, pt, p_precisao_m,
    CASE WHEN distancia IS NOT NULL THEN distancia::int ELSE NULL END,
    v_resultado, 'ONLINE', p_client_id
  ) RETURNING id INTO nova_id;

  RETURN json_build_object(
    'id',          nova_id,
    'resultado',   v_resultado,
    'distancia_m', CASE WHEN distancia IS NOT NULL THEN distancia::int ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public._registar_picagem_geofence_impl(uuid, uuid, text, double precision, double precision, integer, timestamp with time zone, uuid)
  FROM PUBLIC, anon, authenticated;

-- Wrapper de 20260929000000 (guarda de permissão igual) com o parâmetro novo
CREATE OR REPLACE FUNCTION public.registar_picagem_geofence(
  p_colaborador_id uuid,
  p_obra_id        uuid,
  p_tipo           text,
  p_lat            double precision,
  p_lon            double precision,
  p_precisao_m     integer,
  p_timestamp_disp timestamp with time zone DEFAULT now(),
  p_client_id      uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.auth_role() IN ('admin', 'gestor')
    OR EXISTS (SELECT 1 FROM public.colaboradores c
                WHERE c.id = p_colaborador_id AND c.user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Sem permissão para registar picagens deste colaborador';
  END IF;
  RETURN public._registar_picagem_geofence_impl(
    p_colaborador_id, p_obra_id, p_tipo, p_lat, p_lon, p_precisao_m, p_timestamp_disp, p_client_id);
END;
$$;

REVOKE ALL     ON FUNCTION public.registar_picagem_geofence(uuid, uuid, text, double precision, double precision, integer, timestamp with time zone, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registar_picagem_geofence(uuid, uuid, text, double precision, double precision, integer, timestamp with time zone, uuid) TO authenticated;

RESET lock_timeout;

-- ROLLBACK
-- (o site novo, sem a coluna/parâmetro, volta a enviar sem client_id — fallback do FE-2b)
-- DROP FUNCTION IF EXISTS public.registar_picagem_geofence(uuid, uuid, text, double precision, double precision, integer, timestamp with time zone, uuid);
-- DROP FUNCTION IF EXISTS public._registar_picagem_geofence_impl(uuid, uuid, text, double precision, double precision, integer, timestamp with time zone, uuid);
-- -- e voltar a criar as versões de 7 argumentos: corpo de _registar_picagem_geofence_impl de
-- -- 20261028120200_checkup_picagens_assiduidade.sql e wrapper de 20260929000000_seguranca_rpcs_storage.sql §2,
-- -- com os mesmos REVOKE ALL ... FROM PUBLIC, anon(, authenticated) e GRANT EXECUTE ... TO authenticated.
-- DROP TRIGGER IF EXISTS trg_picagem_client_id_repetido ON public.picagens;
-- DROP FUNCTION IF EXISTS public._picagem_client_id_repetido();
-- DROP INDEX IF EXISTS public.picagens_client_id_key;
-- ALTER TABLE public.picagens DROP COLUMN IF EXISTS client_id;
