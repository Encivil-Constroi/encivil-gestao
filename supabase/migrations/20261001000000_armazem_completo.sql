-- ================================================================
-- ENCIVIL — Armazém completo (2026-10-01)
--
--  1. Produtos: foto e localização no armazém.
--  2. Movimentos com tipo de entrada/saída (compra, devolução de obra,
--     stock próprio ENCIVIL, acerto; saída para obra, venda comercial,
--     quebra/perda), fornecedor, n.º de fatura, cliente e preço — numa só
--     RPC atómica (registar_movimento_armazem), que reutiliza registar_movimento.
--  3. Materiais por obra: enviados − devolvidos, com valor (para a visão
--     "o que está em cada obra"); custos por obra passam a descontar devoluções.
--  4. Ferramentas: foto, marca/modelo, compra, garantia do fabricante (se nova).
--  5. Empréstimos: foto obrigatória na entrega e na devolução (prova do estado).
--  6. Bucket "armazem" para as fotos (só quem regista no armazém/ferramentas envia).
--
-- APLICAR: SQL Editor. Idempotente.
-- ================================================================

-- ── 1. Produtos ──────────────────────────────────────────────────────────────
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS foto_path   text,
  ADD COLUMN IF NOT EXISTS localizacao text;

-- ── 2. Movimentos: tipo detalhado e dados comerciais ────────────────────────
ALTER TABLE public.movimentos_stock
  ADD COLUMN IF NOT EXISTS subtipo        text,
  ADD COLUMN IF NOT EXISTS fornecedor     text,
  ADD COLUMN IF NOT EXISTS numero_fatura  text,
  ADD COLUMN IF NOT EXISTS cliente        text,
  ADD COLUMN IF NOT EXISTS preco_unitario numeric(12,4);

ALTER TABLE public.movimentos_stock DROP CONSTRAINT IF EXISTS ck_mov_subtipo;
ALTER TABLE public.movimentos_stock ADD CONSTRAINT ck_mov_subtipo CHECK (
  subtipo IS NULL
  OR (tipo = 'entrada' AND subtipo IN ('COMPRA', 'DEVOLUCAO_OBRA', 'PROPRIO_ENCIVIL', 'ACERTO'))
  OR (tipo = 'saida'   AND subtipo IN ('OBRA', 'VENDA', 'QUEBRA'))
  OR (tipo = 'ajuste'  AND subtipo = 'INVENTARIO')
);
ALTER TABLE public.movimentos_stock DROP CONSTRAINT IF EXISTS ck_mov_preco;
ALTER TABLE public.movimentos_stock ADD CONSTRAINT ck_mov_preco CHECK (preco_unitario IS NULL OR preco_unitario >= 0);

CREATE INDEX IF NOT EXISTS idx_mov_obra_produto ON public.movimentos_stock (obra_id, produto_id) WHERE obra_id IS NOT NULL;

-- Uma só porta para entradas e saídas com o tipo detalhado. Regras:
--   COMPRA          fornecedor obrigatório (ou "ENCIVIL"); preço opcional → atualiza o custo unitário
--   DEVOLUCAO_OBRA  obra de origem obrigatória (desconta no custo da obra)
--   PROPRIO_ENCIVIL / ACERTO  sem fornecedor
--   OBRA            obra de destino obrigatória (em execução)
--   VENDA           cliente obrigatório; preço de venda opcional
--   QUEBRA          perda/quebra
--   INVENTARIO      ajuste: a quantidade é o novo stock contado (> 0; para zerar, QUEBRA)
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
  p_observacoes    text    DEFAULT NULL
) RETURNS public.movimentos_stock
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo   tipo_movimento;
  v_obra   public.obras%ROWTYPE;
  v_mov    public.movimentos_stock%ROWTYPE;
  v_forn   text := NULLIF(btrim(p_fornecedor), '');
  v_cli    text := NULLIF(btrim(p_cliente), '');
