-- ================================================================
-- ENCIVIL — Índices de performance + RPC produtos_em_alerta
--
-- APLICAR: colar no SQL Editor do Supabase e executar.
-- ================================================================

-- 1. Índice composto para queries de custo por obra
--    WHERE obra_id = $1 AND tipo = 'saida'
CREATE INDEX IF NOT EXISTS idx_movimentos_obra_tipo
  ON public.movimentos_stock(obra_id, tipo)
  WHERE obra_id IS NOT NULL;

-- 2. Índice parcial para ferramentas em atraso
--    WHERE estado = 'ativo' AND data_prevista_devolucao < hoje
CREATE INDEX IF NOT EXISTS idx_emprestimos_atrasados
  ON public.emprestimos_ferramentas(data_prevista_devolucao)
  WHERE estado = 'ativo' AND data_prevista_devolucao IS NOT NULL;

-- 3. Índice composto para dashboard de subempreiteiros
--    WHERE subempreiteiro_id = $1 AND estado = 'validado'
CREATE INDEX IF NOT EXISTS idx_autos_sub_estado
  ON public.autos_medicao(subempreiteiro_id, estado);

-- 4. RPC: produtos com stock em alerta (stock_atual <= stock_minimo)
--    Substitui a query que descarregava TODOS os produtos a cada 60s
--    para filtragem em JavaScript.
CREATE OR REPLACE FUNCTION public.produtos_em_alerta()
RETURNS TABLE(
  id         uuid,
  nome       text,
  unidade    text,
  stock_atual   integer,
  stock_minimo  integer
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT id, nome, unidade, stock_atual, stock_minimo
  FROM public.produtos
  WHERE ativo = true
    AND stock_atual <= stock_minimo
  ORDER BY stock_atual ASC;
$$;

GRANT EXECUTE ON FUNCTION public.produtos_em_alerta() TO authenticated;
