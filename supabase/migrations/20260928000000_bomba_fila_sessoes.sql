-- ================================================================
-- ENCIVIL — Bomba Polo 2: fila de pedidos + histórico de sessões
--
-- 1. pump_poll(): toda a decisão da bomba numa única transação com lock
--    (STOP, fecho de sessão, fila, autorização). A Edge Function só a chama.
--    Um segundo pedido autorizado espera que o relé desligue — antes ligava
--    por cima do primeiro e o "Terminei" de um cortava o outro.
-- 2. pump_sessoes: quem usou a bomba, quem autorizou, quanto tempo e como
--    parou. Sobrevive à aprovação (o pedido pendente é apagado nessa altura).
-- 3. comb_abastecimentos.tipo_fonte: origem do abastecimento aprovado.
--
-- APLICAR: SQL Editor do Supabase Dashboard
-- ================================================================

-- ── Pedidos: quem e quando autorizou (ordem da fila) ──────────────────────────

ALTER TABLE public.comb_abastecimentos_pendentes
  ADD COLUMN IF NOT EXISTS autorizado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS autorizado_em  TIMESTAMPTZ;

ALTER TABLE public.comb_abastecimentos
  ADD COLUMN IF NOT EXISTS tipo_fonte TEXT
    CONSTRAINT ck_abast_tipo_fonte CHECK (tipo_fonte IN ('POLO2', 'CARRINHA', 'POSTO_RUA'));

-- ── Sessões da bomba ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pump_sessoes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pump_id              TEXT NOT NULL,
  -- Sem FK: o pedido é apagado quando aprovado
  pedido_id            UUID NOT NULL,
  veiculo_id           UUID REFERENCES public.comb_veiculos(id) ON DELETE SET NULL,
  veiculo_nome         TEXT,
  funcionario_nome     TEXT,
  autorizado_por       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  segundos_autorizados INT NOT NULL,
  inicio_em            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fim_em               TIMESTAMPTZ,
  motivo_fim           TEXT CHECK (motivo_fim IN ('TEMPO', 'TERMINEI', 'EMERGENCIA', 'INTERROMPIDO')),
  abastecimento_id     UUID REFERENCES public.comb_abastecimentos(id) ON DELETE SET NULL
);

-- Nunca duas sessões abertas na mesma bomba
CREATE UNIQUE INDEX IF NOT EXISTS uq_pump_sessao_ativa
  ON public.pump_sessoes (pump_id) WHERE fim_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_pump_sessoes_inicio ON public.pump_sessoes (inicio_em DESC);
CREATE INDEX IF NOT EXISTS idx_pump_sessoes_pedido ON public.pump_sessoes (pedido_id);

ALTER TABLE public.pump_sessoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pump_sessoes_select_combustivel" ON public.pump_sessoes;
CREATE POLICY "pump_sessoes_select_combustivel" ON public.pump_sessoes
  FOR SELECT TO authenticated
  USING (public.pode_escrever('combustivel'));

GRANT SELECT                 ON TABLE public.pump_sessoes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pump_sessoes TO service_role;

-- ── Máquina de estados da bomba (chamada pela Edge Function pump-status) ─────

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

  -- Um poll de cada vez por bomba
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

  -- 1. STOP. Todos os comandos são consumidos; só atuam os recentes que são
  --    corte de emergência ou o "Terminei" da sessão ATIVA (um "Terminei"
  --    atrasado de uma sessão já fechada não corta a do motorista seguinte)
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

    -- relay_on NULL = firmware que não reporta o relé: confia no tempo autorizado
    IF p_relay_on IS TRUE OR (p_relay_on IS NULL AND now() < v_fim) THEN
      -- Pedidos em fila não expiram enquanto esperam a vez
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
           -- Tolerância de 10s: o Shelly só reporta o relé desligado no poll seguinte
           motivo_fim = CASE WHEN now() >= v_fim - interval '10 seconds' THEN 'TEMPO' ELSE 'INTERROMPIDO' END
     WHERE id = v_sessao.id;
  END IF;

  -- 3. Relé ligado sem sessão (alguém o ligou na app Shelly): não autorizar por cima
  IF p_relay_on IS TRUE THEN
    RETURN jsonb_build_object('status', 'idle');
  END IF;

  -- 4. Próximo pedido autorizado, pela ordem de autorização
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

