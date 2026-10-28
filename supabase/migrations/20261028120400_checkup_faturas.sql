-- ================================================================
-- ENCIVIL — Checkup 2026-10-28, lote BD-4: faturas de fornecedor
--
-- A3-01  Dois lançamentos simultâneos da mesma fatura duplicavam o stock
--        (carga real: 20 pedidos → 10 sucessos, stock 100 em vez de 10):
--        a verificação de estado não bloqueava a fatura.
-- A3-04  Linhas ARMAZEM sem artigo eram saltadas em silêncio.
-- A3-05  Fatura LANCADA continuava editável e reclassificável; a classificação
--        mexia em linhas de outras faturas.
-- A3-07  movimento_id ficava sempre NULL (o SELECT por created_at >= clock_timestamp()
--        nunca encontrava o movimento) e quantidade NULL entrava como 1.
--
-- As assinaturas públicas (lancar_fatura, classificar_e_aprender) não mudam:
-- só se substituem os corpos _impl criados em 20260929000000.
--
-- APLICAR: SQL Editor do Supabase Dashboard
-- ================================================================

-- ── A3-01 / A3-04 / A3-07 — lançamento ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public._lancar_fatura_impl(
  p_fatura_id   uuid,
  p_responsavel text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fatura  public.faturas_fornecedor%ROWTYPE;
  v_linha   record;
  v_mov     public.movimentos_stock;
  v_ref     text;
BEGIN
  -- O lock serializa lançamentos concorrentes: o segundo espera pelo commit do
  -- primeiro e já encontra a fatura LANCADA.
  SELECT * INTO v_fatura
  FROM   public.faturas_fornecedor
  WHERE  id = p_fatura_id
  FOR UPDATE;

  IF NOT FOUND OR v_fatura.estado <> 'CLASSIFICADA' THEN
    RAISE EXCEPTION 'Fatura % não está no estado CLASSIFICADA', p_fatura_id;
  END IF;

  IF EXISTS (SELECT 1 FROM public.linhas_fatura
              WHERE fatura_id = p_fatura_id AND destino = 'ARMAZEM' AND NOT lancado
                AND artigo_id IS NULL) THEN
    RAISE EXCEPTION 'Há linhas para armazém sem artigo associado. Escolha o artigo ou mude o destino antes de lançar.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.linhas_fatura
              WHERE fatura_id = p_fatura_id AND destino = 'ARMAZEM' AND NOT lancado
                AND (quantidade IS NULL OR quantidade <= 0)) THEN
    RAISE EXCEPTION 'Há linhas para armazém sem quantidade válida. Corrija a quantidade antes de lançar.';
  END IF;

  v_ref := 'Fatura ' || COALESCE(v_fatura.numero_fatura, p_fatura_id::text);

  FOR v_linha IN
    SELECT id, artigo_id, quantidade
    FROM   public.linhas_fatura
    WHERE  fatura_id = p_fatura_id
      AND  destino   = 'ARMAZEM'
      AND  NOT lancado
    ORDER  BY created_at, id
  LOOP
    v_mov := public.registar_movimento(
      p_produto_id  := v_linha.artigo_id,
      p_tipo        := 'entrada',
      p_quantidade  := v_linha.quantidade,
      p_responsavel := p_responsavel,
      p_observacoes := v_ref,
      p_obra_id     := v_fatura.obra_id
    );

    UPDATE public.linhas_fatura
    SET    lancado      = true,
           movimento_id = v_mov.id
    WHERE  id = v_linha.id;
  END LOOP;

  UPDATE public.faturas_fornecedor
  SET    estado     = 'LANCADA',
         lancado_em = now(),
         updated_at = now()
  WHERE  id = p_fatura_id;
END;
$$;

REVOKE ALL ON FUNCTION public._lancar_fatura_impl(uuid, text) FROM PUBLIC, anon, authenticated;

