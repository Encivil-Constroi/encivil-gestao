-- Exportação de dados laborais para o contabilista. Desde 20261008030000 o NIF
-- não pode ser lido diretamente de public.colaboradores (só via RPC); esta função
-- junta NIF e dados laborais, apenas para admin e gestor.

CREATE OR REPLACE FUNCTION public.contabilidade_dados_laborais()
RETURNS TABLE (
  colaborador_id uuid, numero_mecan text, nome text, nif text, cargo text, ativo boolean,
  niss text, iban text, data_admissao date, tipo_contrato text, data_fim_contrato date,
  categoria_profissional text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF COALESCE(public.auth_role()::text, '') NOT IN ('admin','gestor') THEN
    RAISE EXCEPTION 'Sem permissão para exportar dados laborais' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT c.id, c.numero_mecan, c.nome, c.nif, c.cargo, c.ativo,
         dl.niss, dl.iban, dl.data_admissao, dl.tipo_contrato, dl.data_fim_contrato,
         dl.categoria_profissional
  FROM public.colaboradores c
  LEFT JOIN public.colaboradores_dados_laborais dl ON dl.colaborador_id = c.id
  ORDER BY c.nome;
END $$;
REVOKE ALL ON FUNCTION public.contabilidade_dados_laborais() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilidade_dados_laborais() TO authenticated;

-- ROLLBACK
-- DROP FUNCTION IF EXISTS public.contabilidade_dados_laborais();
