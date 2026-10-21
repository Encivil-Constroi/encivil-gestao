-- =============================================================
-- ENCIVIL — Integridade do armazém e do stock (2026-10-20)
--
--  1. Reenvio idempotente: movimentos_stock.client_id (único) e
--     registar_movimento_armazem(..., p_client_id). A fila offline envia o
--     seu id; se a rede cair depois de o servidor gravar, o reenvio devolve
--     o movimento já gravado em vez de duplicar o stock.
--  2. Um só INSERT por movimento (_registar_movimento_stock), sem UPDATE
--     posterior; movimentos_stock passa a recusar UPDATE e DELETE (trigger).
--  3. stock_atual deixa de poder ser alterado por UPDATE direto
--     (GRANT UPDATE só nas colunas editáveis).
--  4. criar_produto(p jsonb): artigo criado com 0 e o stock inicial entra
--     como movimento de entrada, na mesma transação.
--  5. Devolução de obra limitada ao líquido enviado para essa obra.
--  6. Empréstimos: um só ativo por ferramenta; escrita só pelas RPCs.
--  7. produtos_em_alerta devolve numeric (stock com casas decimais).
--
-- Compatível com o site anterior: registar_movimento e as chamadas sem
-- p_client_id mantêm-se iguais. APLICAR: SQL Editor. Idempotente.
-- =============================================================

-- ── 1. client_id ─────────────────────────────────────────────────────────────
ALTER TABLE public.movimentos_stock ADD COLUMN IF NOT EXISTS client_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_movimentos_client_id
  ON public.movimentos_stock (client_id) WHERE client_id IS NOT NULL;

COMMENT ON COLUMN public.movimentos_stock.client_id IS
  'Id gerado no dispositivo (fila offline). Torna o reenvio idempotente.';

-- ── 2. Núcleo: bloqueia o artigo, atualiza o stock e grava o movimento ───────
-- Interno (sem EXECUTE para authenticated): quem chama já validou a permissão.
CREATE OR REPLACE FUNCTION public._registar_movimento_stock(
  p_produto_id     uuid,
  p_tipo           tipo_movimento,
  p_quantidade     numeric,
  p_responsavel    text,
  p_destino_obra   text,
  p_observacoes    text,
  p_obra_id        uuid,
  p_subtipo        text,
  p_fornecedor     text,
  p_numero_fatura  text,
  p_cliente        text,
  p_preco_unitario numeric,
  p_client_id      uuid
) RETURNS public.movimentos_stock
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_produto      public.produtos%ROWTYPE;
  v_stock_depois numeric(12, 3);
  v_mov          public.movimentos_stock%ROWTYPE;
BEGIN
  SELECT * INTO v_produto FROM public.produtos WHERE id = p_produto_id AND ativo = true FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado ou inativo.';
  END IF;

  CASE p_tipo
    WHEN 'entrada' THEN v_stock_depois := v_produto.stock_atual + p_quantidade;
    WHEN 'saida' THEN
      IF p_quantidade > v_produto.stock_atual THEN
        RAISE EXCEPTION 'Stock insuficiente. Disponível: %, Pedido: %', v_produto.stock_atual, p_quantidade;
      END IF;
      v_stock_depois := v_produto.stock_atual - p_quantidade;
    WHEN 'ajuste' THEN v_stock_depois := p_quantidade;
  END CASE;

  UPDATE public.produtos SET stock_atual = v_stock_depois WHERE id = p_produto_id;

  INSERT INTO public.movimentos_stock (
    produto_id, tipo, quantidade, stock_antes, stock_depois,
    responsavel, destino_obra, observacoes, obra_id, created_by,
    subtipo, fornecedor, numero_fatura, cliente, preco_unitario, client_id
  ) VALUES (
    p_produto_id, p_tipo, p_quantidade, v_produto.stock_atual, v_stock_depois,
    p_responsavel, p_destino_obra, p_observacoes, p_obra_id, auth.uid(),
    p_subtipo, p_fornecedor, p_numero_fatura, p_cliente, p_preco_unitario, p_client_id
  )
  RETURNING * INTO v_mov;

  RETURN v_mov;
END;
$$;

REVOKE ALL ON FUNCTION public._registar_movimento_stock(
  uuid, tipo_movimento, numeric, text, text, text, uuid, text, text, text, text, numeric, uuid
) FROM PUBLIC, anon, authenticated;