-- ── A3-05 — classificação só antes do lançamento e só nas linhas da fatura ─
CREATE OR REPLACE FUNCTION public._classificar_e_aprender_impl(
  p_fatura_id uuid,
  p_linhas    jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item           jsonb;
  v_fatura         public.faturas_fornecedor%ROWTYPE;
  v_descricao_norm text;
  v_destino        text;
  v_artigo_id      uuid;
  v_confianca      numeric;
BEGIN
  SELECT * INTO v_fatura
  FROM   public.faturas_fornecedor
  WHERE  id = p_fatura_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fatura % não encontrada', p_fatura_id;
  END IF;
  IF v_fatura.estado NOT IN ('EXTRAIDA', 'CLASSIFICADA') THEN
    RAISE EXCEPTION 'A fatura está no estado % e já não pode ser classificada.', v_fatura.estado;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_linhas) AS t(value)
  LOOP
    v_destino   := v_item ->> 'destino';
    v_artigo_id := NULLIF(v_item ->> 'artigo_id', '')::uuid;
    v_confianca := (v_item ->> 'confianca')::numeric;
    v_descricao_norm := NULL;

    UPDATE public.linhas_fatura
    SET    destino   = v_destino,
           artigo_id = v_artigo_id,
           confianca = v_confianca
    WHERE  id = (v_item ->> 'id')::uuid
      AND  fatura_id = p_fatura_id
    RETURNING descricao_norm INTO v_descricao_norm;

    IF FOUND AND v_descricao_norm IS NOT NULL AND v_destino <> 'DESCONHECIDO' THEN
      INSERT INTO public.regras_classificacao
        (fornecedor, descricao_norm, destino, artigo_id, confianca, total_usos)
      VALUES (v_fatura.fornecedor, v_descricao_norm, v_destino, v_artigo_id,
              LEAST(0.99, COALESCE(v_confianca, 0.85)), 1)
      ON CONFLICT (fornecedor, descricao_norm) DO UPDATE SET
        destino    = EXCLUDED.destino,
        artigo_id  = EXCLUDED.artigo_id,
        confianca  = LEAST(0.99,
          (regras_classificacao.confianca * regras_classificacao.total_usos + EXCLUDED.confianca)
          / (regras_classificacao.total_usos + 1)),
        total_usos = regras_classificacao.total_usos + 1,
        updated_at = now();
    END IF;
  END LOOP;

  UPDATE public.faturas_fornecedor
  SET    estado          = 'CLASSIFICADA',
         classificado_em = now(),
         updated_at      = now()
  WHERE  id = p_fatura_id;
END;
$$;

REVOKE ALL ON FUNCTION public._classificar_e_aprender_impl(uuid, jsonb) FROM PUBLIC, anon, authenticated;


-- ── A3-05 — fatura LANCADA imutável ─────────────────────────────────────────
-- Exceção às duas funções: a ação ON DELETE SET NULL das FKs, para não bloquear
-- apagar uma obra, um artigo ou um utilizador. Só se aceita o NULL quando a linha
-- referenciada já não existe (o RI corre depois do DELETE do pai e já não a vê);
-- um UPDATE manual para NULL continua recusado. Preferido a pg_trigger_depth() > 1,
-- que deixaria passar qualquer UPDATE feito a partir de outro trigger.
-- SECURITY DEFINER: a verificação não pode depender da RLS do chamador (uma linha
-- invisível pareceria apagada) e auth.users não é legível por authenticated.