REVOKE EXECUTE ON FUNCTION public.pump_poll(text, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.pump_poll(text, boolean, boolean) TO service_role;

-- ── Autorizar: regista quem e quando (ordem da fila) ─────────────────────────

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

-- ── Rejeitar: se a bomba já estiver a trabalhar para este pedido, corta-a ────

CREATE OR REPLACE FUNCTION public.rejeitar_abastecimento(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.pode_escrever('combustivel') THEN
    RAISE EXCEPTION 'Sem permissão para rejeitar abastecimentos';
  END IF;

  UPDATE public.comb_abastecimentos_pendentes
     SET estado = 'REJEITADO'
   WHERE id = p_id
     AND estado IN ('AGUARDA_AUTORIZACAO', 'AUTORIZADO');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado ou já processado: %', p_id;
  END IF;

  IF EXISTS (SELECT 1 FROM public.pump_sessoes WHERE pedido_id = p_id AND fim_em IS NULL) THEN
    INSERT INTO public.pump_comandos (pump_id, comando, pedido_id, criado_por)
    VALUES ('POLO2', 'STOP', NULL, auth.uid());
  END IF;
END;
$$;

-- ── Aprovar: guarda a origem e liga a sessão ao abastecimento final ──────────

CREATE OR REPLACE FUNCTION public.aprovar_abastecimento_pendente(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pend     public.comb_abastecimentos_pendentes%ROWTYPE;
  v_abast_id UUID;
BEGIN
  IF NOT public.pode_escrever('combustivel') THEN
    RAISE EXCEPTION 'Sem permissão para aprovar abastecimentos';
  END IF;

  SELECT * INTO v_pend
    FROM public.comb_abastecimentos_pendentes
   WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registo pendente não encontrado: %', p_id;
  END IF;

  IF v_pend.estado NOT IN ('AGUARDA_APROVACAO', 'AGUARDA_AUTORIZACAO') THEN
    RAISE EXCEPTION 'Registo em estado inválido para aprovação: %', v_pend.estado;
  END IF;

  INSERT INTO public.comb_abastecimentos
    (veiculo_id, data, litros, custo_total, contador, local, responsavel, observacoes, foto_url, tipo_fonte)
  VALUES (
    v_pend.veiculo_id,
    v_pend.data,
    COALESCE(v_pend.litros, v_pend.litros_gemini, 0),
    COALESCE(v_pend.custo_total, v_pend.custo_gemini, 0),
    v_pend.contador,
    v_pend.local,
    v_pend.funcionario_nome,
    v_pend.observacoes,
    COALESCE(v_pend.foto_medidor_url, v_pend.foto_url),
    v_pend.tipo_fonte
  )
  RETURNING id INTO v_abast_id;

  UPDATE public.pump_sessoes SET abastecimento_id = v_abast_id WHERE pedido_id = p_id;

  DELETE FROM public.comb_abastecimentos_pendentes WHERE id = p_id;
END;
$$;

-- ── "Terminei": só atua sobre a sessão que está mesmo ativa ──────────────────
-- Idempotente: se a sessão do pedido já acabou, a bomba já está desligada para
-- ele — não é erro e não entra nenhum comando (não pode cortar o seguinte).

CREATE OR REPLACE FUNCTION public.parar_bomba(p_pedido_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_pedido_id IS NULL THEN
    IF auth.uid() IS NULL OR NOT public.pode_escrever('combustivel') THEN
      RAISE EXCEPTION 'Sem permissão para desligar a bomba';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.pump_sessoes WHERE pedido_id = p_pedido_id AND fim_em IS NULL
    ) OR EXISTS (
      SELECT 1 FROM public.pump_comandos WHERE pedido_id = p_pedido_id AND consumido_em IS NULL
    ) THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.pump_comandos (pump_id, comando, pedido_id, criado_por)
  VALUES ('POLO2', 'STOP', p_pedido_id, auth.uid());
END;
$$;

-- ── Página do motorista: saber se está em fila ───────────────────────────────

DROP FUNCTION IF EXISTS public.get_pend_estado_bomba(uuid);

CREATE FUNCTION public.get_pend_estado_bomba(p_id uuid)
RETURNS TABLE(estado text, pump_activated_at timestamptz, pump_max_seconds int, bomba_ocupada boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.estado,
         p.pump_activated_at,
         p.pump_max_seconds,
         p.tipo_fonte = 'POLO2' AND p.pump_activated_at IS NULL AND (
           EXISTS (SELECT 1 FROM public.pump_sessoes s WHERE s.pump_id = 'POLO2' AND s.fim_em IS NULL)
           OR COALESCE((SELECT h.relay_on FROM public.pump_heartbeat h WHERE h.pump_id = 'POLO2'), false)
         )
    FROM public.comb_abastecimentos_pendentes p
   WHERE p.id = p_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_pend_estado_bomba(uuid) TO anon, authenticated;

-- ── Painel do chefe: últimas sessões (RLS da tabela aplica-se) ──────────────

CREATE OR REPLACE FUNCTION public.sessoes_bomba(p_limite int DEFAULT 10)
RETURNS SETOF public.pump_sessoes
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT * FROM public.pump_sessoes
   ORDER BY inicio_em DESC
   LIMIT LEAST(GREATEST(p_limite, 1), 100);
$$;

REVOKE EXECUTE ON FUNCTION public.sessoes_bomba(int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sessoes_bomba(int) TO authenticated;
