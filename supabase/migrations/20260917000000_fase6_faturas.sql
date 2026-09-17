-- ─────────────────────────────────────────────────────────────────────────────
-- F6 — Ingestão e Classificação de Faturas de Fornecedor
-- Estado: RECEBIDA → EXTRAIDA → CLASSIFICADA → LANCADA
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Bucket de storage para ficheiros PDF/imagem
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'faturas-fornecedor',
  'faturas-fornecedor',
  false,
  20971520,  -- 20 MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Tabela principal de faturas de fornecedor
CREATE TABLE IF NOT EXISTS public.faturas_fornecedor (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_fatura    TEXT,
  fornecedor       TEXT        NOT NULL,
  data_fatura      DATE,
  data_recepcao    DATE        NOT NULL DEFAULT CURRENT_DATE,
  total_fatura     NUMERIC(12,2),
  estado           TEXT        NOT NULL DEFAULT 'RECEBIDA'
                               CHECK (estado IN ('RECEBIDA','EXTRAIDA','CLASSIFICADA','LANCADA')),
  ficheiro_path    TEXT,
  obra_id          UUID        REFERENCES public.obras(id) ON DELETE SET NULL,
  observacoes      TEXT,
  extraido_em      TIMESTAMPTZ,
  classificado_em  TIMESTAMPTZ,
  lancado_em       TIMESTAMPTZ,
  criado_por       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Linhas extraídas por IA por fatura
CREATE TABLE IF NOT EXISTS public.linhas_fatura (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  fatura_id        UUID        NOT NULL REFERENCES public.faturas_fornecedor(id) ON DELETE CASCADE,
  descricao        TEXT        NOT NULL,
  descricao_norm   TEXT,
  quantidade       NUMERIC(10,3),
  unidade          TEXT,
  preco_unitario   NUMERIC(12,4),
  total_linha      NUMERIC(12,2),
  destino          TEXT        NOT NULL DEFAULT 'DESCONHECIDO'
                               CHECK (destino IN ('ARMAZEM','OBRA','SERVICO','DESCONHECIDO')),
  artigo_id        UUID        REFERENCES public.produtos(id) ON DELETE SET NULL,
  confianca        NUMERIC(3,2) CHECK (confianca >= 0 AND confianca <= 1),
  lancado          BOOLEAN     NOT NULL DEFAULT false,
  movimento_id     UUID        REFERENCES public.movimentos_stock(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Regras de classificação (sistema de aprendizagem por fornecedor × descrição)
CREATE TABLE IF NOT EXISTS public.regras_classificacao (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor       TEXT        NOT NULL,
  descricao_norm   TEXT        NOT NULL,
  destino          TEXT        NOT NULL CHECK (destino IN ('ARMAZEM','OBRA','SERVICO','DESCONHECIDO')),
  artigo_id        UUID        REFERENCES public.produtos(id) ON DELETE SET NULL,
  confianca        NUMERIC(3,2) NOT NULL DEFAULT 0.5
                               CHECK (confianca >= 0 AND confianca <= 1),
  total_usos       INTEGER     NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fornecedor, descricao_norm)
);

-- 5. Índices de performance
CREATE INDEX IF NOT EXISTS idx_faturas_estado     ON public.faturas_fornecedor(estado);
CREATE INDEX IF NOT EXISTS idx_faturas_obra       ON public.faturas_fornecedor(obra_id);
CREATE INDEX IF NOT EXISTS idx_faturas_fornecedor ON public.faturas_fornecedor(fornecedor);
CREATE INDEX IF NOT EXISTS idx_faturas_created    ON public.faturas_fornecedor(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_linhas_fatura_id   ON public.linhas_fatura(fatura_id);
CREATE INDEX IF NOT EXISTS idx_regras_lookup      ON public.regras_classificacao(fornecedor, descricao_norm);

-- 6. Trigger updated_at (reutiliza a função se já existir)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_faturas_updated_at
  BEFORE UPDATE ON public.faturas_fornecedor
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_regras_updated_at
  BEFORE UPDATE ON public.regras_classificacao
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. Row Level Security
ALTER TABLE public.faturas_fornecedor   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linhas_fatura        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regras_classificacao ENABLE ROW LEVEL SECURITY;

-- faturas_fornecedor: todos os utilizadores autenticados podem ver;
--   só gestor/admin podem criar/editar; apagar só em estado RECEBIDA
CREATE POLICY "faturas_select" ON public.faturas_fornecedor
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "faturas_insert" ON public.faturas_fornecedor
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'user_role') IN ('gestor','admin')
    AND criado_por = auth.uid()
  );

CREATE POLICY "faturas_update" ON public.faturas_fornecedor
  FOR UPDATE TO authenticated
  USING ((auth.jwt() ->> 'user_role') IN ('gestor','admin'));

CREATE POLICY "faturas_delete" ON public.faturas_fornecedor
  FOR DELETE TO authenticated
  USING (
    (auth.jwt() ->> 'user_role') IN ('gestor','admin')
    AND estado = 'RECEBIDA'
  );

-- linhas_fatura: herda visibilidade; escrita apenas gestor/admin
CREATE POLICY "linhas_select" ON public.linhas_fatura
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "linhas_insert" ON public.linhas_fatura
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() ->> 'user_role') IN ('gestor','admin'));

