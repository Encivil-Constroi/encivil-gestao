-- ================================================================
-- ENCIVIL — Fix P2 Alto: SET search_path = public em funções SECURITY DEFINER
--
-- Funções SECURITY DEFINER sem SET search_path são vulneráveis a
-- search_path injection: se alguém criasse objetos num schema anterior
-- ao 'public', a função SECURITY DEFINER resolveria os seus próprios
-- objetos pelo schema injectado.
--
-- Nota: registar_emprestimo_ferramenta e registar_devolucao_ferramenta
-- já têm SET search_path em 20260715000002_atomic_signatures.sql (skip).
-- ================================================================

ALTER FUNCTION public.registar_movimento(
  UUID, tipo_movimento, NUMERIC, TEXT, TEXT, TEXT, UUID
) SET search_path = public;

ALTER FUNCTION public.validar_subempreiteiro(UUID)
  SET search_path = public;

ALTER FUNCTION public._upsert_alerta(uuid, uuid, text, numeric, numeric)
  SET search_path = public;

ALTER FUNCTION public.avaliar_regras_alerta()
  SET search_path = public;

ALTER FUNCTION public.calcular_resumo_dia(date)
  SET search_path = public;

ALTER FUNCTION public.classificar_e_aprender(UUID, JSONB)
  SET search_path = public;

ALTER FUNCTION public.lancar_fatura(UUID, TEXT)
  SET search_path = public;

ALTER FUNCTION public.custos_consolidados_por_obra(UUID, DATE, DATE)
  SET search_path = public;

-- criar_guia_transporte pertence ao módulo F8 (livro_obra) — aplicado quando F8 for instalado.