BEGIN
  IF NOT public.pode_escrever('armazem') THEN
    RAISE EXCEPTION 'Autorização negada: não tem permissão para registar movimentos de stock.';
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

  -- destino_obra (texto) é obrigatório em todas as saídas (ck_destino_obrigatorio_saida)
  v_mov := public.registar_movimento(
    p_produto_id, v_tipo, p_quantidade, btrim(p_responsavel),
    CASE p_subtipo WHEN 'VENDA' THEN 'Venda: ' || v_cli WHEN 'QUEBRA' THEN 'Quebra / perda' ELSE v_obra.nome END,
    NULLIF(btrim(p_observacoes), ''), v_obra.id
  );

  UPDATE public.movimentos_stock
     SET subtipo        = p_subtipo,
         fornecedor     = CASE WHEN p_subtipo = 'COMPRA' THEN v_forn END,
         numero_fatura  = NULLIF(btrim(p_numero_fatura), ''),
         cliente        = CASE WHEN p_subtipo = 'VENDA' THEN v_cli END,
         preco_unitario = CASE WHEN p_subtipo IN ('COMPRA', 'VENDA') THEN p_preco_unitario END
   WHERE id = v_mov.id
  RETURNING * INTO v_mov;

  -- Último preço de compra passa a ser o custo do artigo (custo por obra)
  IF p_subtipo = 'COMPRA' AND p_preco_unitario IS NOT NULL THEN
    UPDATE public.produtos SET custo_unitario = p_preco_unitario WHERE id = p_produto_id;
  END IF;

  RETURN v_mov;
END;
$$;

