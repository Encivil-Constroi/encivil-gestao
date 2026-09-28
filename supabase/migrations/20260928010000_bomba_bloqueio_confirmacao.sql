-- ================================================================
-- ENCIVIL — Bomba Polo 2: uso fora da app, confirmação de paragem, bloqueio
--
-- 1. Relé ligado sem sessão (app Shelly / Web UI) passa a ficar registado
--    como sessão MANUAL — visível no histórico e no cartão do chefe.
-- 2. get_pend_estado_bomba diz ao motorista se a bomba JÁ desligou de facto
--    (o Shelly reportou o relé desligado depois do fim da sessão).
-- 3. pump_config: bloqueio com motivo e horário permitido (hora de Portugal).
--    Garantido em três pontos: autorizar recusa, pump_poll não liga,
--    a página do motorista avisa antes do pedido.
--
-- APLICAR: SQL Editor do Supabase Dashboard
-- ================================================================

-- ── Sessões MANUAL ────────────────────────────────────────────────────────────

ALTER TABLE public.pump_sessoes
  ALTER COLUMN pedido_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'APP'
    CONSTRAINT ck_pump_sessao_origem CHECK (origem IN ('APP', 'MANUAL'));

-- ── Regras da bomba ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pump_config (
  pump_id        TEXT PRIMARY KEY,
  bloqueada      BOOLEAN NOT NULL DEFAULT false,
  motivo         TEXT,
  horario_inicio TIME,
  horario_fim    TIME,
  atualizado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_pump_horario_completo CHECK ((horario_inicio IS NULL) = (horario_fim IS NULL)),
  CONSTRAINT ck_pump_horario_valido   CHECK (horario_inicio IS DISTINCT FROM horario_fim OR horario_inicio IS NULL)
);

INSERT INTO public.pump_config (pump_id) VALUES ('POLO2') ON CONFLICT (pump_id) DO NOTHING;

ALTER TABLE public.pump_config ENABLE ROW LEVEL SECURITY;
-- Sem policies nem GRANTs: leitura via estado_bomba, escrita via definir_regras_bomba

