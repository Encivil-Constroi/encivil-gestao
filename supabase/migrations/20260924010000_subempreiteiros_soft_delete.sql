-- ------------------------------------------------------------
-- Soft delete para subempreiteiros
-- Coluna ativo (default true) + RPC arquivar_subempreiteiro
-- A RLS existente bloqueia UPDATE direto em linhas 'validado',
-- por isso o arquivo é feito via RPC SECURITY DEFINER.
-- ------------------------------------------------------------

ALTER TABLE public.subempreiteiros
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_subempreiteiros_ativo
  ON public.subempreiteiros (ativo);

-- ------------------------------------------------------------
-- RPC arquivar_subempreiteiro
-- Permite admin + gestor arquivarem contratações validadas.
-- SECURITY DEFINER contorna a RLS que bloqueia UPDATE em
-- linhas com estado = 'validado'.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.arquivar_subempreiteiro(p_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'gestor')
  ) THEN
    RAISE EXCEPTION 'Apenas administradores e gestores podem arquivar contratações.';
  END IF;

  UPDATE subempreiteiros SET ativo = false WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contratação não encontrada.';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.arquivar_subempreiteiro(UUID) TO authenticated;
