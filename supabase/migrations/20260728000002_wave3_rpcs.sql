-- Wave 3: server-side RPCs to eliminate race condition and client-side aggregation

-- 1. criar_auto_rpc: atomically assigns the next sequential number for a subcontractor
--    and inserts the auto_medicao row. Uses advisory lock to prevent duplicate numbers
--    under concurrent creates for the same subcontractor.
CREATE OR REPLACE FUNCTION public.criar_auto_rpc(
  p_sub_id          UUID,
  p_data            DATE,
  p_percentagem     NUMERIC,
  p_valor           NUMERIC,
  p_notas           TEXT DEFAULT NULL
) RETURNS TABLE(id UUID, numero INTEGER)
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_numero INTEGER;
  v_id     UUID;
BEGIN
  -- Advisory lock scoped to this transaction, keyed on the subcontractor UUID.
  -- Two concurrent calls for the same p_sub_id serialize here.
  PERFORM pg_advisory_xact_lock(
    ('x' || substr(md5(p_sub_id::text), 1, 16))::bit(64)::bigint
  );

  SELECT COALESCE(MAX(am.numero), 0) + 1
    INTO v_numero
    FROM public.autos_medicao am
   WHERE am.subempreiteiro_id = p_sub_id;

  INSERT INTO public.autos_medicao (
    subempreiteiro_id, numero, data_medicao,
    percentagem_periodo, valor_periodo, observacoes
  ) VALUES (
    p_sub_id, v_numero, p_data, p_percentagem, p_valor, p_notas
  )
  RETURNING public.autos_medicao.id INTO v_id;

  RETURN QUERY SELECT v_id, v_numero;
END;
$$;

GRANT EXECUTE ON FUNCTION public.criar_auto_rpc(UUID, DATE, NUMERIC, NUMERIC, TEXT) TO authenticated;

-- 2. custos_materiais_por_obra: server-side aggregation of materials and fuel costs
--    per obra. Replaces client-side loop over all movement rows.
CREATE OR REPLACE FUNCTION public.custos_materiais_por_obra()
RETURNS TABLE(obra_id UUID, materiais NUMERIC, combustivel NUMERIC)
LANGUAGE SQL STABLE SECURITY INVOKER AS $$
  SELECT
    q.obra_id,
    SUM(q.materiais) AS materiais,
    SUM(q.combustivel) AS combustivel
  FROM (
    SELECT
      ms.obra_id,
      SUM(ms.quantidade::numeric * p.custo_unitario) AS materiais,
      0::numeric AS combustivel
    FROM public.movimentos_stock ms
    JOIN public.produtos p ON p.id = ms.produto_id
    WHERE ms.tipo = 'saida' AND ms.obra_id IS NOT NULL
    GROUP BY ms.obra_id

    UNION ALL

    SELECT
      ca.obra_id,
      0::numeric AS materiais,
      SUM(ca.custo_total) AS combustivel
    FROM public.comb_abastecimentos ca
    WHERE ca.obra_id IS NOT NULL
    GROUP BY ca.obra_id
  ) q
  GROUP BY q.obra_id;
$$;

GRANT EXECUTE ON FUNCTION public.custos_materiais_por_obra() TO authenticated;