-- registar_movimento: mesma assinatura e mensagens; passa a usar o núcleo
CREATE OR REPLACE FUNCTION public.registar_movimento(
  p_produto_id   UUID,
  p_tipo         tipo_movimento,
  p_quantidade   NUMERIC,
  p_responsavel  TEXT,
  p_destino_obra TEXT DEFAULT NULL,
  p_observacoes  TEXT DEFAULT NULL,
  p_obra_id      UUID DEFAULT NULL
)
RETURNS movimentos_stock
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.pode_escrever('armazem') THEN
    RAISE EXCEPTION 'Autorização negada: não tem permissão para registar movimentos de stock.';
  END IF;

  RETURN public._registar_movimento_stock(
    p_produto_id, p_tipo, p_quantidade, p_responsavel, p_destino_obra, p_observacoes, p_obra_id,
    NULL, NULL, NULL, NULL, NULL, NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registar_movimento(UUID, tipo_movimento, NUMERIC, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registar_movimento(UUID, tipo_movimento, NUMERIC, TEXT, TEXT, TEXT, UUID) TO authenticated;

-- ── Porta do armazém com p_client_id ────────────────────────────────────────
-- A assinatura antiga sai: com as duas, o PostgREST não saberia qual escolher.
DROP FUNCTION IF EXISTS public.registar_movimento_armazem(uuid, text, numeric, text, uuid, text, text, text, numeric, text);

CREATE OR REPLACE FUNCTION public.registar_movimento_armazem(
  p_produto_id     uuid,
  p_subtipo        text,
  p_quantidade     numeric,
  p_responsavel    text,
  p_obra_id        uuid    DEFAULT NULL,
  p_fornecedor     text    DEFAULT NULL,
  p_numero_fatura  text    DEFAULT NULL,
  p_cliente        text    DEFAULT NULL,
  p_preco_unitario numeric DEFAULT NULL,
  p_observacoes    text    DEFAULT NULL,
  p_client_id      uuid    DEFAULT NULL
) RETURNS public.movimentos_stock
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo    tipo_movimento;
  v_obra    public.obras%ROWTYPE;
  v_mov     public.movimentos_stock%ROWTYPE;
  v_forn    text := NULLIF(btrim(p_fornecedor), '');
  v_cli     text := NULLIF(btrim(p_cliente), '');
  v_liquido numeric;
BEGIN
  IF NOT public.pode_escrever('armazem') THEN
    RAISE EXCEPTION 'Autorização negada: não tem permissão para registar movimentos de stock.';
  END IF;

  -- Reenvio: antes das validações, porque o estado pode ter mudado entretanto
  -- (ex.: obra concluída) e o movimento já está gravado.
  IF p_client_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('mov_client:' || p_client_id::text, 0));
    SELECT * INTO v_mov FROM public.movimentos_stock WHERE client_id = p_client_id;
    IF FOUND THEN
      IF v_mov.created_by IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Este identificador de registo já foi usado por outro utilizador.';
      END IF;
      RETURN v_mov;
    END IF;
  END IF;

  v_tipo := CASE
    WHEN p_subtipo IN ('COMPRA', 'DEVOLUCAO_OBRA', 'PROPRIO_ENCIVIL', 'ACERTO') THEN 'entrada'
    WHEN p_subtipo IN ('OBRA', 'VENDA', 'QUEBRA') THEN 'saida'
    WHEN p_subtipo = 'INVENTARIO' THEN 'ajuste'
  END::tipo_movimento;
  IF v_tipo IS NULL THEN
    RAISE EXCEPTION 'Tipo de movimento inválido';
  END IF;

  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
    RAISE EXCEPTION 'Quantidade inválida';
  END IF;
  IF p_preco_unitario IS NOT NULL AND p_preco_unitario < 0 THEN
    RAISE EXCEPTION 'Preço inválido';
  END IF;
  IF btrim(coalesce(p_responsavel, '')) = '' THEN
    RAISE EXCEPTION 'Indique o responsável';
  END IF;

  IF p_subtipo = 'COMPRA' AND v_forn IS NULL THEN
    RAISE EXCEPTION 'Indique o fornecedor (ou ENCIVIL)';
  END IF;
  IF p_subtipo = 'VENDA' AND v_cli IS NULL THEN
    RAISE EXCEPTION 'Indique o cliente da venda';
  END IF;
  IF p_subtipo IN ('OBRA', 'DEVOLUCAO_OBRA') THEN
    SELECT * INTO v_obra FROM public.obras WHERE id = p_obra_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Escolha a obra';
    END IF;
    IF p_subtipo = 'OBRA' AND v_obra.estado <> 'ativa' THEN
      RAISE EXCEPTION 'A obra "%" já está concluída', v_obra.nome;
    END IF;
  ELSIF p_obra_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este tipo de movimento não leva obra';
  END IF;

  -- Só volta o que lá está: enviado − já devolvido (mesma conta de armazem_materiais_por_obra).
  -- Saídas antigas, anteriores a obra_id, só têm o nome da obra em destino_obra: contam também.
  -- (Devoluções têm sempre obra_id — DEVOLUCAO_OBRA exige obra —, não há devoluções antigas só em texto.)
  -- O bloqueio do artigo serializa devoluções concorrentes.
  IF p_subtipo = 'DEVOLUCAO_OBRA' THEN
    PERFORM 1 FROM public.produtos WHERE id = p_produto_id FOR UPDATE;
    SELECT coalesce(sum(CASE WHEN m.tipo = 'saida' THEN m.quantidade ELSE -m.quantidade END), 0)
      INTO v_liquido
      FROM public.movimentos_stock m
     WHERE m.produto_id = p_produto_id
       AND (
         (m.obra_id = v_obra.id AND (m.tipo = 'saida' OR m.subtipo = 'DEVOLUCAO_OBRA'))
         OR (m.obra_id IS NULL AND m.tipo = 'saida'
             AND lower(btrim(m.destino_obra)) = lower(btrim(v_obra.nome)))
       );
    IF p_quantidade > v_liquido THEN
      RAISE EXCEPTION 'Só pode devolver até % deste artigo (líquido enviado para a obra "%").',
        trim_scale(greatest(v_liquido, 0)), v_obra.nome;
    END IF;
  END IF;

  -- destino_obra (texto) é obrigatório em todas as saídas (ck_destino_obrigatorio_saida)
  v_mov := public._registar_movimento_stock(
    p_produto_id, v_tipo, p_quantidade, btrim(p_responsavel),
    CASE p_subtipo WHEN 'VENDA' THEN 'Venda: ' || v_cli WHEN 'QUEBRA' THEN 'Quebra / perda' ELSE v_obra.nome END,
    NULLIF(btrim(p_observacoes), ''), v_obra.id,
    p_subtipo,
    CASE WHEN p_subtipo = 'COMPRA' THEN v_forn END,
    NULLIF(btrim(p_numero_fatura), ''),
    CASE WHEN p_subtipo = 'VENDA' THEN v_cli END,
    CASE WHEN p_subtipo IN ('COMPRA', 'VENDA') THEN p_preco_unitario END,
    p_client_id
  );

  -- Último preço de compra passa a ser o custo do artigo (custo por obra)
  IF p_subtipo = 'COMPRA' AND p_preco_unitario IS NOT NULL THEN
    UPDATE public.produtos SET custo_unitario = p_preco_unitario WHERE id = p_produto_id;
  END IF;

  RETURN v_mov;
END;
$$;

REVOKE ALL     ON FUNCTION public.registar_movimento_armazem(uuid, text, numeric, text, uuid, text, text, text, numeric, text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registar_movimento_armazem(uuid, text, numeric, text, uuid, text, text, text, numeric, text, uuid) TO authenticated;

-- Histórico imutável (RN-HIST-01/02): correções fazem-se com novo movimento.
-- Só por linha: o TRUNCATE de supabase/scripts/limpar-registos.sql continua possível ao dono.
CREATE OR REPLACE FUNCTION public._movimentos_stock_imutavel()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Os movimentos de stock são imutáveis: corrija com um novo movimento.'; END $$;
REVOKE ALL ON FUNCTION public._movimentos_stock_imutavel() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS movimentos_stock_imutavel ON public.movimentos_stock;
CREATE TRIGGER movimentos_stock_imutavel BEFORE UPDATE OR DELETE ON public.movimentos_stock
  FOR EACH ROW EXECUTE FUNCTION public._movimentos_stock_imutavel();

-- ── 3. produtos: stock_atual (e o código) fora do UPDATE direto ─────────────
-- Colunas que o site edita (produtosService.atualizarProduto/desativar/restaurar).
REVOKE UPDATE ON public.produtos FROM authenticated;
GRANT UPDATE (nome, categoria, unidade, stock_minimo, custo_unitario, observacoes, foto_path, localizacao, ativo)
  ON public.produtos TO authenticated;

-- ── 4. criar_produto ─────────────────────────────────────────────────────────
-- p: { id?, nome, categoria, unidade, stock_inicial?, stock_minimo?, custo_unitario?,
--      observacoes?, foto_path?, localizacao?, responsavel? }
CREATE OR REPLACE FUNCTION public.criar_produto(p jsonb)
RETURNS public.produtos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id      uuid := coalesce(NULLIF(p->>'id', '')::uuid, gen_random_uuid());
  v_inicial numeric := coalesce(NULLIF(p->>'stock_inicial', '')::numeric, 0);
  v_resp    text;
  v_prod    public.produtos%ROWTYPE;
BEGIN
  IF NOT public.pode_escrever('armazem') THEN
    RAISE EXCEPTION 'Autorização negada: não tem permissão para criar artigos.';
  END IF;
  IF btrim(coalesce(p->>'nome', '')) = '' THEN
    RAISE EXCEPTION 'Indique o nome do artigo';
  END IF;
  IF btrim(coalesce(p->>'categoria', '')) = '' OR btrim(coalesce(p->>'unidade', '')) = '' THEN
    RAISE EXCEPTION 'Indique a categoria e a unidade do artigo';
  END IF;
  IF v_inicial < 0 THEN
    RAISE EXCEPTION 'Stock inicial inválido';
  END IF;

  INSERT INTO public.produtos (
    id, nome, categoria, unidade, stock_atual, stock_minimo, custo_unitario,
    observacoes, foto_path, localizacao
  ) VALUES (
    v_id, btrim(p->>'nome'), p->>'categoria', p->>'unidade', 0,
    coalesce(NULLIF(p->>'stock_minimo', '')::numeric, 0),
    coalesce(NULLIF(p->>'custo_unitario', '')::numeric, 0),
    NULLIF(btrim(p->>'observacoes'), ''), NULLIF(p->>'foto_path', ''), NULLIF(btrim(p->>'localizacao'), '')
  );

  IF v_inicial > 0 THEN
    v_resp := coalesce(
      NULLIF(btrim(p->>'responsavel'), ''),
      NULLIF(btrim((SELECT pr.nome FROM public.profiles pr WHERE pr.id = auth.uid())), ''),
      'Criação do artigo');
    PERFORM public._registar_movimento_stock(
      v_id, 'entrada', v_inicial, v_resp, NULL, 'Stock inicial na criação do artigo', NULL,
      NULL, NULL, NULL, NULL, NULL, NULL);
  END IF;

  SELECT * INTO v_prod FROM public.produtos WHERE id = v_id;
  RETURN v_prod;
END;
$$;

REVOKE ALL     ON FUNCTION public.criar_produto(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.criar_produto(jsonb) TO authenticated;

-- ── 6. Empréstimos de ferramentas ────────────────────────────────────────────
-- Só cria o índice se não houver já duplicados (a migration não falha; corrigir à mão e voltar a correr).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.emprestimos_ferramentas WHERE estado = 'ativo'
     GROUP BY ferramenta_id HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_emprestimo_ativo_ferramenta
      ON public.emprestimos_ferramentas (ferramenta_id) WHERE estado = 'ativo';
  ELSE
    RAISE NOTICE 'uq_emprestimo_ativo_ferramenta não criado: há ferramentas com mais de um empréstimo ativo.';
  END IF;
END $$;

-- O site só escreve por registar_emprestimo_ferramenta / registar_devolucao_ferramenta (SECURITY DEFINER)
REVOKE INSERT, UPDATE ON public.emprestimos_ferramentas FROM authenticated;

-- ── 7. produtos_em_alerta em numeric ─────────────────────────────────────────
DROP FUNCTION IF EXISTS public.produtos_em_alerta();
CREATE FUNCTION public.produtos_em_alerta()
RETURNS TABLE(
  id           uuid,
  nome         text,
  unidade      text,
  stock_atual  numeric,
  stock_minimo numeric
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

REVOKE ALL     ON FUNCTION public.produtos_em_alerta() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.produtos_em_alerta() TO authenticated;

-- ROLLBACK
-- DROP FUNCTION IF EXISTS public.produtos_em_alerta();
--   (recriar a versão de 20260728000001_performance_indexes.sql e GRANT EXECUTE … TO authenticated)
-- GRANT INSERT, UPDATE ON public.emprestimos_ferramentas TO authenticated;
-- DROP INDEX IF EXISTS public.uq_emprestimo_ativo_ferramenta;
-- DROP FUNCTION IF EXISTS public.criar_produto(jsonb);
-- REVOKE UPDATE (nome, categoria, unidade, stock_minimo, custo_unitario, observacoes, foto_path, localizacao, ativo) ON public.produtos FROM authenticated;
-- GRANT UPDATE ON public.produtos TO authenticated;
-- DROP TRIGGER IF EXISTS movimentos_stock_imutavel ON public.movimentos_stock;
-- DROP FUNCTION IF EXISTS public._movimentos_stock_imutavel();
-- DROP FUNCTION IF EXISTS public.registar_movimento_armazem(uuid, text, numeric, text, uuid, text, text, text, numeric, text, uuid);
--   (recriar registar_movimento_armazem de 20261001000000_armazem_completo.sql, com o REVOKE/GRANT de lá)
--   (recriar registar_movimento de 20260702000007_custos_obra.sql e ALTER FUNCTION … SET search_path = public)
-- DROP FUNCTION IF EXISTS public._registar_movimento_stock(uuid, tipo_movimento, numeric, text, text, text, uuid, text, text, text, text, numeric, uuid);
-- DROP INDEX IF EXISTS public.uq_movimentos_client_id;
-- ALTER TABLE public.movimentos_stock DROP COLUMN IF EXISTS client_id;
