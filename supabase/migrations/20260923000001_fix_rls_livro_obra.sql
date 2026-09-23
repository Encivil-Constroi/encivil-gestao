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
--
-- Seguro se F8 ainda não foi aplicado: o DO block verifica existência.
-- ================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'registos_obra'
  ) THEN
    DROP POLICY IF EXISTS "reg_obra_upd" ON public.registos_obra;
    EXECUTE $p$
      CREATE POLICY "reg_obra_upd" ON public.registos_obra
        FOR UPDATE TO authenticated
        USING (public.auth_role() IN ('admin', 'gestor') OR autor_id = auth.uid())
    $p$;
  END IF;
END;
$$;
