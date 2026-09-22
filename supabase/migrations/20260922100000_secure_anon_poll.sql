-- ================================================================
-- ENCIVIL — Segurança: substituir anon SELECT por RPC SECURITY DEFINER
--
-- Problema anterior: policy anon SELECT usava USING (true), expondo
-- todos os registos de comb_abastecimentos_pendentes a qualquer cliente
-- anónimo, incluindo pump_auth_token e dados pessoais de todos os motoristas.
--
-- Solução: RPC SECURITY DEFINER que retorna apenas os campos necessários
-- para o polling de estado (AbastecimentoPublicPage) por ID específico.
-- ================================================================

-- ── 1. RPC para polling anon — só retorna estado + pump_activated_at por ID ──

CREATE OR REPLACE FUNCTION public.get_pend_estado_bomba(p_id uuid)
RETURNS TABLE(estado text, pump_activated_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    estado,
    pump_activated_at
  FROM public.comb_abastecimentos_pendentes
  WHERE id = p_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_pend_estado_bomba(uuid) TO anon;

-- ── 2. Remover policy anon SELECT demasiado permissiva ──────────────────────
-- A RPC acima substitui a necessidade de SELECT direto na tabela por anon.
-- Anon continua a poder fazer INSERT (para submeter pedidos via QR code).

DROP POLICY IF EXISTS "comb_pend_anon_select_by_id" ON public.comb_abastecimentos_pendentes;
