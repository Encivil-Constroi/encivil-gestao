-- ================================================================
-- ENCIVIL — Novo fluxo de abastecimento com pré-autorização
--
-- Fluxo novo:
--   1. Motorista escaneia QR → escolhe tipo → pede autorização
--   2. Chefe recebe push → autoriza
--   3. Motorista abastece → tira foto (medidor ou talão)
--   4. Gemini lê a foto → extrai litros/custo
--   5. Registo completo → chefe aceita → entra em comb_abastecimentos
--
-- APLICAR: SQL Editor do Supabase Dashboard
-- ================================================================

-- ── 1. Alterações à tabela de pendentes ────────────────────────────────────────

-- Tipo de fonte de abastecimento
ALTER TABLE public.comb_abastecimentos_pendentes
  ADD COLUMN IF NOT EXISTS tipo_fonte TEXT NOT NULL DEFAULT 'POSTO_RUA'
    CONSTRAINT ck_pend_tipo_fonte CHECK (tipo_fonte IN ('POLO2', 'CARRINHA', 'POSTO_RUA'));

-- Estado do pedido no novo fluxo
ALTER TABLE public.comb_abastecimentos_pendentes
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'AGUARDA_AUTORIZACAO'
    CONSTRAINT ck_pend_estado CHECK (estado IN (
      'AGUARDA_AUTORIZACAO',  -- motorista pediu, chefe ainda não autorizou
      'AUTORIZADO',           -- chefe autorizou, motorista a abastecer
      'AGUARDA_APROVACAO',    -- motorista abasteceu e enviou foto
      'REJEITADO'             -- chefe rejeitou
    ));

-- Foto do medidor (Polo2 / Carrinha) ou talão (Posto de rua)
ALTER TABLE public.comb_abastecimentos_pendentes
  ADD COLUMN IF NOT EXISTS foto_medidor_url TEXT;

-- Litros e custo extraídos pela Gemini da foto
ALTER TABLE public.comb_abastecimentos_pendentes
  ADD COLUMN IF NOT EXISTS litros_gemini   NUMERIC(12, 3);
ALTER TABLE public.comb_abastecimentos_pendentes
  ADD COLUMN IF NOT EXISTS custo_gemini    NUMERIC(12, 2);

-- litros e custo_total passam a ser opcionais (preenchidos depois da foto)
ALTER TABLE public.comb_abastecimentos_pendentes
  ALTER COLUMN litros      DROP NOT NULL,
  ALTER COLUMN custo_total DROP NOT NULL;

-- Índice no estado para queries de pendentes
CREATE INDEX IF NOT EXISTS idx_comb_pend_estado
  ON public.comb_abastecimentos_pendentes(estado)
  WHERE estado IN ('AGUARDA_AUTORIZACAO', 'AGUARDA_APROVACAO');

-- ── 2. Tabela de subscrições push ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Utilizador gere as suas próprias subscrições
CREATE POLICY "push_sub_select_own" ON public.push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "push_sub_insert_own" ON public.push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "push_sub_delete_own" ON public.push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON public.push_subscriptions TO authenticated;

-- ── 3. RPC: autorizar_abastecimento ────────────────────────────────────────────
-- Chefe autoriza o pedido → estado passa para AUTORIZADO

CREATE OR REPLACE FUNCTION public.autorizar_abastecimento(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.pode_escrever('combustivel') THEN
    RAISE EXCEPTION 'Sem permissão para autorizar abastecimentos';
  END IF;

  UPDATE public.comb_abastecimentos_pendentes
  SET estado = 'AUTORIZADO'
  WHERE id = p_id
    AND estado = 'AGUARDA_AUTORIZACAO';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado ou já processado: %', p_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.autorizar_abastecimento(uuid) TO authenticated;

-- ── 4. RPC: rejeitar_abastecimento ─────────────────────────────────────────────

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
END;
$$;

GRANT EXECUTE ON FUNCTION public.rejeitar_abastecimento(uuid) TO authenticated;

-- ── 5. RPC: concluir_abastecimento ─────────────────────────────────────────────
-- Motorista submeteu foto → registo pronto para aprovação final

CREATE OR REPLACE FUNCTION public.concluir_abastecimento(
  p_id             uuid,
  p_litros         numeric,
  p_custo_total    numeric,
  p_foto_medidor   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Página pública (sem auth) → não verifica papel, mas verifica estado
  UPDATE public.comb_abastecimentos_pendentes
  SET
    estado           = 'AGUARDA_APROVACAO',
    litros_gemini    = p_litros,
    custo_gemini     = p_custo_total,
    foto_medidor_url = p_foto_medidor,
    litros           = p_litros,
    custo_total      = p_custo_total
  WHERE id = p_id
    AND estado = 'AUTORIZADO';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado ou não está autorizado: %', p_id;
  END IF;
END;
$$;

-- Anon pode concluir (motorista na página pública)
GRANT EXECUTE ON FUNCTION public.concluir_abastecimento(uuid, numeric, numeric, text) TO anon;
GRANT EXECUTE ON FUNCTION public.concluir_abastecimento(uuid, numeric, numeric, text) TO authenticated;

-- ── 6. RPC: aprovar_abastecimento_pendente (actualizar para novo fluxo) ────────
-- Agora só funciona sobre entradas AGUARDA_APROVACAO

CREATE OR REPLACE FUNCTION public.aprovar_abastecimento_pendente(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pend public.comb_abastecimentos_pendentes%ROWTYPE;
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

  -- Aceitar tanto entradas novas (AGUARDA_APROVACAO) como legado (sem estado definido)
  IF v_pend.estado NOT IN ('AGUARDA_APROVACAO', 'AGUARDA_AUTORIZACAO') THEN
    RAISE EXCEPTION 'Registo em estado inválido para aprovação: %', v_pend.estado;
  END IF;

  INSERT INTO public.comb_abastecimentos
    (veiculo_id, data, litros, custo_total, contador, local, responsavel, observacoes, foto_url)
  VALUES (
    v_pend.veiculo_id,
    v_pend.data,
    COALESCE(v_pend.litros, v_pend.litros_gemini, 0),
    COALESCE(v_pend.custo_total, v_pend.custo_gemini, 0),
    v_pend.contador,
    v_pend.local,
    v_pend.funcionario_nome,
    v_pend.observacoes,
    COALESCE(v_pend.foto_medidor_url, v_pend.foto_url)
  );

  DELETE FROM public.comb_abastecimentos_pendentes WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aprovar_abastecimento_pendente(uuid) TO authenticated;

-- ── 7. Anon pode ler o próprio pedido pendente por ID (para polling do estado) ─

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'comb_abastecimentos_pendentes'
      AND policyname = 'comb_pend_anon_select_by_id'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "comb_pend_anon_select_by_id"
        ON public.comb_abastecimentos_pendentes
        FOR SELECT
        TO anon
        USING (true)
    $p$;
  END IF;
END;
$$;
-- Nota: a tabela já deve ter policy anon para INSERT (criada anteriormente).
-- SELECT permite ao motorista fazer polling do estado sem autenticação.
