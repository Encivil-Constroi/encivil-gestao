-- ================================================================
-- ENCIVIL — Tempo máximo de bomba configurável por viatura
--
-- Cada viatura tem o seu próprio limite de tempo de ativação do Shelly.
-- Exemplos:
--   Carrinha 50L  → 5 min  (300s)
--   Camião 200L   → 15 min (900s)
--   Gerador       → 3 min  (180s, default)
--
-- Fluxo:
--   1. Admin configura pump_max_seconds em cada viatura no formulário
--   2. Chefe autoriza → RPC copia valor da viatura para o pedido pendente
--   3. Shelly faz poll à Edge Function → recebe seconds dinâmico
--   4. Shelly abre relay pelo tempo correto da viatura
-- ================================================================

-- ── 1. Coluna de configuração por viatura ──────────────────────────────────────

ALTER TABLE public.comb_veiculos
  ADD COLUMN IF NOT EXISTS pump_max_seconds INT NOT NULL DEFAULT 180
    CHECK (pump_max_seconds BETWEEN 60 AND 3600);

COMMENT ON COLUMN public.comb_veiculos.pump_max_seconds IS
  'Tempo máximo (segundos) que o Shelly mantém a bomba aberta para esta viatura. '
  'Mínimo: 60s (1 min), Máximo: 3600s (60 min). Default: 180s (3 min).';

-- ── 2. Coluna no pedido pendente — copiada da viatura na autorização ───────────
-- Evita JOIN na Edge Function (caminho crítico de polling), e serve como
-- registo imutável do tempo que foi aprovado para aquele abastecimento específico.

ALTER TABLE public.comb_abastecimentos_pendentes
  ADD COLUMN IF NOT EXISTS pump_max_seconds INT NOT NULL DEFAULT 180;

COMMENT ON COLUMN public.comb_abastecimentos_pendentes.pump_max_seconds IS
  'Tempo aprovado para este pedido (segundos), copiado de comb_veiculos.pump_max_seconds '
  'no momento da autorização pelo responsável.';

-- ── 3. Atualizar RPC autorizar_abastecimento ───────────────────────────────────
-- Lê pump_max_seconds da viatura e copia para o pedido antes de gerar o token.

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

  -- Lê tipo e viatura antes de atualizar (evita sub-select no UPDATE)
  SELECT tipo_fonte, veiculo_id
    INTO v_tipo_fonte, v_veiculo_id
    FROM public.comb_abastecimentos_pendentes
   WHERE id = p_id
     AND estado = 'AGUARDA_AUTORIZACAO';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado ou já processado: %', p_id;
  END IF;

  -- Para POLO2: ler o tempo configurado na viatura
  IF v_tipo_fonte = 'POLO2' THEN
    SELECT COALESCE(pump_max_seconds, 180)
      INTO v_pump_max_secs
      FROM public.comb_veiculos
     WHERE id = v_veiculo_id;
    -- Se a viatura foi entretanto arquivada/eliminada mantém o default
    v_pump_max_secs := COALESCE(v_pump_max_secs, 180);
  END IF;

  UPDATE public.comb_abastecimentos_pendentes
     SET estado               = 'AUTORIZADO',
         pump_auth_token      = CASE WHEN v_tipo_fonte = 'POLO2'
                                     THEN gen_random_uuid() ELSE NULL END,
         pump_auth_expires_at = CASE WHEN v_tipo_fonte = 'POLO2'
                                     THEN NOW() + INTERVAL '5 minutes' ELSE NULL END,
         -- Registar o tempo aprovado (POLO2 usa valor da viatura; outros ficam no default)
         pump_max_seconds     = CASE WHEN v_tipo_fonte = 'POLO2'
                                     THEN v_pump_max_secs ELSE pump_max_seconds END
   WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.autorizar_abastecimento(uuid) TO authenticated;