-- Linhas: nada muda depois do lançamento.
CREATE OR REPLACE FUNCTION public._linhas_fatura_lancada_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estado text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - 'artigo_id' - 'movimento_id') = (to_jsonb(OLD) - 'artigo_id' - 'movimento_id')
     AND (NEW.artigo_id IS NOT DISTINCT FROM OLD.artigo_id
          OR (NEW.artigo_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.produtos WHERE id = OLD.artigo_id)))
     AND (NEW.movimento_id IS NOT DISTINCT FROM OLD.movimento_id
          OR (NEW.movimento_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.movimentos_stock WHERE id = OLD.movimento_id))) THEN
    RETURN NEW;
  END IF;

  -- FOR SHARE: um INSERT/UPDATE concorrente com o lançamento (que tem a fatura em
  -- FOR UPDATE) espera pelo commit e relê o estado já LANCADA.
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT estado INTO v_estado FROM public.faturas_fornecedor WHERE id = OLD.fatura_id FOR SHARE;
    IF v_estado = 'LANCADA' THEN
      RAISE EXCEPTION 'A fatura já foi LANCADA: as suas linhas não podem ser alteradas.';
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT estado INTO v_estado FROM public.faturas_fornecedor WHERE id = NEW.fatura_id FOR SHARE;
    IF v_estado = 'LANCADA' THEN
      RAISE EXCEPTION 'A fatura já foi LANCADA: não se podem acrescentar linhas.';
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public._linhas_fatura_lancada_imutavel() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS linhas_fatura_lancada_imutavel ON public.linhas_fatura;
CREATE TRIGGER linhas_fatura_lancada_imutavel
  BEFORE INSERT OR UPDATE OR DELETE ON public.linhas_fatura
  FOR EACH ROW EXECUTE FUNCTION public._linhas_fatura_lancada_imutavel();

-- Fatura: depois de LANCADA só os dados fiscais/observações (atualizarDadosFiscaisFatura).
CREATE OR REPLACE FUNCTION public._fatura_lancada_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_livres text[] := ARRAY['nif_fornecedor', 'base_tributavel', 'valor_iva', 'observacoes', 'updated_at'];
BEGIN
  IF OLD.estado = 'LANCADA' THEN
    IF NEW.obra_id IS NULL AND OLD.obra_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.obras WHERE id = OLD.obra_id) THEN
      v_livres := array_append(v_livres, 'obra_id');
    END IF;
    IF NEW.criado_por IS NULL AND OLD.criado_por IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.criado_por) THEN
      v_livres := array_append(v_livres, 'criado_por');
    END IF;
    IF (to_jsonb(NEW) - v_livres) IS DISTINCT FROM (to_jsonb(OLD) - v_livres) THEN
      RAISE EXCEPTION 'A fatura já foi LANCADA: só os dados fiscais e as observações podem ser alterados.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._fatura_lancada_imutavel() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS fatura_lancada_imutavel ON public.faturas_fornecedor;
CREATE TRIGGER fatura_lancada_imutavel
  BEFORE UPDATE ON public.faturas_fornecedor
  FOR EACH ROW EXECUTE FUNCTION public._fatura_lancada_imutavel();