-- NULL = pode trabalhar; texto = porque não pode
CREATE OR REPLACE FUNCTION public.bomba_bloqueio_motivo(p_pump_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN c.bloqueada THEN
      COALESCE(NULLIF(trim(c.motivo), ''), 'Bomba bloqueada pelo responsável')
    WHEN c.horario_inicio IS NOT NULL AND NOT (
      CASE WHEN c.horario_inicio < c.horario_fim
           THEN agora.t >= c.horario_inicio AND agora.t < c.horario_fim
           -- Janela que passa a meia-noite (ex.: 22:00–06:00)
           ELSE agora.t >= c.horario_inicio OR agora.t < c.horario_fim
      END
    ) THEN
      format('Fora do horário da bomba (%s–%s)',
             to_char(c.horario_inicio, 'HH24:MI'), to_char(c.horario_fim, 'HH24:MI'))
  END
  FROM public.pump_config c,
       LATERAL (SELECT (now() AT TIME ZONE 'Europe/Lisbon')::time AS t) agora
  WHERE c.pump_id = upper(p_pump_id);
$$;

REVOKE EXECUTE ON FUNCTION public.bomba_bloqueio_motivo(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.definir_regras_bomba(
  p_bloqueada      boolean,
  p_motivo         text,
  p_horario_inicio time,
  p_horario_fim    time
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.pode_escrever('combustivel') THEN
    RAISE EXCEPTION 'Sem permissão para alterar as regras da bomba';
  END IF;
  IF (p_horario_inicio IS NULL) <> (p_horario_fim IS NULL) THEN
    RAISE EXCEPTION 'Indique a hora de início e de fim, ou nenhuma';
  END IF;
  IF p_horario_inicio = p_horario_fim THEN
    RAISE EXCEPTION 'A hora de início e de fim não podem ser iguais';
  END IF;

  INSERT INTO public.pump_config
    (pump_id, bloqueada, motivo, horario_inicio, horario_fim, atualizado_por, atualizado_em)
  VALUES
    ('POLO2', p_bloqueada, NULLIF(trim(p_motivo), ''), p_horario_inicio, p_horario_fim, auth.uid(), now())
  ON CONFLICT (pump_id) DO UPDATE SET
    bloqueada      = EXCLUDED.bloqueada,
    motivo         = EXCLUDED.motivo,
    horario_inicio = EXCLUDED.horario_inicio,
    horario_fim    = EXCLUDED.horario_fim,
    atualizado_por = EXCLUDED.atualizado_por,
    atualizado_em  = EXCLUDED.atualizado_em;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.definir_regras_bomba(boolean, text, time, time) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.definir_regras_bomba(boolean, text, time, time) TO authenticated;

-- ── pump_poll: sessões MANUAL + respeita bloqueio/horário ────────────────────

CREATE OR REPLACE FUNCTION public.pump_poll(p_pump_id text, p_relay_on boolean, p_nivel boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pump     text := upper(p_pump_id);
  v_sessao   public.pump_sessoes%ROWTYPE;
  v_emerg    boolean;
  v_terminei boolean;
  v_fim      timestamptz;
  v_pedido   record;
  v_segundos int;
BEGIN
  IF v_pump IS DISTINCT FROM 'POLO2' THEN
    RETURN jsonb_build_object('status', 'idle');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pump_poll:' || v_pump));

  INSERT INTO public.pump_heartbeat (pump_id, last_seen_at, relay_on, nivel_alarme)
  VALUES (v_pump, now(), p_relay_on, p_nivel)
  ON CONFLICT (pump_id) DO UPDATE
    SET last_seen_at = EXCLUDED.last_seen_at,
        relay_on     = EXCLUDED.relay_on,
        nivel_alarme = EXCLUDED.nivel_alarme;

  SELECT * INTO v_sessao
    FROM public.pump_sessoes
   WHERE pump_id = v_pump AND fim_em IS NULL;

  -- 1. STOP: emergência, ou "Terminei" da sessão ATIVA
  WITH consumidos AS (
    UPDATE public.pump_comandos
       SET consumido_em = now()
     WHERE pump_id = v_pump AND consumido_em IS NULL
    RETURNING pedido_id, criado_em
  )
  SELECT coalesce(bool_or(pedido_id IS NULL), false),
         coalesce(bool_or(pedido_id = v_sessao.pedido_id), false)
    INTO v_emerg, v_terminei
    FROM consumidos
   WHERE criado_em > now() - interval '2 minutes';

  IF v_emerg OR v_terminei THEN
    UPDATE public.pump_sessoes
       SET fim_em = now(), motivo_fim = CASE WHEN v_emerg THEN 'EMERGENCIA' ELSE 'TERMINEI' END
     WHERE id = v_sessao.id;
    RETURN jsonb_build_object('status', 'stop');
  END IF;

  -- 2. Sessão ativa: ocupada enquanto o relé estiver ligado
  IF v_sessao.id IS NOT NULL THEN
    v_fim := v_sessao.inicio_em + make_interval(secs => v_sessao.segundos_autorizados);

    IF p_relay_on IS TRUE OR (p_relay_on IS NULL AND now() < v_fim) THEN
      UPDATE public.comb_abastecimentos_pendentes
         SET pump_auth_expires_at = now() + interval '2 minutes'
       WHERE tipo_fonte = v_pump AND estado = 'AUTORIZADO'
         AND pump_activated_at IS NULL
         AND pump_auth_expires_at > now()
         AND pump_auth_expires_at < now() + interval '2 minutes';
      RETURN jsonb_build_object('status', 'idle');
    END IF;

    UPDATE public.pump_sessoes
       SET fim_em     = LEAST(now(), v_fim),
           motivo_fim = CASE WHEN now() >= v_fim - interval '10 seconds' THEN 'TEMPO' ELSE 'INTERROMPIDO' END
     WHERE id = v_sessao.id;
  END IF;

  -- 3. Relé ligado sem sessão: ligado fora da app. Fica registado; nada liga por cima.
  --    3600s = corte automático configurado no próprio Shelly (auto_off)
  IF p_relay_on IS TRUE THEN
    INSERT INTO public.pump_sessoes (pump_id, origem, segundos_autorizados)
    VALUES (v_pump, 'MANUAL', 3600);
    RETURN jsonb_build_object('status', 'idle');
  END IF;

  -- 4. Bloqueada ou fora do horário: pedidos autorizados esperam (e expiram)
  IF public.bomba_bloqueio_motivo(v_pump) IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'idle');
  END IF;

  -- 5. Próximo pedido autorizado, pela ordem de autorização
  SELECT id, veiculo_id, veiculo_nome, funcionario_nome, autorizado_por, pump_max_seconds
    INTO v_pedido
    FROM public.comb_abastecimentos_pendentes
   WHERE tipo_fonte = v_pump AND estado = 'AUTORIZADO'
     AND pump_auth_token IS NOT NULL
     AND pump_activated_at IS NULL
     AND pump_auth_expires_at > now()
   ORDER BY autorizado_em NULLS LAST, criado_em
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'idle');
  END IF;

  v_segundos := LEAST(GREATEST(coalesce(v_pedido.pump_max_seconds, 180), 60), 3600);

  UPDATE public.comb_abastecimentos_pendentes
     SET pump_activated_at = now()
   WHERE id = v_pedido.id;

  INSERT INTO public.pump_sessoes
    (pump_id, pedido_id, veiculo_id, veiculo_nome, funcionario_nome, autorizado_por, segundos_autorizados)
  VALUES
    (v_pump, v_pedido.id, v_pedido.veiculo_id, v_pedido.veiculo_nome,
     v_pedido.funcionario_nome, v_pedido.autorizado_por, v_segundos);

  RETURN jsonb_build_object('status', 'authorized', 'seconds', v_segundos);
END;
$$;

-- ── Autorizar: recusa com o motivo se a bomba estiver bloqueada ──────────────

CREATE OR REPLACE FUNCTION public.autorizar_abastecimento(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo_fonte    TEXT;
  v_veiculo_id    UUID;
  v_pump_max_secs INT := 180;
  v_bloqueio      TEXT;
BEGIN
  IF NOT public.pode_escrever('combustivel') THEN
    RAISE EXCEPTION 'Sem permissão para autorizar abastecimentos';
  END IF;

  SELECT tipo_fonte, veiculo_id
    INTO v_tipo_fonte, v_veiculo_id
    FROM public.comb_abastecimentos_pendentes
   WHERE id = p_id
     AND estado = 'AGUARDA_AUTORIZACAO';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado ou já processado: %', p_id;
  END IF;

  IF v_tipo_fonte = 'POLO2' THEN
    v_bloqueio := public.bomba_bloqueio_motivo('POLO2');
    IF v_bloqueio IS NOT NULL THEN
      RAISE EXCEPTION '%', v_bloqueio;
    END IF;

    SELECT COALESCE(pump_max_seconds, 180)
      INTO v_pump_max_secs
      FROM public.comb_veiculos
     WHERE id = v_veiculo_id;
    v_pump_max_secs := COALESCE(v_pump_max_secs, 180);
  END IF;

  UPDATE public.comb_abastecimentos_pendentes
     SET estado               = 'AUTORIZADO',
         autorizado_por       = auth.uid(),
         autorizado_em        = now(),
         pump_auth_token      = CASE WHEN v_tipo_fonte = 'POLO2' THEN gen_random_uuid() ELSE NULL END,
         pump_auth_expires_at = CASE WHEN v_tipo_fonte = 'POLO2' THEN now() + interval '5 minutes' ELSE NULL END,
         pump_max_seconds     = CASE WHEN v_tipo_fonte = 'POLO2' THEN v_pump_max_secs ELSE pump_max_seconds END
   WHERE id = p_id;
END;
$$;

-- ── Estado da bomba (cartão do chefe + página do motorista) ─────────────────
-- Parte de pump_config: devolve as regras mesmo antes do primeiro contacto do Shelly

DROP FUNCTION IF EXISTS public.estado_bomba(text);

CREATE FUNCTION public.estado_bomba(p_pump_id text DEFAULT 'POLO2')
RETURNS TABLE(
  last_seen_at          timestamptz,
  segundos_sem_contacto int,
  relay_on              boolean,
  nivel_alarme          boolean,
  bloqueio_motivo       text,
  bloqueada             boolean,
  motivo                text,
  horario_inicio        time,
  horario_fim           time
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.last_seen_at,
         EXTRACT(EPOCH FROM (now() - h.last_seen_at))::int,
         h.relay_on,
         h.nivel_alarme,
         public.bomba_bloqueio_motivo(c.pump_id),
         c.bloqueada,
         c.motivo,
         c.horario_inicio,
         c.horario_fim
    FROM public.pump_config c
    LEFT JOIN public.pump_heartbeat h ON h.pump_id = c.pump_id
   WHERE c.pump_id = upper(p_pump_id);
$$;

GRANT EXECUTE ON FUNCTION public.estado_bomba(text) TO anon, authenticated;

-- ── Estado do pedido (página do motorista) ───────────────────────────────────

DROP FUNCTION IF EXISTS public.get_pend_estado_bomba(uuid);

CREATE FUNCTION public.get_pend_estado_bomba(p_id uuid)
RETURNS TABLE(
  estado               text,
  pump_activated_at    timestamptz,
  pump_max_seconds     int,
  bomba_ocupada        boolean,
  bloqueio_motivo      text,
  sessao_ativa         boolean,
  motivo_fim           text,
  desligada_confirmada boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.estado,
         p.pump_activated_at,
         p.pump_max_seconds,
         p.tipo_fonte = 'POLO2' AND p.pump_activated_at IS NULL AND (
           EXISTS (SELECT 1 FROM public.pump_sessoes s0 WHERE s0.pump_id = 'POLO2' AND s0.fim_em IS NULL)
           OR COALESCE(h.relay_on, false)
         ),
         CASE WHEN p.tipo_fonte = 'POLO2' THEN public.bomba_bloqueio_motivo('POLO2') END,
         s.id IS NOT NULL AND s.fim_em IS NULL,
         s.motivo_fim,
         -- Confirmação real: o Shelly reportou o relé desligado depois do fim da sessão
         s.fim_em IS NOT NULL AND h.relay_on IS FALSE AND h.last_seen_at >= s.fim_em
    FROM public.comb_abastecimentos_pendentes p
    LEFT JOIN public.pump_heartbeat h ON h.pump_id = 'POLO2'
    LEFT JOIN LATERAL (
      SELECT * FROM public.pump_sessoes s1
       WHERE s1.pedido_id = p.id
       ORDER BY s1.inicio_em DESC
       LIMIT 1
    ) s ON true
   WHERE p.id = p_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_pend_estado_bomba(uuid) TO anon, authenticated;
