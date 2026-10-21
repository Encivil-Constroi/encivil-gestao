-- Picagens: só se insere a própria picagem (ou admin/gestor em nome de outro).
-- Antes: WITH CHECK (true) deixava qualquer autenticado picar por qualquer colaborador.
-- Site novo com BD antiga: sem alteração de comportamento no cliente (as picagens próprias passam).

DROP POLICY IF EXISTS "picagens_insert" ON public.picagens;
CREATE POLICY "picagens_insert" ON public.picagens FOR INSERT TO authenticated
  WITH CHECK (
    colaborador_id IN (SELECT id FROM public.colaboradores WHERE user_id = auth.uid())
    OR public.auth_role() IN ('admin', 'gestor')
  );

GRANT SELECT, INSERT, UPDATE ON TABLE public.picagens TO authenticated;

-- ROLLBACK
-- DROP POLICY IF EXISTS "picagens_insert" ON public.picagens;
-- CREATE POLICY "picagens_insert" ON public.picagens FOR INSERT TO authenticated WITH CHECK (true);