-- ROLLBACK
-- Repõe o lançamento sem lock (A3-01 volta a ser possível): preferir uma correção progressiva.
-- DROP TRIGGER IF EXISTS fatura_lancada_imutavel ON public.faturas_fornecedor;
-- DROP FUNCTION IF EXISTS public._fatura_lancada_imutavel();
-- DROP TRIGGER IF EXISTS linhas_fatura_lancada_imutavel ON public.linhas_fatura;
-- DROP FUNCTION IF EXISTS public._linhas_fatura_lancada_imutavel();
--
-- CREATE OR REPLACE FUNCTION public._lancar_fatura_impl(p_fatura_id uuid, p_responsavel text)
-- RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- DECLARE
--   v_linha RECORD; v_fatura_numero TEXT; v_obra_id UUID; v_inicio TIMESTAMPTZ; v_movimento_id UUID;
-- BEGIN
--   SELECT numero_fatura, obra_id INTO v_fatura_numero, v_obra_id
--   FROM public.faturas_fornecedor WHERE id = p_fatura_id AND estado = 'CLASSIFICADA';
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'Fatura % não está no estado CLASSIFICADA', p_fatura_id;
--   END IF;
--   v_inicio := clock_timestamp();
--   FOR v_linha IN
--     SELECT id, artigo_id, COALESCE(quantidade, 1) AS qtd
--     FROM public.linhas_fatura
--     WHERE fatura_id = p_fatura_id AND destino = 'ARMAZEM' AND artigo_id IS NOT NULL AND lancado = false
--   LOOP
--     PERFORM public.registar_movimento(
--       p_produto_id := v_linha.artigo_id, p_tipo := 'entrada', p_quantidade := v_linha.qtd,
--       p_responsavel := p_responsavel,
--       p_observacoes := 'Fatura ' || COALESCE(v_fatura_numero, p_fatura_id::TEXT),
--       p_obra_id := v_obra_id);
--     SELECT id INTO v_movimento_id FROM public.movimentos_stock
--     WHERE produto_id = v_linha.artigo_id AND tipo = 'entrada' AND responsavel = p_responsavel
--       AND created_at >= v_inicio
--     ORDER BY created_at DESC LIMIT 1;
--     UPDATE public.linhas_fatura SET lancado = true, movimento_id = v_movimento_id WHERE id = v_linha.id;
--   END LOOP;
--   UPDATE public.faturas_fornecedor SET estado = 'LANCADA', lancado_em = now(), updated_at = now()
--   WHERE id = p_fatura_id;
-- END;
-- $$;
-- REVOKE ALL ON FUNCTION public._lancar_fatura_impl(uuid, text) FROM PUBLIC, anon, authenticated;
--
-- CREATE OR REPLACE FUNCTION public._classificar_e_aprender_impl(p_fatura_id uuid, p_linhas jsonb)
-- RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- DECLARE
--   v_item JSONB; v_fornecedor TEXT; v_descricao_norm TEXT; v_destino TEXT; v_artigo_id UUID; v_confianca NUMERIC;
-- BEGIN
--   SELECT fornecedor INTO v_fornecedor FROM public.faturas_fornecedor WHERE id = p_fatura_id;
--   IF v_fornecedor IS NULL THEN
--     RAISE EXCEPTION 'Fatura % não encontrada', p_fatura_id;
--   END IF;
--   FOR v_item IN SELECT value FROM jsonb_array_elements(p_linhas) AS t(value)
--   LOOP
--     v_destino   := v_item ->> 'destino';
--     v_artigo_id := NULLIF(v_item ->> 'artigo_id', '')::UUID;
--     v_confianca := (v_item ->> 'confianca')::NUMERIC;
--     UPDATE public.linhas_fatura SET destino = v_destino, artigo_id = v_artigo_id, confianca = v_confianca
--     WHERE id = (v_item ->> 'id')::UUID;
--     SELECT descricao_norm INTO v_descricao_norm FROM public.linhas_fatura WHERE id = (v_item ->> 'id')::UUID;
--     IF v_descricao_norm IS NOT NULL AND v_destino <> 'DESCONHECIDO' THEN
--       INSERT INTO public.regras_classificacao (fornecedor, descricao_norm, destino, artigo_id, confianca, total_usos)
--       VALUES (v_fornecedor, v_descricao_norm, v_destino, v_artigo_id, LEAST(0.99, COALESCE(v_confianca, 0.85)), 1)
--       ON CONFLICT (fornecedor, descricao_norm) DO UPDATE SET
--         destino = EXCLUDED.destino, artigo_id = EXCLUDED.artigo_id,
--         confianca = LEAST(0.99, (regras_classificacao.confianca * regras_classificacao.total_usos + EXCLUDED.confianca)
--                                 / (regras_classificacao.total_usos + 1)),
--         total_usos = regras_classificacao.total_usos + 1, updated_at = now();
--     END IF;
--   END LOOP;
--   UPDATE public.faturas_fornecedor SET estado = 'CLASSIFICADA', classificado_em = now(), updated_at = now()
--   WHERE id = p_fatura_id AND estado IN ('EXTRAIDA', 'CLASSIFICADA');
-- END;
-- $$;
-- REVOKE ALL ON FUNCTION public._classificar_e_aprender_impl(uuid, jsonb) FROM PUBLIC, anon, authenticated;
