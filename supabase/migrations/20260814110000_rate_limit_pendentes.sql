-- ================================================================
-- M4: Rate limiting para inserções anónimas de abastecimentos
--
-- A policy pend_anon_insert tinha WITH CHECK (true), permitindo
-- inserções ilimitadas. Agora usa uma função SECURITY DEFINER que
-- contorna o RLS para contar inserções reais da mesma viatura.
-- Limite: 3 inserções por viatura nos últimos 5 minutos.
-- ================================================================

CREATE OR REPLACE FUNCTION public.check_pend_rate_limit(p_veiculo_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT COUNT(*) < 3
    FROM public.comb_abastecimentos_pendentes
    WHERE veiculo_id = p_veiculo_id
      AND criado_em > now() - interval '5 minutes'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_pend_rate_limit(uuid) TO anon;

DROP POLICY IF EXISTS "pend_anon_insert" ON public.comb_abastecimentos_pendentes;

CREATE POLICY "pend_anon_insert"
  ON public.comb_abastecimentos_pendentes
  FOR INSERT TO anon
  WITH CHECK (public.check_pend_rate_limit(veiculo_id));
