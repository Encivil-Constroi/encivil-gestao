-- ================================================================
-- ENCIVIL — Integração bomba Polo 2 com Shelly Pro 3
--
-- Adiciona controlo físico da bomba via relay (contato seco O1):
--   1. Chefe autoriza no app → RPC gera token de ativação (TTL 5 min)
--   2. Shelly faz polling à Edge Function pump-status a cada 5s
--   3. Shelly recebe token → ativa O1 por 180s → bomba abre
--   4. Token marcado como consumido (uso único)
--
-- Apenas pedidos com tipo_fonte = 'POLO2' activam a bomba.
-- CARRINHA e POSTO_RUA passam pelo fluxo existente sem alteração.
-- ================================================================

-- ── 1. Colunas de controlo da bomba ────────────────────────────────────────────

ALTER TABLE public.comb_abastecimentos_pendentes
  ADD COLUMN IF NOT EXISTS pump_auth_token      UUID         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pump_auth_expires_at TIMESTAMPTZ  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pump_activated_at    TIMESTAMPTZ  DEFAULT NULL;

-- Índice para o polling do Shelly (queries frequentes, dataset pequeno)
CREATE INDEX IF NOT EXISTS idx_comb_pend_pump_poll
  ON public.comb_abastecimentos_pendentes (pump_auth_expires_at ASC)
  WHERE pump_auth_token IS NOT NULL
    AND pump_activated_at IS NULL;

-- ── 2. Atualizar autorizar_abastecimento ────────────────────────────────────────
-- Passa a gerar pump_auth_token + TTL quando tipo_fonte = 'POLO2'

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
  SET
    estado = 'AUTORIZADO',
    -- Gera token de bomba apenas para a Polo 2; outros tipos ficam NULL
    pump_auth_token      = CASE WHEN tipo_fonte = 'POLO2'
                                THEN gen_random_uuid()
                                ELSE NULL END,
    pump_auth_expires_at = CASE WHEN tipo_fonte = 'POLO2'
                                THEN NOW() + INTERVAL '5 minutes'
                                ELSE NULL END
  WHERE id = p_id
    AND estado = 'AGUARDA_AUTORIZACAO';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado ou já processado: %', p_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.autorizar_abastecimento(uuid) TO authenticated;