REVOKE ALL     ON FUNCTION public.registar_movimento_armazem(uuid, text, numeric, text, uuid, text, text, text, numeric, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registar_movimento_armazem(uuid, text, numeric, text, uuid, text, text, text, numeric, text) TO authenticated;

-- ── 3. Materiais por obra ────────────────────────────────────────────────────
-- Enviados (saídas para a obra) − devolvidos (entradas DEVOLUCAO_OBRA), ao custo atual
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
$$;

REVOKE ALL     ON FUNCTION public.armazem_materiais_por_obra(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.armazem_materiais_por_obra(uuid) TO authenticated;

-- Custo de materiais por obra passa a descontar o que voltou ao armazém
CREATE OR REPLACE FUNCTION public.custos_materiais_por_obra()
RETURNS TABLE(obra_id UUID, materiais NUMERIC, combustivel NUMERIC)
LANGUAGE SQL STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT q.obra_id, SUM(q.materiais), SUM(q.combustivel)
  FROM (
    SELECT ms.obra_id,
           SUM(CASE WHEN ms.tipo = 'saida' THEN ms.quantidade ELSE -ms.quantidade END * p.custo_unitario) AS materiais,
           0::numeric AS combustivel
      FROM public.movimentos_stock ms
      JOIN public.produtos p ON p.id = ms.produto_id
     WHERE ms.obra_id IS NOT NULL AND (ms.tipo = 'saida' OR ms.subtipo = 'DEVOLUCAO_OBRA')
     GROUP BY ms.obra_id
    UNION ALL
    SELECT ca.obra_id, 0::numeric, SUM(ca.custo_total)
      FROM public.comb_abastecimentos ca
     WHERE ca.obra_id IS NOT NULL
     GROUP BY ca.obra_id
  ) q
  GROUP BY q.obra_id;
$$;

GRANT EXECUTE ON FUNCTION public.custos_materiais_por_obra() TO authenticated;

-- ── 4. Ferramentas: identificação e garantia ─────────────────────────────────
ALTER TABLE public.ferramentas
  ADD COLUMN IF NOT EXISTS foto_path   text,
  ADD COLUMN IF NOT EXISTS marca       text,
  ADD COLUMN IF NOT EXISTS modelo      text,
  ADD COLUMN IF NOT EXISTS nova        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_compra date,
  ADD COLUMN IF NOT EXISTS garantia_ate date;

ALTER TABLE public.ferramentas DROP CONSTRAINT IF EXISTS ck_ferr_garantia;
ALTER TABLE public.ferramentas ADD CONSTRAINT ck_ferr_garantia CHECK (
  garantia_ate IS NULL OR data_compra IS NULL OR garantia_ate >= data_compra);

-- N.º de série único (ignora maiúsculas/espaços). Só se ainda não houver repetidos —
-- com repetidos, a app avisa e o índice fica para quando forem corrigidos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.ferramentas
     WHERE numero_serie IS NOT NULL AND btrim(numero_serie) <> ''
     GROUP BY lower(btrim(numero_serie)) HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_ferramentas_numero_serie
      ON public.ferramentas (lower(btrim(numero_serie)))
      WHERE numero_serie IS NOT NULL AND btrim(numero_serie) <> '';
  END IF;
END $$;

-- ── 5. Fotos: bucket e validação ────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('armazem', 'armazem', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
ON CONFLICT (id) DO NOTHING;

-- Caminhos: produtos/<produto>/<n>.<ext> · ferramentas/<ferramenta>/<n>.<ext>
-- (o artigo pode ainda não existir: a foto tira-se no formulário de criação)
CREATE OR REPLACE FUNCTION public.foto_armazem_valida(p_nome text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_nome ~ '^produtos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9]{1,16}\.(jpg|png|webp|heic|heif)$'
      THEN public.pode_escrever('armazem')
    WHEN p_nome ~ '^ferramentas/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-z_]{0,20}[0-9]{1,16}\.(jpg|png|webp|heic|heif)$'
      THEN public.pode_escrever('ferramentas')
    ELSE false
  END
$$;

REVOKE ALL     ON FUNCTION public.foto_armazem_valida(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.foto_armazem_valida(text) TO authenticated;

DROP POLICY IF EXISTS "armazem_upload_fotos" ON storage.objects;
CREATE POLICY "armazem_upload_fotos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'armazem' AND public.foto_armazem_valida(name));

-- Foto já enviada, da ferramenta certa
CREATE OR REPLACE FUNCTION public._foto_da_ferramenta(p_path text, p_ferramenta uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_path IS NOT NULL
     AND p_path LIKE 'ferramentas/' || p_ferramenta::text || '/%'
     AND EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'armazem' AND o.name = p_path)
$$;

REVOKE ALL ON FUNCTION public._foto_da_ferramenta(text, uuid) FROM PUBLIC, anon, authenticated;

-- ── 6. Empréstimos: foto na entrega e na devolução ──────────────────────────
ALTER TABLE public.emprestimos_ferramentas
  ADD COLUMN IF NOT EXISTS foto_entrega_path   text,
  ADD COLUMN IF NOT EXISTS foto_devolucao_path text;

DROP FUNCTION IF EXISTS public.registar_emprestimo_ferramenta(
  UUID, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, UUID, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION public.registar_emprestimo_ferramenta(
  p_ferramenta_id                UUID,
  p_funcionario_nome             TEXT,
  p_responsavel_entrega          TEXT,
  p_funcionario_documento        TEXT    DEFAULT NULL,
  p_destino_obra                 TEXT    DEFAULT NULL,
  p_data_prevista_devolucao      DATE    DEFAULT NULL,
  p_condicao_entrega             TEXT    DEFAULT NULL,
  p_observacoes                  TEXT    DEFAULT NULL,
  p_obra_id                      UUID    DEFAULT NULL,
  p_assinatura_entrega           TEXT    DEFAULT NULL,
  p_assinatura_responsavel_ent   TEXT    DEFAULT NULL,
  p_foto_entrega_path            TEXT    DEFAULT NULL
)
RETURNS emprestimos_ferramentas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ferramenta  ferramentas%ROWTYPE;
  v_emprestimo  emprestimos_ferramentas%ROWTYPE;
  v_ativo       emprestimos_ferramentas%ROWTYPE;
BEGIN
  IF NOT public.pode_escrever('ferramentas') THEN
    RAISE EXCEPTION 'Autorização negada: não tem permissão para registar empréstimos de ferramentas.';
  END IF;

  SELECT * INTO v_ferramenta FROM ferramentas WHERE id = p_ferramenta_id AND ativo = true FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ferramenta não encontrada ou inativa.';
  END IF;

  IF v_ferramenta.estado <> 'disponivel' THEN
    SELECT * INTO v_ativo FROM emprestimos_ferramentas
     WHERE ferramenta_id = p_ferramenta_id AND estado = 'ativo'
     ORDER BY data_emprestimo DESC LIMIT 1;
    IF v_ativo.id IS NOT NULL THEN
      RAISE EXCEPTION 'Ferramenta "%" em uso por % desde % — registe a devolução primeiro.',
        v_ferramenta.nome, v_ativo.funcionario_nome, to_char(v_ativo.data_emprestimo AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY');
    END IF;
    RAISE EXCEPTION 'Ferramenta "%" não está disponível (estado atual: %).', v_ferramenta.nome, v_ferramenta.estado;
  END IF;

  IF NOT public._foto_da_ferramenta(p_foto_entrega_path, p_ferramenta_id) THEN
    RAISE EXCEPTION 'Tire a foto do estado da ferramenta na entrega';
  END IF;

  UPDATE ferramentas SET estado = 'emprestada' WHERE id = p_ferramenta_id;

  INSERT INTO emprestimos_ferramentas (
    ferramenta_id, funcionario_nome, funcionario_documento,
    destino_obra, obra_id, data_prevista_devolucao, condicao_entrega,
    observacoes, responsavel_entrega,
    assinatura_entrega, assinatura_responsavel_entrega,
    foto_entrega_path, created_by
  ) VALUES (
    p_ferramenta_id, p_funcionario_nome, p_funcionario_documento,
    p_destino_obra, p_obra_id, p_data_prevista_devolucao, p_condicao_entrega,
    p_observacoes, p_responsavel_entrega,
    p_assinatura_entrega, p_assinatura_responsavel_ent,
    p_foto_entrega_path, auth.uid()
  )
  RETURNING * INTO v_emprestimo;

  RETURN v_emprestimo;
END;
$$;

REVOKE ALL ON FUNCTION public.registar_emprestimo_ferramenta(
  UUID, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, UUID, TEXT, TEXT, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registar_emprestimo_ferramenta(
  UUID, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, UUID, TEXT, TEXT, TEXT
) TO authenticated;

DROP FUNCTION IF EXISTS public.registar_devolucao_ferramenta(
  UUID, condicao_devolucao, TEXT, TEXT, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION public.registar_devolucao_ferramenta(
  p_emprestimo_id               UUID,
  p_condicao_devolucao          condicao_devolucao,
  p_responsavel_recebimento     TEXT,
  p_observacoes_devolucao       TEXT    DEFAULT NULL,
  p_assinatura_devolucao        TEXT    DEFAULT NULL,
  p_assinatura_responsavel_dev  TEXT    DEFAULT NULL,
  p_foto_devolucao_path         TEXT    DEFAULT NULL
)
RETURNS emprestimos_ferramentas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emprestimo   emprestimos_ferramentas%ROWTYPE;
  v_novo_estado  estado_ferramenta;
BEGIN
  IF NOT public.pode_escrever('ferramentas') THEN
    RAISE EXCEPTION 'Autorização negada: não tem permissão para registar devoluções de ferramentas.';
  END IF;

  SELECT * INTO v_emprestimo FROM emprestimos_ferramentas WHERE id = p_emprestimo_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empréstimo não encontrado.';
  END IF;
  IF v_emprestimo.estado <> 'ativo' THEN
    RAISE EXCEPTION 'Este empréstimo já foi devolvido.';
  END IF;

  -- Perdida: não há ferramenta para fotografar
  IF p_condicao_devolucao <> 'perdida'
     AND NOT public._foto_da_ferramenta(p_foto_devolucao_path, v_emprestimo.ferramenta_id) THEN
    RAISE EXCEPTION 'Tire a foto do estado em que a ferramenta voltou';
  END IF;

  PERFORM 1 FROM ferramentas WHERE id = v_emprestimo.ferramenta_id FOR UPDATE;

  v_novo_estado := CASE p_condicao_devolucao
    WHEN 'bom_estado' THEN 'disponivel'
    WHEN 'danificada' THEN 'manutencao'
    WHEN 'perdida'    THEN 'inativa'
  END;

  UPDATE ferramentas SET estado = v_novo_estado WHERE id = v_emprestimo.ferramenta_id;

  UPDATE emprestimos_ferramentas
  SET estado                           = 'devolvido',
      data_devolucao                   = NOW(),
      condicao_devolucao               = p_condicao_devolucao,
      observacoes_devolucao            = p_observacoes_devolucao,
      responsavel_recebimento          = p_responsavel_recebimento,
      assinatura_devolucao             = p_assinatura_devolucao,
      assinatura_responsavel_devolucao = p_assinatura_responsavel_dev,
      foto_devolucao_path              = CASE WHEN p_condicao_devolucao <> 'perdida' THEN p_foto_devolucao_path END
  WHERE id = p_emprestimo_id
  RETURNING * INTO v_emprestimo;

  RETURN v_emprestimo;
END;
$$;

REVOKE ALL ON FUNCTION public.registar_devolucao_ferramenta(
  UUID, condicao_devolucao, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registar_devolucao_ferramenta(
  UUID, condicao_devolucao, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;