CREATE POLICY "linhas_update" ON public.linhas_fatura
  FOR UPDATE TO authenticated
  USING ((auth.jwt() ->> 'user_role') IN ('gestor','admin'));

CREATE POLICY "linhas_delete" ON public.linhas_fatura
  FOR DELETE TO authenticated
  USING ((auth.jwt() ->> 'user_role') IN ('gestor','admin'));

-- regras_classificacao: leitura global; escrita gestor/admin
CREATE POLICY "regras_select" ON public.regras_classificacao
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "regras_insert" ON public.regras_classificacao
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() ->> 'user_role') IN ('gestor','admin'));

CREATE POLICY "regras_update" ON public.regras_classificacao
  FOR UPDATE TO authenticated
  USING ((auth.jwt() ->> 'user_role') IN ('gestor','admin'));

-- Storage: bucket privado com acesso autenticado
CREATE POLICY "storage_faturas_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'faturas-fornecedor');

CREATE POLICY "storage_faturas_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'faturas-fornecedor'
    AND (auth.jwt() ->> 'user_role') IN ('gestor','admin')
  );

CREATE POLICY "storage_faturas_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'faturas-fornecedor'
    AND (auth.jwt() ->> 'user_role') IN ('gestor','admin')
  );

-- 8. GRANTs — OBRIGATÓRIOS (Automatically expose new tables está OFF)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.faturas_fornecedor   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.linhas_fatura        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.regras_classificacao TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: classificar_e_aprender
-- Atomicamente guarda a classificação manual das linhas e actualiza as regras
-- de aprendizagem por (fornecedor, descricao_norm) com média ponderada.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.classificar_e_aprender(
  p_fatura_id UUID,
  p_linhas    JSONB   -- array de {id, destino, artigo_id, confianca}
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item          JSONB;
  v_fornecedor    TEXT;
  v_descricao_norm TEXT;
  v_destino       TEXT;
  v_artigo_id     UUID;
  v_confianca     NUMERIC;
BEGIN
  SELECT fornecedor INTO v_fornecedor
  FROM public.faturas_fornecedor
  WHERE id = p_fatura_id;

  IF v_fornecedor IS NULL THEN
    RAISE EXCEPTION 'Fatura % não encontrada', p_fatura_id;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_linhas) AS t(value)
  LOOP
    v_destino    := v_item ->> 'destino';
    v_artigo_id  := NULLIF(v_item ->> 'artigo_id', '')::UUID;
    v_confianca  := (v_item ->> 'confianca')::NUMERIC;

    -- Actualizar linha
    UPDATE public.linhas_fatura
    SET destino   = v_destino,
        artigo_id = v_artigo_id,
        confianca = v_confianca
    WHERE id = (v_item ->> 'id')::UUID;

    -- Aprender: upsert com média ponderada acumulada
    SELECT descricao_norm INTO v_descricao_norm
    FROM public.linhas_fatura
    WHERE id = (v_item ->> 'id')::UUID;

    IF v_descricao_norm IS NOT NULL AND v_destino <> 'DESCONHECIDO' THEN
      INSERT INTO public.regras_classificacao
        (fornecedor, descricao_norm, destino, artigo_id, confianca, total_usos)
      VALUES (
        v_fornecedor,
        v_descricao_norm,
        v_destino,
        v_artigo_id,
        LEAST(0.99, COALESCE(v_confianca, 0.85)),
        1
      )
      ON CONFLICT (fornecedor, descricao_norm) DO UPDATE SET
        destino    = EXCLUDED.destino,
        artigo_id  = EXCLUDED.artigo_id,
        confianca  = LEAST(0.99,
          (regras_classificacao.confianca * regras_classificacao.total_usos + EXCLUDED.confianca)
          / (regras_classificacao.total_usos + 1)
        ),
        total_usos = regras_classificacao.total_usos + 1,
        updated_at = now();
    END IF;
  END LOOP;

  -- Avançar estado para CLASSIFICADA (aceita EXTRAIDA → CLASSIFICADA e re-classificação)
  UPDATE public.faturas_fornecedor
  SET estado          = 'CLASSIFICADA',
      classificado_em = now(),
      updated_at      = now()
  WHERE id = p_fatura_id
    AND estado IN ('EXTRAIDA', 'CLASSIFICADA');
