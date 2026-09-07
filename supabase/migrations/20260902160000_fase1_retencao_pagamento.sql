-- ─── Fase I: Retenção de Garantia + Estado de Pagamento ───────────────────
-- Implementa controlo completo de retenções e pagamentos de autos de
-- subempreiteiros — obrigação contratual standard em construção civil PT.

-- ─── 1. Retenção de garantia na contratação ──────────────────────────────
ALTER TABLE public.subempreiteiros
  ADD COLUMN IF NOT EXISTS percentagem_retencao DECIMAL(5,2) NOT NULL DEFAULT 0
    CHECK (percentagem_retencao >= 0 AND percentagem_retencao <= 100);

COMMENT ON COLUMN public.subempreiteiros.percentagem_retencao IS
  'Percentagem de retenção de garantia aplicada a cada auto validado (0–100).';

-- ─── 2. Estado de pagamento dos autos de medição ─────────────────────────
ALTER TABLE public.autos_medicao
  ADD COLUMN IF NOT EXISTS estado_pagamento TEXT NOT NULL DEFAULT 'por_pagar'
    CHECK (estado_pagamento IN ('por_pagar', 'pago', 'em_atraso')),
  ADD COLUMN IF NOT EXISTS data_pagamento    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS referencia_pagamento TEXT;

-- Só autos validados podem ter estado de pagamento != por_pagar.
-- Autos em rascunho ficam sempre 'por_pagar' (irrelevante até validar).
ALTER TABLE public.autos_medicao
  ADD CONSTRAINT autos_pagamento_validado
    CHECK (estado_pagamento = 'por_pagar' OR estado = 'validado');

-- ─── 3. Tabela de liberações de retenção ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.liberacoes_retencao (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  subempreiteiro_id UUID        NOT NULL REFERENCES public.subempreiteiros(id) ON DELETE CASCADE,
  obra_id           UUID        REFERENCES public.obras(id),
  valor             DECIMAL(12,2) NOT NULL CHECK (valor > 0),
  data_liberacao    DATE        NOT NULL DEFAULT CURRENT_DATE,
  motivo            TEXT        NOT NULL DEFAULT 'outro'
    CHECK (motivo IN ('conclusao_obra', 'periodo_garantia', 'acordo_parcial', 'outro')),
  observacoes       TEXT,
  registado_por     UUID        REFERENCES public.profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.liberacoes_retencao IS
  'Registo de libertações parciais ou totais de retenção de garantia a subempreiteiros.';

-- ─── 4. RLS — liberações de retenção ─────────────────────────────────────
ALTER TABLE public.liberacoes_retencao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "liberacoes_retencao_select"
  ON public.liberacoes_retencao FOR SELECT TO authenticated USING (true);

CREATE POLICY "liberacoes_retencao_insert"
  ON public.liberacoes_retencao FOR INSERT TO authenticated
  WITH CHECK (public.auth_role() IN ('admin', 'gestor'));

CREATE POLICY "liberacoes_retencao_update"
  ON public.liberacoes_retencao FOR UPDATE TO authenticated
  USING (public.auth_role() IN ('admin', 'gestor'));

CREATE POLICY "liberacoes_retencao_delete"
  ON public.liberacoes_retencao FOR DELETE TO authenticated
  USING (public.auth_role() = 'admin');

-- ─── 5. GRANTs ───────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.liberacoes_retencao TO authenticated;

-- ─── 6. RPC: marcar auto como pago ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.marcar_auto_pago(
  p_auto_id     UUID,
  p_referencia  TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.auth_role() NOT IN ('admin', 'gestor') THEN
    RAISE EXCEPTION 'Sem permissão para marcar pagamento de auto';
  END IF;

  UPDATE public.autos_medicao
  SET
    estado_pagamento     = 'pago',
    data_pagamento       = NOW(),
    referencia_pagamento = NULLIF(TRIM(p_referencia), '')
  WHERE id = p_auto_id
    AND estado = 'validado'
    AND estado_pagamento != 'pago';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auto não encontrado, não está validado, ou já foi marcado como pago';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.marcar_auto_pago(UUID, TEXT) TO authenticated;

-- ─── 7. RPC: marcar auto em atraso ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.marcar_auto_em_atraso(p_auto_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.auth_role() NOT IN ('admin', 'gestor') THEN
    RAISE EXCEPTION 'Sem permissão para marcar auto em atraso';
  END IF;

  UPDATE public.autos_medicao
  SET estado_pagamento = 'em_atraso'
  WHERE id = p_auto_id
    AND estado = 'validado'
    AND estado_pagamento = 'por_pagar';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auto não encontrado, não está validado, ou já foi pago';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.marcar_auto_em_atraso(UUID) TO authenticated;

-- ─── 8. Índices de performance ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_liberacoes_retencao_subempreiteiro
  ON public.liberacoes_retencao(subempreiteiro_id);

CREATE INDEX IF NOT EXISTS idx_autos_medicao_estado_pagamento
  ON public.autos_medicao(estado_pagamento)
  WHERE estado = 'validado';
