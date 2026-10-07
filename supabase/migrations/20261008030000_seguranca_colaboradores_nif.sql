-- =============================================================
-- ENCIVIL — NIF dos colaboradores (RGPD)
-- Antes: qualquer autenticado (incluindo motoristas) lia o NIF de todos.
-- Agora: a coluna nif não tem SELECT para authenticated (GRANT de coluna,
-- como no ADR-007); admin/gestor/o próprio obtêm-no por colaborador_nif().
-- A escrita (INSERT/UPDATE de nif) mantém-se pela policy colab_write.
-- ATENÇÃO a quem acrescentar colunas a colaboradores: fazer
--   GRANT SELECT (nova_coluna) ON public.colaboradores TO authenticated;
-- (o teste seguranca-colaboradores falha se faltar).
-- Publicar DEPOIS do site novo (o site antigo faz select('*')).
-- Inventário de views/funções que leem colaboradores: nenhuma devolve nif
-- (alertas_detalhados só usa c.nome; as RPCs com %ROWTYPE não o expõem).
-- =============================================================

DO $$
DECLARE v_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'colaboradores' AND column_name <> 'nif';
  EXECUTE 'REVOKE SELECT ON public.colaboradores FROM authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.colaboradores TO authenticated', v_cols);
END $$;

CREATE OR REPLACE FUNCTION public.colaborador_nif(p_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.nif FROM public.colaboradores c
   WHERE c.id = p_id
     AND (public.auth_role() IN ('admin', 'gestor') OR c.user_id = auth.uid())
$$;
REVOKE ALL ON FUNCTION public.colaborador_nif(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.colaborador_nif(uuid) TO authenticated;

-- ROLLBACK
-- GRANT SELECT ON public.colaboradores TO authenticated;
-- DROP FUNCTION IF EXISTS public.colaborador_nif(uuid);
