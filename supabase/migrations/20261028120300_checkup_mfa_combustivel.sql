-- =============================================================
-- ENCIVIL — Checkup 2026-10-28, lote BD-3: MFA dos aprovadores e escrita de combustível
--
-- A1-03: pode_aprovar_combustivel() e _autor_designado() decidiam sem passar
--        pelo MFA: um admin/gestor com sessão aal1 (MFA obrigatório ligado)
--        continuava a aprovar abastecimentos, designar aprovadores, mudar preços
--        e escrever relatórios de obra. Passam a exigir NOT mfa_em_falta() —
--        a mesma regra de auth_role(): só morde quando seguranca_config o manda
--        e só a admin/gestor; os outros papéis (ex.: motorista aprovador) não mudam.
-- A4-07: DELETE direto em comb_abastecimentos_pendentes (e a RPC antiga
--        rejeitar_abastecimento_pendente) apagava pedidos em qualquer estado,
--        até com a bomba a correr. Nenhum ecrã usa: fica só o fluxo por RPC.
-- A4-12: UPDATE em comb_abastecimentos passa a ficar no audit_log (antes/depois).
--
-- APLICAR: SQL Editor do Supabase Dashboard
-- =============================================================

-- ── A1-03 ───────────────────────────────────────────────────────────────────
-- CREATE OR REPLACE mantém os GRANT/REVOKE existentes.
CREATE OR REPLACE FUNCTION public.pode_aprovar_combustivel()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(auth.uid() IS NOT NULL AND NOT public.mfa_em_falta() AND (
    EXISTS (SELECT 1 FROM public.comb_aprovadores WHERE user_id = auth.uid())
    OR (NOT EXISTS (SELECT 1 FROM public.comb_aprovadores) AND public.auth_role() = 'admin')
  ), false)
$$;

CREATE OR REPLACE FUNCTION public._autor_designado(p_obra_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    auth.uid() IS NOT NULL
    AND NOT public.mfa_em_falta()
    AND public.auth_role() NOT IN ('', 'mecanico', 'motorista')
    AND EXISTS (SELECT 1 FROM public.obra_autores a WHERE a.obra_id = p_obra_id AND a.user_id = auth.uid()),
    false)
$$;

-- ── A4-07 ───────────────────────────────────────────────────────────────────
-- As RPCs que removem pedidos (aprovar_abastecimento_pendente) são SECURITY DEFINER:
-- não dependem desta policy nem do GRANT DELETE.
DROP POLICY IF EXISTS "pend_auth_delete" ON public.comb_abastecimentos_pendentes;
REVOKE DELETE ON public.comb_abastecimentos_pendentes FROM authenticated, anon;

-- A função fica (types.ts gerado refere-a), mas deixa de ser chamável pela API.
DO $$
BEGIN
  IF to_regprocedure('public.rejeitar_abastecimento_pendente(uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rejeitar_abastecimento_pendente(uuid) FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- ── A4-12 ───────────────────────────────────────────────────────────────────
-- O DELETE já é auditado por trg_audit_del_abastecimentos; aqui só o UPDATE.
DROP TRIGGER IF EXISTS auditar_alteracao ON public.comb_abastecimentos;
CREATE TRIGGER auditar_alteracao AFTER UPDATE ON public.comb_abastecimentos
  FOR EACH ROW EXECUTE FUNCTION public.auditar_alteracao();

-- ROLLBACK
-- Reabre o bypass de MFA e o DELETE sem rasto: preferir uma correção progressiva.
-- DROP TRIGGER IF EXISTS auditar_alteracao ON public.comb_abastecimentos;
-- GRANT EXECUTE ON FUNCTION public.rejeitar_abastecimento_pendente(uuid) TO authenticated;
-- GRANT DELETE ON public.comb_abastecimentos_pendentes TO authenticated;
-- CREATE POLICY "pend_auth_delete" ON public.comb_abastecimentos_pendentes
--   FOR DELETE TO authenticated USING (public.pode_escrever('combustivel'));
-- CREATE OR REPLACE FUNCTION public._autor_designado(p_obra_id uuid)
-- RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
--   SELECT COALESCE(auth.uid() IS NOT NULL AND public.auth_role() NOT IN ('', 'mecanico', 'motorista')
--     AND EXISTS (SELECT 1 FROM public.obra_autores a WHERE a.obra_id = p_obra_id AND a.user_id = auth.uid()), false)
-- $$;
-- CREATE OR REPLACE FUNCTION public.pode_aprovar_combustivel()
-- RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
--   SELECT COALESCE(auth.uid() IS NOT NULL AND (
--     EXISTS (SELECT 1 FROM public.comb_aprovadores WHERE user_id = auth.uid())
--     OR (NOT EXISTS (SELECT 1 FROM public.comb_aprovadores) AND public.auth_role() = 'admin')), false)
-- $$;
