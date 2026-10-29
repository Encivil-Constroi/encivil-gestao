-- Falha rápido em vez de ficar à espera de locks de tráfego em produção.
SET lock_timeout = '5s';

-- ================================================================
-- ENCIVIL — Checkup 2026-10-28, lote BD-5: custos e stock
--
-- A3-02  custos consolidados descontam as devoluções à obra (DEVOLUCAO_OBRA),
--        como custos_materiais_por_obra (P&L, dashboard) — antes davam 2 números.
-- A3-09  materiais cortados por dia de Lisboa; p_data_fim por omissão = hoje em Lisboa.
-- A3-03  armazem_materiais_por_obra com ORDER BY: o site pagina-a com .range().
-- A3-06  (+A1-06) INSERT direto em produtos sem stock_atual nem codigo (stock só por
--        movimentos; criar_produto é DEFINER e não é afetado); unidade fixa depois do
--        primeiro movimento (RN-UNID-02).
-- A1-10  movimentos_stock sem UPDATE/DELETE/TRUNCATE para a API e TRUNCATE recusado
--        também ao dono (como audit_log_sem_truncate).
--
-- Assinaturas e forma dos resultados inalteradas: só mudam os valores.
-- APLICAR: SQL Editor do Supabase Dashboard. Idempotente.
-- ================================================================