END;
$$;

GRANT EXECUTE ON FUNCTION public.classificar_e_aprender(UUID, JSONB) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: lancar_fatura
-- Atomicamente cria movimentos de stock para as linhas ARMAZEM não lançadas
-- e avança a fatura para LANCADA. Reutiliza registar_movimento para garantir
-- o mesmo advisory lock e audit log dos restantes movimentos.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lancar_fatura(
  p_fatura_id   UUID,
  p_responsavel TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_linha          RECORD;
  v_fatura_numero  TEXT;
  v_obra_id        UUID;
  v_inicio         TIMESTAMPTZ;
  v_movimento_id   UUID;
BEGIN
  -- Verificar estado
  SELECT numero_fatura, obra_id
  INTO   v_fatura_numero, v_obra_id
  FROM   public.faturas_fornecedor
  WHERE  id = p_fatura_id AND estado = 'CLASSIFICADA';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fatura % não está no estado CLASSIFICADA', p_fatura_id;
  END IF;

  v_inicio := clock_timestamp();

  -- Criar entrada de stock para cada linha ARMAZEM com artigo definido
  FOR v_linha IN
    SELECT id, artigo_id, COALESCE(quantidade, 1) AS qtd,
           COALESCE(descricao, 'Fatura ' || COALESCE(v_fatura_numero, p_fatura_id::TEXT)) AS obs
    FROM   public.linhas_fatura
    WHERE  fatura_id = p_fatura_id
      AND  destino   = 'ARMAZEM'
      AND  artigo_id IS NOT NULL
      AND  lancado   = false
  LOOP
    PERFORM public.registar_movimento(
      p_produto_id  := v_linha.artigo_id,
      p_tipo        := 'entrada',
      p_quantidade  := v_linha.qtd,
      p_responsavel := p_responsavel,
      p_observacoes := 'Fatura ' || COALESCE(v_fatura_numero, p_fatura_id::TEXT),
      p_obra_id     := v_obra_id
    );

    -- Associar o movimento recém-criado à linha (clock_timestamp garante unicidade)
    SELECT id INTO v_movimento_id
    FROM   public.movimentos_stock
    WHERE  produto_id  = v_linha.artigo_id
      AND  tipo        = 'entrada'
      AND  responsavel = p_responsavel
      AND  created_at >= v_inicio
    ORDER  BY created_at DESC
    LIMIT  1;

    UPDATE public.linhas_fatura
    SET    lancado     = true,
           movimento_id = v_movimento_id
    WHERE  id = v_linha.id;
  END LOOP;

  -- Avançar estado
  UPDATE public.faturas_fornecedor
  SET    estado    = 'LANCADA',
         lancado_em = now(),
         updated_at = now()
  WHERE  id = p_fatura_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lancar_fatura(UUID, TEXT) TO authenticated;
