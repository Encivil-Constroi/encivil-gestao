-- ================================================================
-- ENCIVIL — Fix P1 Crítico: RLS em faturas_fornecedor / linhas_fatura
--           / regras_classificacao / storage faturas-fornecedor
--
-- Problema: policies usavam (auth.jwt() ->> 'user_role') que retorna
--   NULL no JWT do Supabase → nenhum utilizador conseguia escrever.
--   Mesmo bug corrigido em 20260814100000_fix_rls_colaboradores.sql.
--
-- Solução: substituir por public.auth_role() (SECURITY DEFINER,
--   lê o papel da tabela profiles).
-- ================================================================

-- ── faturas_fornecedor ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "faturas_insert" ON public.faturas_fornecedor;
DROP POLICY IF EXISTS "faturas_update" ON public.faturas_fornecedor;
DROP POLICY IF EXISTS "faturas_delete" ON public.faturas_fornecedor;

CREATE POLICY "faturas_insert" ON public.faturas_fornecedor
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_role() IN ('admin', 'gestor')
    AND criado_por = auth.uid()
  );

CREATE POLICY "faturas_update" ON public.faturas_fornecedor
  FOR UPDATE TO authenticated
  USING (public.auth_role() IN ('admin', 'gestor'));

CREATE POLICY "faturas_delete" ON public.faturas_fornecedor
  FOR DELETE TO authenticated
  USING (
    public.auth_role() IN ('admin', 'gestor')
    AND estado = 'RECEBIDA'
  );

-- ── linhas_fatura ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "linhas_insert" ON public.linhas_fatura;
DROP POLICY IF EXISTS "linhas_update" ON public.linhas_fatura;
DROP POLICY IF EXISTS "linhas_delete" ON public.linhas_fatura;

CREATE POLICY "linhas_insert" ON public.linhas_fatura
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_role() IN ('admin', 'gestor'));

CREATE POLICY "linhas_update" ON public.linhas_fatura
  FOR UPDATE TO authenticated
  USING (public.auth_role() IN ('admin', 'gestor'));

CREATE POLICY "linhas_delete" ON public.linhas_fatura
  FOR DELETE TO authenticated
  USING (public.auth_role() IN ('admin', 'gestor'));

-- ── regras_classificacao ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "regras_insert" ON public.regras_classificacao;
DROP POLICY IF EXISTS "regras_update" ON public.regras_classificacao;

CREATE POLICY "regras_insert" ON public.regras_classificacao
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_role() IN ('admin', 'gestor'));

CREATE POLICY "regras_update" ON public.regras_classificacao
  FOR UPDATE TO authenticated
  USING (public.auth_role() IN ('admin', 'gestor'));

-- ── Storage: bucket faturas-fornecedor ────────────────────────────────────

DROP POLICY IF EXISTS "storage_faturas_insert" ON storage.objects;
DROP POLICY IF EXISTS "storage_faturas_delete" ON storage.objects;

CREATE POLICY "storage_faturas_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'faturas-fornecedor'
    AND public.auth_role() IN ('admin', 'gestor')
  );

CREATE POLICY "storage_faturas_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'faturas-fornecedor'
    AND public.auth_role() IN ('admin', 'gestor')
  );