-- ── 1. Custos consolidados (A3-02, A3-09) ────────────────────────────────────
-- Corpo de 20260917120000_fase7_custeio.sql; só muda o bloco de materiais.
CREATE OR REPLACE FUNCTION public._custos_consolidados_por_obra_impl(
  p_obra_id   uuid,
  p_data_ini  date DEFAULT '2000-01-01'::date,
  p_data_fim  date DEFAULT public._hoje_pt()
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_materiais    NUMERIC := 0;
  v_combustivel  NUMERIC := 0;
  v_mao_obra     NUMERIC := 0;
  v_fornecedores NUMERIC := 0;
  v_subempreit   NUMERIC := 0;
BEGIN
  -- Materiais: enviados − devolvidos à obra, ao custo atual, por dia de Lisboa
  SELECT COALESCE(SUM(CASE WHEN m.tipo = 'saida' THEN m.quantidade ELSE -m.quantidade END
                      * COALESCE(p.custo_unitario, 0)), 0)
    INTO v_materiais
    FROM movimentos_stock m
    JOIN produtos p ON p.id = m.produto_id
   WHERE m.obra_id = p_obra_id
     AND (m.tipo = 'saida' OR m.subtipo = 'DEVOLUCAO_OBRA')
     AND (m.created_at AT TIME ZONE 'Europe/Lisbon')::date BETWEEN p_data_ini AND p_data_fim;

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
REVOKE ALL ON FUNCTION public._custos_consolidados_por_obra_impl(uuid, date, date) FROM PUBLIC, anon, authenticated;

-- Wrapper de 20261007110000_obras_producao.sql; só muda o valor por omissão de p_data_fim.
CREATE OR REPLACE FUNCTION public.custos_consolidados_por_obra(
  p_obra_id uuid,
  p_data_ini date DEFAULT '2000-01-01'::date,
  p_data_fim date DEFAULT public._hoje_pt()
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_j json;
  v jsonb;
  v_glos numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.pode_ver_obra(p_obra_id) THEN
    RAISE EXCEPTION 'Sem permissão para consultar custos';
  END IF;
  v_j := public._custos_consolidados_por_obra_impl(p_obra_id, p_data_ini, p_data_fim);
  SELECT COALESCE(sum(am.valor_glosado), 0) INTO v_glos
    FROM public.autos_medicao am
    JOIN public.subempreiteiros s ON s.id = am.subempreiteiro_id
   WHERE s.obra_id = p_obra_id AND am.estado = 'validado' AND am.data_medicao BETWEEN p_data_ini AND p_data_fim;
  IF v_glos = 0 THEN RETURN v_j; END IF;
  v := v_j::jsonb;
  v := jsonb_set(v, '{subempreiteiros}', to_jsonb((v ->> 'subempreiteiros')::numeric - v_glos));
  v := jsonb_set(v, '{total}', to_jsonb((v ->> 'total')::numeric - v_glos));
  RETURN v::json;
END;
$$;
REVOKE ALL     ON FUNCTION public.custos_consolidados_por_obra(uuid, date, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.custos_consolidados_por_obra(uuid, date, date) TO authenticated;

-- ── 2. Materiais por obra com ordem estável (A3-03) ──────────────────────────
-- Corpo de 20261001000000_armazem_completo.sql + ORDER BY (o PostgREST corta a 1000 linhas).
CREATE OR REPLACE FUNCTION public.armazem_materiais_por_obra(p_obra_id uuid DEFAULT NULL)
RETURNS TABLE (
  obra_id uuid, obra_nome text, obra_estado text,
  produto_id uuid, produto_nome text, produto_codigo text, unidade text, foto_path text,
  enviado numeric, devolvido numeric, liquido numeric, valor numeric, ultimo_movimento timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT o.id, o.nome, o.estado,
         p.id, p.nome, p.codigo, p.unidade, p.foto_path,
         SUM(CASE WHEN m.tipo = 'saida' THEN m.quantidade ELSE 0 END),
         SUM(CASE WHEN m.subtipo = 'DEVOLUCAO_OBRA' THEN m.quantidade ELSE 0 END),
         SUM(CASE WHEN m.tipo = 'saida' THEN m.quantidade WHEN m.subtipo = 'DEVOLUCAO_OBRA' THEN -m.quantidade ELSE 0 END),
         SUM(CASE WHEN m.tipo = 'saida' THEN m.quantidade WHEN m.subtipo = 'DEVOLUCAO_OBRA' THEN -m.quantidade ELSE 0 END) * p.custo_unitario,
         MAX(m.created_at)
    FROM public.movimentos_stock m
    JOIN public.obras o    ON o.id = m.obra_id
    JOIN public.produtos p ON p.id = m.produto_id
   WHERE m.obra_id IS NOT NULL
     AND (m.tipo = 'saida' OR m.subtipo = 'DEVOLUCAO_OBRA')
     AND (p_obra_id IS NULL OR m.obra_id = p_obra_id)
   GROUP BY o.id, o.nome, o.estado, p.id, p.nome, p.codigo, p.unidade, p.foto_path, p.custo_unitario
   ORDER BY o.nome, p.nome, p.id, o.id
$$;
REVOKE ALL     ON FUNCTION public.armazem_materiais_por_obra(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.armazem_materiais_por_obra(uuid) TO authenticated;

-- ── 3. produtos: INSERT direto sem stock_atual nem codigo (A3-06, A1-06) ─────
-- O REVOKE de tabela também retira os privilégios de coluna; o GRANT repõe só estas.
REVOKE INSERT ON public.produtos FROM authenticated, anon;
GRANT INSERT (id, nome, categoria, unidade, stock_minimo, custo_unitario, observacoes, foto_path, localizacao, ativo)
  ON public.produtos TO authenticated;

-- ── 4. Unidade fixa depois do primeiro movimento (RN-UNID-02) ────────────────
-- DEFINER: o EXISTS tem de ver todos os movimentos do artigo, seja qual for a RLS de quem edita.
CREATE OR REPLACE FUNCTION public._produtos_unidade_fixa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.unidade IS DISTINCT FROM NEW.unidade
     AND EXISTS (SELECT 1 FROM public.movimentos_stock m WHERE m.produto_id = OLD.id) THEN
    RAISE EXCEPTION 'A unidade não pode mudar depois do primeiro movimento.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._produtos_unidade_fixa() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS produtos_unidade_fixa ON public.produtos;
CREATE TRIGGER produtos_unidade_fixa BEFORE UPDATE OF unidade ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public._produtos_unidade_fixa();

-- ── 5. movimentos_stock imutável também por TRUNCATE (A1-10) ─────────────────
-- UPDATE/DELETE já eram recusados por linha (movimentos_stock_imutavel); o TRUNCATE ignora
-- triggers de linha e RLS. Limpezas de dados de teste passam a ter de desligar o trigger
-- explicitamente (ALTER TABLE … DISABLE TRIGGER movimentos_stock_sem_truncate).
REVOKE UPDATE, DELETE, TRUNCATE ON public.movimentos_stock FROM authenticated, anon;

DROP TRIGGER IF EXISTS movimentos_stock_sem_truncate ON public.movimentos_stock;
CREATE TRIGGER movimentos_stock_sem_truncate BEFORE TRUNCATE ON public.movimentos_stock
  FOR EACH STATEMENT EXECUTE FUNCTION public._movimentos_stock_imutavel();

RESET lock_timeout;

-- ROLLBACK
-- DROP TRIGGER IF EXISTS movimentos_stock_sem_truncate ON public.movimentos_stock;
-- GRANT UPDATE, DELETE, TRUNCATE ON public.movimentos_stock TO authenticated;
-- DROP TRIGGER IF EXISTS produtos_unidade_fixa ON public.produtos;
-- DROP FUNCTION IF EXISTS public._produtos_unidade_fixa();
-- REVOKE INSERT (id, nome, categoria, unidade, stock_minimo, custo_unitario, observacoes, foto_path, localizacao, ativo) ON public.produtos FROM authenticated;
-- GRANT INSERT ON public.produtos TO authenticated;
-- -- armazem_materiais_por_obra: repor o corpo de 20261001000000_armazem_completo.sql (sem ORDER BY).
-- -- custos_consolidados_por_obra: repor o wrapper de 20261007110000_obras_producao.sql (DEFAULT CURRENT_DATE).
-- -- _custos_consolidados_por_obra_impl: repor o corpo de 20260917120000_fase7_custeio.sql
-- --   (materiais só tipo = 'saida' e m.created_at::date), com DEFAULT CURRENT_DATE.
