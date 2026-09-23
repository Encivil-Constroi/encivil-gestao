-- ================================================================
-- ENCIVIL — Fix P1 Crítico: RLS em registos_obra
--
-- Problema: policy reg_obra_upd usava (auth.jwt() ->> 'role') que
--   retorna 'authenticated' (papel PostgreSQL), não o papel da app.
--   Resultado: admin/gestor não conseguiam actualizar registos de obra
--   que não tivessem criado eles próprios.
--
-- Solução: substituir por public.auth_role() (SECURITY DEFINER,
--   lê o papel da tabela profiles).
-- ================================================================

DROP POLICY IF EXISTS "reg_obra_upd" ON public.registos_obra;

CREATE POLICY "reg_obra_upd" ON public.registos_obra
  FOR UPDATE TO authenticated
  USING (public.auth_role() IN ('admin', 'gestor') OR autor_id = auth.uid());
