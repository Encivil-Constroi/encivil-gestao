-- Patch: corrige política RLS colab_write em colaboradores
-- Causa do bug: auth.jwt() ->> 'role' retorna sempre 'authenticated' (papel Supabase
-- interno), não o papel da app ('admin'/'gestor'). O resultado era que NENHUM utilizador
-- conseguia criar, editar ou arquivar colaboradores em produção.
-- Solução: usar public.auth_role() (SECURITY DEFINER, lê da tabela profiles).

DROP POLICY IF EXISTS "colab_write" ON public.colaboradores;

CREATE POLICY "colab_write" ON public.colaboradores
  FOR ALL TO authenticated
  USING (public.auth_role() IN ('admin', 'gestor'))
  WITH CHECK (public.auth_role() IN ('admin', 'gestor'));
