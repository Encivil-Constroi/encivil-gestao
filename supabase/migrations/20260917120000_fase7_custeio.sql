-- ─────────────────────────────────────────────────────────────────────────────
-- F7 — Custeio Consolidado por Obra
-- Adiciona orçamentos por categoria à tabela obras e cria a RPC que agrega
-- os custos de todas as fontes (materiais, mão de obra, combustível,
-- faturas de fornecedor, subempreiteiros) num único resultado JSON.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Colunas de orçamento por categoria na tabela obras
ALTER TABLE public.obras
  ADD COLUMN IF NOT EXISTS orcamento_materiais       NUMERIC,
  ADD COLUMN IF NOT EXISTS orcamento_mao_obra        NUMERIC,
  ADD COLUMN IF NOT EXISTS orcamento_combustivel     NUMERIC,
  ADD COLUMN IF NOT EXISTS orcamento_fornecedores    NUMERIC,
  ADD COLUMN IF NOT EXISTS orcamento_subempreiteiros NUMERIC;

-- 2. RPC principal — agrega as 5 fontes de custo num único round-trip
--    p_data_ini/fim com DEFAULT para facilitar testes sem datas.
CREATE OR REPLACE FUNCTION public.custos_consolidados_por_obra(
  p_obra_id   UUID,
  p_data_ini  DATE DEFAULT '2000-01-01',
  p_data_fim  DATE DEFAULT CURRENT_DATE
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_materiais    NUMERIC := 0;
  v_combustivel  NUMERIC := 0;
  v_mao_obra     NUMERIC := 0;
  v_fornecedores NUMERIC := 0;
  v_subempreit   NUMERIC := 0;
BEGIN
  -- Materiais: saídas de stock imputadas à obra × custo_unitario
  SELECT COALESCE(SUM(m.quantidade * COALESCE(p.custo_unitario, 0)), 0)
    INTO v_materiais
    FROM movimentos_stock m
    JOIN produtos p ON p.id = m.produto_id
   WHERE m.obra_id = p_obra_id
     AND m.tipo    = 'saida'
     AND m.created_at::date BETWEEN p_data_ini AND p_data_fim;

  -- Combustível: abastecimentos com obra_id no período
  SELECT COALESCE(SUM(custo_total), 0)
    INTO v_combustivel
    FROM comb_abastecimentos
   WHERE obra_id = p_obra_id
     AND data BETWEEN p_data_ini AND p_data_fim;

  -- Mão de obra: horas efetivas × custo/hora vigente na data (F2)
  SELECT COALESCE(SUM(r.horas_efetivas * COALESCE(c.custo_normal, 0)), 0)
    INTO v_mao_obra
    FROM resumo_assiduidade_dia r
    LEFT JOIN LATERAL (
      SELECT custo_normal
      FROM   custo_hora_colaborador
      WHERE  colaborador_id = r.colaborador_id
        AND  valido_de <= r.data
        AND  (valido_ate IS NULL OR valido_ate >= r.data)
      ORDER  BY valido_de DESC
      LIMIT  1
    ) c ON true
   WHERE r.obra_id = p_obra_id
     AND r.data BETWEEN p_data_ini AND p_data_fim;

  -- Faturas de fornecedor: linhas com destino OBRA ou SERVICO, fatura LANCADA (F6)
  -- Usa obra_id da fatura (o destino da linha classifica o tipo de custo, não a obra)
  SELECT COALESCE(SUM(l.total_linha), 0)
    INTO v_fornecedores
    FROM linhas_fatura l
    JOIN faturas_fornecedor f ON f.id = l.fatura_id
   WHERE f.obra_id   = p_obra_id
     AND l.destino   IN ('OBRA', 'SERVICO')
     AND f.estado    = 'LANCADA'
     AND COALESCE(f.data_fatura, f.data_recepcao)::date BETWEEN p_data_ini AND p_data_fim;

  -- Subempreiteiros: autos validados da obra no período
  SELECT COALESCE(SUM(am.valor_periodo), 0)
    INTO v_subempreit
    FROM autos_medicao am
    JOIN subempreiteiros s ON s.id = am.subempreiteiro_id
   WHERE s.obra_id       = p_obra_id
     AND am.estado       = 'validado'
     AND am.data_medicao BETWEEN p_data_ini AND p_data_fim;

  RETURN json_build_object(
    'materiais',       v_materiais,
    'combustivel',     v_combustivel,
    'mao_de_obra',     v_mao_obra,
    'fornecedores',    v_fornecedores,
    'subempreiteiros', v_subempreit,
    'total',           v_materiais + v_combustivel + v_mao_obra + v_fornecedores + v_subempreit
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.custos_consolidados_por_obra(UUID, DATE, DATE) TO authenticated;
