-- ================================================================
-- ENCIVIL — Controlo de subempreitadas (Migration A, 2026-10-04)
-- Desenho: docs/superpowers/specs/2026-10-04-controlo-subempreitadas-design.md §2 "Migration A"
-- Requer: 20261003000000_obras_completo.sql. A seguir vem 20261004010000 (workflow, glosas, painel).
--
--  1. subs_config: configuração única (singleton) das regras de subempreitadas; só o admin altera.
--  2. obra_orcamento_itens: EAP + orçamento de controlo por obra (quantidade e custo orçados).
--  3. subempreiteiro_artigos.orcamento_item_id: cada artigo do contrato liga-se a um item EAP
--     da MESMA obra; validar_subempreiteiro recusa contratar acima do orçado (com tolerância).
--  4. sub_documentos: documentos legais do subempreiteiro (Segurança Social, Finanças, alvará,
--     seguros) no bucket privado "obras-contratos", com estado de validade.
--  5. auto_evidencias: fotografias de prova dos autos (imutáveis), com hora do servidor,
--     hash anti-reutilização, GPS, precisão e geofence ao centro da obra.
--  6. Armazenamento: o bucket privado "obras-contratos" aceita também
--     <subempreiteiro>/doc-<ts>.<ext> e <subempreiteiro>/fatura-<ts>.<ext>
--     (o ERP NÃO emite faturas: apenas guarda as que os subempreiteiros emitem).
--
-- Regras:
--   • Leitura da configuração: pode_ler_obras(). Escrita: só admin (com audit_log).
--   • Orçamento: escreve pode_gerir_obras() (admin, gestor); lê pode_ver_obra(obra).
--     Capítulo = prefixo do código antes do 1.º ponto ("02.03" → "02").
--     Resumo: contratado = artigos de contratos validados; medido = linhas de autos validados;
--     estado 'excedido' se contratado > orçado × (1 + tolerância/100); 'atencao' se ≥ 90 % do orçado.
--   • Excesso: a soma das quantidades contratadas (contratos validados + o que se valida) por item
--     não pode passar o orçado × (1 + tolerância/100). Artigos sem item EAP são aceites (dados antigos).
--     Contratos validados arquivados continuam a contar (o que foi contratado foi consumido).
--   • Documentos: regista pode_escrever('subempreitadas'); remove pode_gerir_obras() (com audit_log).
--     Conta o documento mais recente por tipo (data de emissão, depois data de registo);
--     sem validade = 'ok'; validade < hoje = 'expirado'; até aviso_validade_dias = 'a_expirar'.
--     _sub_docs_bloqueio devolve os obrigatórios em falta/expirados e NÃO aplica
--     subs_config.bloquear_pagamento_sem_docs — essa decisão é das RPCs que a usam (Migration B).
--   • Evidências: regista pode_medir_obras() com o auto editável (estado 'rascunho' e, quando a
--     coluna workflow existir, workflow 'rascunho' ou 'submetido'). Apagar: só com workflow
--     'rascunho' (desenho), por quem a enviou, pelo gestor ou pelo administrador.
--     Rejeita: caminho fora de <obra>/autos/<ts>-<rand>.<ext>, hora no futuro (> 2 min) ou mais
--     antiga que foto_idade_max_min, hash repetido. Marca valida=false (não rejeita) com
--     motivo_invalida, por esta prioridade: sem_gps · obra_sem_coordenadas ·
--     precisao_insuficiente (precisão em falta ou > precisao_max_m) · fora_do_raio
--     (distância haversine ao centro obras.latitude/longitude > COALESCE(geofence_raio_m, raio_padrao_m)).
--   • Armazenamento "obras-contratos": contrato-/doc- envia pode_escrever('subempreitadas'),
--     fatura- envia pode_gerir_obras(). Apagar: contrato- pode_escrever('subempreitadas'),
--     doc- pode_gerir_obras(), fatura- só admin (é prova fiscal).
--   • Eventos novos em obra_eventos: ORCAMENTO_ITEM, SUB_DOC.
--   • Tabelas novas só com SELECT (RLS); toda a escrita passa por RPC SECURITY DEFINER.
--
-- APLICAR: SQL Editor, depois de 20261003000000. Idempotente.
-- ================================================================

-- ── 1. Configuração ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subs_config (
  id                          boolean      PRIMARY KEY DEFAULT true CHECK (id),
  retencao_padrao_pct         numeric(5,2) NOT NULL DEFAULT 5,
  prazo_pagamento_dias        integer      NOT NULL DEFAULT 30,
  alcada_gestor_ate           numeric(14,2) NOT NULL DEFAULT 10000,
  docs_obrigatorios           text[]       NOT NULL DEFAULT '{CERT_SS,CERT_AT,SEGURO_AT,ALVARA}',
  bloquear_pagamento_sem_docs boolean      NOT NULL DEFAULT true,
  exigir_fatura_para_pagar    boolean      NOT NULL DEFAULT true,
  aviso_validade_dias         integer      NOT NULL DEFAULT 30,
  raio_padrao_m               integer      NOT NULL DEFAULT 300,
  precisao_max_m              integer      NOT NULL DEFAULT 50,
  foto_idade_max_min          integer      NOT NULL DEFAULT 120,
  min_fotos_verificacao       integer      NOT NULL DEFAULT 2,
  checklist_padrao            jsonb        NOT NULL DEFAULT jsonb_build_array(
    'Execução conforme projeto e caderno de encargos',
    'Quantidades confirmadas em obra',
    'Qualidade do acabamento / ensaios, quando aplicável',
    'Segurança: EPI e proteções coletivas',
    'Limpeza e arrumação da frente de trabalho'),
  atualizado_em               timestamptz  NOT NULL DEFAULT now(),
  atualizado_por              uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT ck_subs_cfg_retencao  CHECK (retencao_padrao_pct BETWEEN 0 AND 20),
  CONSTRAINT ck_subs_cfg_prazo     CHECK (prazo_pagamento_dias BETWEEN 0 AND 180),
  CONSTRAINT ck_subs_cfg_alcada    CHECK (alcada_gestor_ate BETWEEN 0 AND 10000000),
  CONSTRAINT ck_subs_cfg_docs      CHECK (docs_obrigatorios <@ ARRAY['CERT_SS', 'CERT_AT', 'ALVARA', 'SEGURO_AT', 'SEGURO_RC', 'OUTRO']
                                          AND array_position(docs_obrigatorios, NULL) IS NULL),
  CONSTRAINT ck_subs_cfg_aviso     CHECK (aviso_validade_dias BETWEEN 0 AND 365),
  CONSTRAINT ck_subs_cfg_raio      CHECK (raio_padrao_m BETWEEN 10 AND 5000),
  CONSTRAINT ck_subs_cfg_precisao  CHECK (precisao_max_m BETWEEN 5 AND 1000),
  CONSTRAINT ck_subs_cfg_idade     CHECK (foto_idade_max_min BETWEEN 5 AND 1440),
  CONSTRAINT ck_subs_cfg_min_fotos CHECK (min_fotos_verificacao BETWEEN 0 AND 20),
  CONSTRAINT ck_subs_cfg_checklist CHECK (jsonb_typeof(checklist_padrao) = 'array'
                                          AND jsonb_array_length(checklist_padrao) BETWEEN 1 AND 30)
);

INSERT INTO public.subs_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- Lida pelas RPCs (SECURITY DEFINER) sem depender do papel de quem chama
CREATE OR REPLACE FUNCTION public._subs_cfg()
RETURNS public.subs_config
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT * FROM public.subs_config WHERE id $$;

CREATE OR REPLACE FUNCTION public.subs_config_ler()
RETURNS public.subs_config
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.pode_ler_obras() THEN
    RAISE EXCEPTION 'Sem permissão para ver a configuração das subempreitadas';
  END IF;
  RETURN public._subs_cfg();
END;
$$;

CREATE OR REPLACE FUNCTION public.subs_config_guardar(p_cfg jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old   public.subs_config%ROWTYPE;
  v_new   public.subs_config%ROWTYPE;
  v_campo text;
  v_item  jsonb;
  v_campos constant text[] := ARRAY['retencao_padrao_pct', 'prazo_pagamento_dias', 'alcada_gestor_ate', 'docs_obrigatorios',
    'bloquear_pagamento_sem_docs', 'exigir_fatura_para_pagar', 'aviso_validade_dias', 'raio_padrao_m', 'precisao_max_m',
    'foto_idade_max_min', 'min_fotos_verificacao', 'checklist_padrao'];
BEGIN
  IF public.auth_role() <> 'admin' THEN
    RAISE EXCEPTION 'Só o administrador pode alterar a configuração das subempreitadas';
  END IF;
  IF p_cfg IS NULL OR jsonb_typeof(p_cfg) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Configuração inválida';
  END IF;
  SELECT k INTO v_campo FROM jsonb_object_keys(p_cfg) k WHERE k <> ALL (v_campos) ORDER BY k LIMIT 1;
  IF v_campo IS NOT NULL THEN
    RAISE EXCEPTION 'Campo de configuração desconhecido: %', v_campo;
  END IF;
  IF p_cfg ? 'docs_obrigatorios' AND jsonb_typeof(p_cfg -> 'docs_obrigatorios') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Os documentos obrigatórios têm de ser uma lista';
  END IF;
  IF p_cfg ? 'checklist_padrao' AND jsonb_typeof(p_cfg -> 'checklist_padrao') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'A lista de verificação tem de ser uma lista';
  END IF;

  SELECT * INTO v_old FROM public.subs_config WHERE id FOR UPDATE;
  BEGIN
    v_new := jsonb_populate_record(v_old, p_cfg);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Valor inválido na configuração';
  END;

  IF v_new.retencao_padrao_pct IS NULL OR v_new.retencao_padrao_pct NOT BETWEEN 0 AND 20 THEN
    RAISE EXCEPTION 'A retenção padrão tem de estar entre 0 e 20 %%';
  END IF;
  IF v_new.prazo_pagamento_dias IS NULL OR v_new.prazo_pagamento_dias NOT BETWEEN 0 AND 180 THEN
    RAISE EXCEPTION 'O prazo de pagamento tem de estar entre 0 e 180 dias';
  END IF;
  IF v_new.alcada_gestor_ate IS NULL OR v_new.alcada_gestor_ate NOT BETWEEN 0 AND 10000000 THEN
    RAISE EXCEPTION 'A alçada do gestor tem de estar entre 0 e 10 000 000 €';
  END IF;
  IF v_new.docs_obrigatorios IS NULL OR array_position(v_new.docs_obrigatorios, NULL) IS NOT NULL
     OR NOT v_new.docs_obrigatorios <@ ARRAY['CERT_SS', 'CERT_AT', 'ALVARA', 'SEGURO_AT', 'SEGURO_RC', 'OUTRO'] THEN
    RAISE EXCEPTION 'Tipo de documento obrigatório inválido';
  END IF;
  IF cardinality(v_new.docs_obrigatorios) <> (SELECT count(DISTINCT d) FROM unnest(v_new.docs_obrigatorios) d) THEN
    RAISE EXCEPTION 'Os documentos obrigatórios têm tipos repetidos';
  END IF;
  IF v_new.bloquear_pagamento_sem_docs IS NULL OR v_new.exigir_fatura_para_pagar IS NULL THEN
    RAISE EXCEPTION 'Indique sim ou não nas regras de pagamento';
  END IF;
  IF v_new.aviso_validade_dias IS NULL OR v_new.aviso_validade_dias NOT BETWEEN 0 AND 365 THEN
    RAISE EXCEPTION 'O aviso de validade tem de estar entre 0 e 365 dias';
  END IF;
  IF v_new.raio_padrao_m IS NULL OR v_new.raio_padrao_m NOT BETWEEN 10 AND 5000 THEN
    RAISE EXCEPTION 'O raio padrão da obra tem de estar entre 10 e 5000 metros';
  END IF;
  IF v_new.precisao_max_m IS NULL OR v_new.precisao_max_m NOT BETWEEN 5 AND 1000 THEN
    RAISE EXCEPTION 'A precisão máxima do GPS tem de estar entre 5 e 1000 metros';
  END IF;
  IF v_new.foto_idade_max_min IS NULL OR v_new.foto_idade_max_min NOT BETWEEN 5 AND 1440 THEN
    RAISE EXCEPTION 'A idade máxima da fotografia tem de estar entre 5 e 1440 minutos';
  END IF;
  IF v_new.min_fotos_verificacao IS NULL OR v_new.min_fotos_verificacao NOT BETWEEN 0 AND 20 THEN
    RAISE EXCEPTION 'O mínimo de fotografias na verificação tem de estar entre 0 e 20';
  END IF;
  IF v_new.checklist_padrao IS NULL OR jsonb_array_length(v_new.checklist_padrao) NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'A lista de verificação tem de ter entre 1 e 30 itens';
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_new.checklist_padrao) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'string' OR btrim(v_item #>> '{}') = '' OR length(v_item #>> '{}') > 300 THEN
      RAISE EXCEPTION 'Cada item da lista de verificação tem de ser um texto entre 1 e 300 caracteres';
    END IF;
  END LOOP;

  UPDATE public.subs_config
     SET retencao_padrao_pct = v_new.retencao_padrao_pct, prazo_pagamento_dias = v_new.prazo_pagamento_dias,
         alcada_gestor_ate = v_new.alcada_gestor_ate, docs_obrigatorios = v_new.docs_obrigatorios,
         bloquear_pagamento_sem_docs = v_new.bloquear_pagamento_sem_docs, exigir_fatura_para_pagar = v_new.exigir_fatura_para_pagar,
         aviso_validade_dias = v_new.aviso_validade_dias, raio_padrao_m = v_new.raio_padrao_m, precisao_max_m = v_new.precisao_max_m,
         foto_idade_max_min = v_new.foto_idade_max_min, min_fotos_verificacao = v_new.min_fotos_verificacao,
         checklist_padrao = (SELECT jsonb_agg(to_jsonb(btrim(x))) FROM jsonb_array_elements_text(v_new.checklist_padrao) x),
         atualizado_em = now(), atualizado_por = auth.uid()
   WHERE id
  RETURNING * INTO v_new;

  INSERT INTO public.audit_log (actor_id, action, target_id, details)
  VALUES (auth.uid(), 'subs_config_guardar', NULL, jsonb_build_object('antes', to_jsonb(v_old), 'depois', to_jsonb(v_new)));
END;
$$;

-- ── 2. Orçamento de controlo (EAP) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.obra_orcamento_itens (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id        uuid          NOT NULL REFERENCES public.obras(id),
  codigo         text          NOT NULL,
  descricao      text          NOT NULL,
  unidade        text          NOT NULL,
  quantidade     numeric(14,3) NOT NULL DEFAULT 0,
  preco_unitario numeric(14,4) NOT NULL DEFAULT 0,
  tolerancia_pct numeric(5,2)  NOT NULL DEFAULT 0,
  ativo          boolean       NOT NULL DEFAULT true,
  criado_em      timestamptz   NOT NULL DEFAULT now(),
  atualizado_em  timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT ux_obra_orcamento_codigo UNIQUE (obra_id, codigo),
  CONSTRAINT ck_orc_codigo     CHECK (codigo ~ '^[0-9A-Za-z]{1,10}(\.[0-9A-Za-z]{1,10}){0,5}$'),
  CONSTRAINT ck_orc_descricao  CHECK (length(btrim(descricao)) BETWEEN 1 AND 300),
  CONSTRAINT ck_orc_unidade    CHECK (length(btrim(unidade)) BETWEEN 1 AND 20),
  CONSTRAINT ck_orc_quantidade CHECK (quantidade >= 0),
  CONSTRAINT ck_orc_preco      CHECK (preco_unitario >= 0),
  CONSTRAINT ck_orc_tolerancia CHECK (tolerancia_pct BETWEEN 0 AND 20)
);
CREATE INDEX IF NOT EXISTS idx_obra_orcamento_obra ON public.obra_orcamento_itens (obra_id, codigo);

ALTER TABLE public.subempreiteiro_artigos
  ADD COLUMN IF NOT EXISTS orcamento_item_id uuid REFERENCES public.obra_orcamento_itens(id);
CREATE INDEX IF NOT EXISTS idx_artigos_orcamento_item ON public.subempreiteiro_artigos (orcamento_item_id)
  WHERE orcamento_item_id IS NOT NULL;

-- A escrita direta dos artigos mantém-se (rascunho, pela RLS); o item tem de ser da obra do contrato
CREATE OR REPLACE FUNCTION public._trg_artigo_orcamento_obra()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.orcamento_item_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.orcamento_item_id IS NOT DISTINCT FROM OLD.orcamento_item_id
     AND NEW.subempreiteiro_id IS NOT DISTINCT FROM OLD.subempreiteiro_id THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.obra_orcamento_itens i
      JOIN public.subempreiteiros s ON s.obra_id = i.obra_id
     WHERE i.id = NEW.orcamento_item_id AND s.id = NEW.subempreiteiro_id
  ) THEN
    RAISE EXCEPTION 'O item de orçamento tem de pertencer à obra da contratação';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_artigo_orcamento_obra ON public.subempreiteiro_artigos;
CREATE TRIGGER trg_artigo_orcamento_obra
  BEFORE INSERT OR UPDATE ON public.subempreiteiro_artigos
  FOR EACH ROW EXECUTE FUNCTION public._trg_artigo_orcamento_obra();

-- Sem isto, mudar a obra de um contrato em rascunho deixava artigos ligados à EAP de outra obra
CREATE OR REPLACE FUNCTION public._trg_sub_obra_orcamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.obra_id IS DISTINCT FROM OLD.obra_id AND EXISTS (
    SELECT 1 FROM public.subempreiteiro_artigos a WHERE a.subempreiteiro_id = NEW.id AND a.orcamento_item_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Não é possível mudar a obra desta contratação: há artigos ligados ao orçamento da obra';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sub_obra_orcamento ON public.subempreiteiros;
CREATE TRIGGER trg_sub_obra_orcamento
  BEFORE UPDATE OF obra_id ON public.subempreiteiros
  FOR EACH ROW EXECUTE FUNCTION public._trg_sub_obra_orcamento();

CREATE OR REPLACE FUNCTION public.obra_orcamento_guardar_item(
  p_obra_id        uuid,
  p_id             uuid    DEFAULT NULL,
  p_codigo         text    DEFAULT NULL,
  p_descricao      text    DEFAULT NULL,
  p_unidade        text    DEFAULT NULL,
  p_quantidade     numeric DEFAULT NULL,
  p_preco_unitario numeric DEFAULT NULL,
  p_tolerancia_pct numeric DEFAULT 0
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codigo text := btrim(p_codigo);
  v_desc   text := NULLIF(btrim(p_descricao), '');
  v_un     text := NULLIF(btrim(p_unidade), '');
  v_tol    numeric := COALESCE(p_tolerancia_pct, 0);
  v_id     uuid;
BEGIN
  IF NOT public.pode_gerir_obras() THEN
    RAISE EXCEPTION 'Sem permissão para alterar o orçamento da obra';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.obras WHERE id = p_obra_id) THEN
    RAISE EXCEPTION 'Obra não encontrada';
  END IF;
  IF p_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.obra_orcamento_itens WHERE id = p_id AND obra_id = p_obra_id) THEN
    RAISE EXCEPTION 'Item de orçamento não encontrado';
  END IF;
  IF v_codigo IS NULL OR v_codigo = '' THEN
    RAISE EXCEPTION 'Indique o código do item (EAP)';
  END IF;
  IF v_codigo !~ '^[0-9A-Za-z]{1,10}(\.[0-9A-Za-z]{1,10}){0,5}$' THEN
    RAISE EXCEPTION 'Código EAP inválido (ex.: 02.03)';
  END IF;
  IF v_desc IS NULL THEN
    RAISE EXCEPTION 'Indique a descrição do item';
  END IF;
  IF length(v_desc) > 300 THEN
    RAISE EXCEPTION 'A descrição é demasiado longa (máximo 300 caracteres)';
  END IF;
  IF v_un IS NULL OR length(v_un) > 20 THEN
    RAISE EXCEPTION 'Indique a unidade (máximo 20 caracteres)';
  END IF;
  IF p_quantidade IS NULL OR p_quantidade < 0 THEN
    RAISE EXCEPTION 'Quantidade inválida';
  END IF;
  IF p_preco_unitario IS NULL OR p_preco_unitario < 0 THEN
    RAISE EXCEPTION 'Preço unitário inválido';
  END IF;
  IF v_tol < 0 OR v_tol > 20 THEN
    RAISE EXCEPTION 'A tolerância tem de estar entre 0 e 20 %%';
  END IF;
  IF EXISTS (SELECT 1 FROM public.obra_orcamento_itens
              WHERE obra_id = p_obra_id AND codigo = v_codigo AND id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'Já existe um item com o código % nesta obra', v_codigo;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.obra_orcamento_itens (obra_id, codigo, descricao, unidade, quantidade, preco_unitario, tolerancia_pct)
    VALUES (p_obra_id, v_codigo, v_desc, v_un, p_quantidade, p_preco_unitario, v_tol)
    RETURNING id INTO v_id;
    PERFORM public._obra_evento(p_obra_id, 'ORCAMENTO_ITEM', 'Item de orçamento criado: ' || v_codigo, v_desc);
  ELSE
    UPDATE public.obra_orcamento_itens
       SET codigo = v_codigo, descricao = v_desc, unidade = v_un, quantidade = p_quantidade,
           preco_unitario = p_preco_unitario, tolerancia_pct = v_tol, atualizado_em = now()
     WHERE id = p_id
    RETURNING id INTO v_id;
    PERFORM public._obra_evento(p_obra_id, 'ORCAMENTO_ITEM', 'Item de orçamento atualizado: ' || v_codigo, v_desc);
  END IF;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Já existe um item com o código % nesta obra', v_codigo;
END;
$$;

CREATE OR REPLACE FUNCTION public.obra_orcamento_apagar_item(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_i public.obra_orcamento_itens%ROWTYPE;
BEGIN
  IF NOT public.pode_gerir_obras() THEN
    RAISE EXCEPTION 'Sem permissão para alterar o orçamento da obra';
  END IF;
  SELECT * INTO v_i FROM public.obra_orcamento_itens WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item de orçamento não encontrado';
  END IF;
  IF EXISTS (SELECT 1 FROM public.subempreiteiro_artigos WHERE orcamento_item_id = p_id) THEN
    RAISE EXCEPTION 'Este item tem artigos de contratos ligados — não pode ser apagado';
  END IF;
  DELETE FROM public.obra_orcamento_itens WHERE id = p_id;
  PERFORM public._obra_evento(v_i.obra_id, 'ORCAMENTO_ITEM', 'Item de orçamento apagado: ' || v_i.codigo, v_i.descricao);
  INSERT INTO public.audit_log (actor_id, action, target_id, details)
  VALUES (auth.uid(), 'obra_orcamento_apagar_item', p_id, to_jsonb(v_i));
END;
$$;

CREATE OR REPLACE FUNCTION public.obra_orcamento_resumo(p_obra_id uuid)
RETURNS TABLE (
  item_id uuid, codigo text, descricao text, unidade text,
  orcado_qtd numeric, orcado_valor numeric, contratado_qtd numeric, contratado_valor numeric,
  medido_qtd numeric, medido_valor numeric, saldo_qtd numeric, saldo_valor numeric,
  perc_contratado numeric, perc_medido numeric, n_artigos integer, estado text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.pode_ver_obra(p_obra_id) OR NOT EXISTS (SELECT 1 FROM public.obras WHERE id = p_obra_id) THEN
    RAISE EXCEPTION 'Obra não encontrada';
  END IF;
  RETURN QUERY
  WITH it AS (
    SELECT i.* FROM public.obra_orcamento_itens i WHERE i.obra_id = p_obra_id AND i.ativo
  ),
  ct AS (
    SELECT a.orcamento_item_id AS iid,
           count(*)::int AS n,
           COALESCE(sum(a.quantidade_prevista) FILTER (WHERE s.estado = 'validado'), 0) AS qtd,
           COALESCE(sum(a.quantidade_prevista * a.preco_unitario) FILTER (WHERE s.estado = 'validado'), 0) AS valor
      FROM public.subempreiteiro_artigos a
      JOIN public.subempreiteiros s ON s.id = a.subempreiteiro_id
     WHERE a.orcamento_item_id IN (SELECT id FROM it)
     GROUP BY a.orcamento_item_id
  ),
  md AS (
    SELECT a.orcamento_item_id AS iid,
           COALESCE(sum(l.quantidade), 0) AS qtd,
           COALESCE(sum(l.quantidade * l.preco_unitario), 0) AS valor
      FROM public.auto_linhas l
      JOIN public.autos_medicao am ON am.id = l.auto_id AND am.estado = 'validado'
      JOIN public.subempreiteiro_artigos a ON a.id = l.artigo_id
     WHERE a.orcamento_item_id IN (SELECT id FROM it)
     GROUP BY a.orcamento_item_id
  )
  SELECT it.id, it.codigo, it.descricao, it.unidade,
         it.quantidade, round(it.quantidade * it.preco_unitario, 2),
         COALESCE(ct.qtd, 0), round(COALESCE(ct.valor, 0), 2),
         COALESCE(md.qtd, 0), round(COALESCE(md.valor, 0), 2),
         it.quantidade - COALESCE(ct.qtd, 0), round(it.quantidade * it.preco_unitario - COALESCE(ct.valor, 0), 2),
         CASE WHEN it.quantidade > 0 THEN round(COALESCE(ct.qtd, 0) / it.quantidade * 100, 2) END,
         CASE WHEN it.quantidade > 0 THEN round(COALESCE(md.qtd, 0) / it.quantidade * 100, 2) END,
         COALESCE(ct.n, 0),
         CASE WHEN COALESCE(ct.qtd, 0) > it.quantidade * (1 + it.tolerancia_pct / 100) THEN 'excedido'
              WHEN it.quantidade > 0 AND COALESCE(ct.qtd, 0) >= it.quantidade * 0.9 THEN 'atencao'
              ELSE 'ok' END
    FROM it
    LEFT JOIN ct ON ct.iid = it.id
    LEFT JOIN md ON md.iid = it.id
   ORDER BY it.codigo;
END;
$$;

-- ── 3. Validar a contratação: mantém tudo e bloqueia o excesso de orçamento ──
CREATE OR REPLACE FUNCTION public.validar_subempreiteiro(p_id uuid)
RETURNS public.subempreiteiros
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row     public.subempreiteiros%ROWTYPE;
  v_artigos integer;
  v_exc     record;
BEGIN
  IF public.auth_role() <> 'admin' THEN
    RAISE EXCEPTION 'Apenas administradores podem validar contratações.';
  END IF;

  SELECT * INTO v_row FROM public.subempreiteiros WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contratação não encontrada.';
  END IF;
  IF v_row.estado = 'validado' THEN
    RAISE EXCEPTION 'Esta contratação já está validada.';
  END IF;

  IF v_row.tipo = 'global' AND (v_row.valor_global IS NULL OR v_row.valor_global <= 0) THEN
    RAISE EXCEPTION 'Defina o valor acordado antes de validar.';
  END IF;
  IF v_row.tipo = 'unitario' THEN
    SELECT count(*) INTO v_artigos FROM public.subempreiteiro_artigos WHERE subempreiteiro_id = p_id;
    IF v_artigos = 0 THEN
      RAISE EXCEPTION 'Adicione pelo menos um artigo antes de validar.';
    END IF;
  END IF;

  -- Duas validações em simultâneo na mesma obra não podem, juntas, passar o orçamento
  PERFORM pg_advisory_xact_lock(('x' || substr(md5('subs_orcamento:' || v_row.obra_id::text), 1, 16))::bit(64)::bigint);

  SELECT i.codigo, i.quantidade AS orcado, sum(a.quantidade_prevista) AS contratado
    INTO v_exc
    FROM public.obra_orcamento_itens i
    JOIN public.subempreiteiro_artigos a ON a.orcamento_item_id = i.id
    JOIN public.subempreiteiros s ON s.id = a.subempreiteiro_id
   WHERE i.id IN (SELECT x.orcamento_item_id FROM public.subempreiteiro_artigos x
                   WHERE x.subempreiteiro_id = p_id AND x.orcamento_item_id IS NOT NULL)
     AND (s.id = p_id OR s.estado = 'validado')
   GROUP BY i.id, i.codigo, i.quantidade, i.tolerancia_pct
  HAVING sum(a.quantidade_prevista) > i.quantidade * (1 + i.tolerancia_pct / 100)
   ORDER BY i.codigo
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Excede o orçamento de controlo em %: contratado %, orçado %',
      v_exc.codigo, trim_scale(v_exc.contratado), trim_scale(v_exc.orcado);
  END IF;

  UPDATE public.subempreiteiros
     SET estado = 'validado', validado_por = auth.uid(), validado_em = now()
   WHERE id = p_id
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (actor_id, action, target_id, details)
  VALUES (auth.uid(), 'validar_subempreiteiro', p_id,
    jsonb_build_object('nome', v_row.nome, 'obra_id', v_row.obra_id, 'tipo', v_row.tipo, 'valor_global', v_row.valor_global));

  RETURN v_row;
END;
$$;

-- ── 4. Documentos legais do subempreiteiro ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sub_documentos (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subempreiteiro_id uuid        NOT NULL REFERENCES public.subempreiteiros(id),
  tipo              text        NOT NULL,
  referencia        text,
  emitido_em        date,
  validade          date,
  path              text        NOT NULL,
  nome              text,
  criado_por        uuid        REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  criado_em         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_sub_doc_tipo   CHECK (tipo IN ('CERT_SS', 'CERT_AT', 'ALVARA', 'SEGURO_AT', 'SEGURO_RC', 'OUTRO')),
  CONSTRAINT ck_sub_doc_datas  CHECK (emitido_em IS NULL OR validade IS NULL OR validade >= emitido_em),
  CONSTRAINT ck_sub_doc_path   CHECK (path ~ ('^' || subempreiteiro_id::text || '/doc-[0-9]{1,16}\.(pdf|jpg|jpeg|png|webp|heic|heif)$')),
  CONSTRAINT ck_sub_doc_textos CHECK ((referencia IS NULL OR length(referencia) <= 100) AND (nome IS NULL OR length(nome) <= 200)),
  CONSTRAINT ux_sub_doc_path   UNIQUE (path)
);
CREATE INDEX IF NOT EXISTS idx_sub_documentos_sub ON public.sub_documentos (subempreiteiro_id, tipo, emitido_em DESC);

-- Núcleo de sub_docs_estado sem verificação de papel (usado também pelas RPCs de pagamento)
CREATE OR REPLACE FUNCTION public._sub_docs_estado(p_sub_id uuid)
RETURNS TABLE (tipo text, obrigatorio boolean, estado text, validade date, dias_restantes integer, doc_id uuid, referencia text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cfg AS (SELECT * FROM public._subs_cfg()),
  hoje AS (SELECT public._hoje_pt() AS d),
  ult AS (
    SELECT DISTINCT ON (d.tipo) d.*
      FROM public.sub_documentos d
     WHERE d.subempreiteiro_id = p_sub_id
     ORDER BY d.tipo, d.emitido_em DESC NULLS LAST, d.criado_em DESC, d.id DESC
  ),
  tipos AS (
    SELECT t.tipo, t.ord::int AS ord, true AS obrigatorio
      FROM cfg, unnest(cfg.docs_obrigatorios) WITH ORDINALITY AS t(tipo, ord)
    UNION ALL
    SELECT u.tipo, 100 + array_position(ARRAY['CERT_SS', 'CERT_AT', 'ALVARA', 'SEGURO_AT', 'SEGURO_RC', 'OUTRO'], u.tipo), false
      FROM ult u, cfg
     WHERE u.tipo <> ALL (cfg.docs_obrigatorios)
  )
  SELECT t.tipo, t.obrigatorio,
         CASE WHEN u.id IS NULL THEN 'em_falta'
              WHEN u.validade IS NULL THEN 'ok'
              WHEN u.validade < h.d THEN 'expirado'
              WHEN u.validade - h.d <= cfg.aviso_validade_dias THEN 'a_expirar'
              ELSE 'ok' END,
         u.validade,
         CASE WHEN u.validade IS NOT NULL THEN u.validade - h.d END,
         u.id, u.referencia
    FROM tipos t
    CROSS JOIN cfg
    CROSS JOIN hoje h
    LEFT JOIN ult u ON u.tipo = t.tipo
   ORDER BY t.ord
$$;

CREATE OR REPLACE FUNCTION public.sub_docs_estado(p_sub_id uuid)
RETURNS TABLE (tipo text, obrigatorio boolean, estado text, validade date, dias_restantes integer, doc_id uuid, referencia text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_obra uuid;
BEGIN
  SELECT s.obra_id INTO v_obra FROM public.subempreiteiros s WHERE s.id = p_sub_id;
  IF NOT FOUND OR NOT public.pode_ver_obra(v_obra) THEN
    RAISE EXCEPTION 'Contratação não encontrada';
  END IF;
  RETURN QUERY SELECT * FROM public._sub_docs_estado(p_sub_id);
END;
$$;

CREATE OR REPLACE FUNCTION public._sub_docs_bloqueio(p_sub_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(e.tipo), '{}'::text[])
    FROM public._sub_docs_estado(p_sub_id) e
   WHERE e.obrigatorio AND e.estado IN ('em_falta', 'expirado')
$$;

CREATE OR REPLACE FUNCTION public.sub_doc_registar(
  p_sub_id     uuid,
  p_tipo       text,
  p_referencia text DEFAULT NULL,
  p_emitido_em date DEFAULT NULL,
  p_validade   date DEFAULT NULL,
  p_path       text DEFAULT NULL,
  p_nome       text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s    public.subempreiteiros%ROWTYPE;
  v_ref  text := NULLIF(btrim(p_referencia), '');
  v_nome text := NULLIF(btrim(p_nome), '');
  v_id   uuid;
BEGIN
  IF NOT public.pode_escrever('subempreitadas') THEN
    RAISE EXCEPTION 'Sem permissão para registar documentos';
  END IF;
  SELECT * INTO v_s FROM public.subempreiteiros WHERE id = p_sub_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contratação não encontrada';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('CERT_SS', 'CERT_AT', 'ALVARA', 'SEGURO_AT', 'SEGURO_RC', 'OUTRO') THEN
    RAISE EXCEPTION 'Tipo de documento inválido';
  END IF;
  IF p_path IS NULL OR p_path !~ ('^' || p_sub_id::text || '/doc-[0-9]{1,16}\.(pdf|jpg|jpeg|png|webp|heic|heif)$') THEN
    RAISE EXCEPTION 'Ficheiro do documento inválido';
  END IF;
  IF v_nome IS NULL OR length(v_nome) > 200 THEN
    RAISE EXCEPTION 'Indique o nome do ficheiro (máximo 200 caracteres)';
  END IF;
  IF length(v_ref) > 100 THEN
    RAISE EXCEPTION 'A referência é demasiado longa (máximo 100 caracteres)';
  END IF;
  IF p_tipo = 'OUTRO' AND v_ref IS NULL THEN
    RAISE EXCEPTION 'Descreva o documento na referência';
  END IF;
  IF p_emitido_em > public._hoje_pt() THEN
    RAISE EXCEPTION 'A data de emissão não pode ser futura';
  END IF;
  IF p_emitido_em IS NOT NULL AND p_validade IS NOT NULL AND p_validade < p_emitido_em THEN
    RAISE EXCEPTION 'A validade não pode ser anterior à data de emissão';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sub_documentos WHERE path = p_path) THEN
    RAISE EXCEPTION 'Este ficheiro já foi registado';
  END IF;

  INSERT INTO public.sub_documentos (subempreiteiro_id, tipo, referencia, emitido_em, validade, path, nome, criado_por)
  VALUES (p_sub_id, p_tipo, v_ref, p_emitido_em, p_validade, p_path, v_nome, auth.uid())
  RETURNING id INTO v_id;
  PERFORM public._obra_evento(v_s.obra_id, 'SUB_DOC', 'Documento ' || p_tipo || ' registado — ' || v_s.nome,
    CASE WHEN p_validade IS NOT NULL THEN 'Válido até ' || to_char(p_validade, 'DD/MM/YYYY') END);
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Este ficheiro já foi registado';
END;
$$;

CREATE OR REPLACE FUNCTION public.sub_doc_remover(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_d public.sub_documentos%ROWTYPE;
  v_s public.subempreiteiros%ROWTYPE;
BEGIN
  IF NOT public.pode_gerir_obras() THEN
    RAISE EXCEPTION 'Sem permissão para remover documentos';
  END IF;
  SELECT * INTO v_d FROM public.sub_documentos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento não encontrado';
  END IF;
  SELECT * INTO v_s FROM public.subempreiteiros WHERE id = v_d.subempreiteiro_id;
  DELETE FROM public.sub_documentos WHERE id = p_id;
  PERFORM public._obra_evento(v_s.obra_id, 'SUB_DOC', 'Documento ' || v_d.tipo || ' removido — ' || v_s.nome, v_d.nome);
  INSERT INTO public.audit_log (actor_id, action, target_id, details)
  VALUES (auth.uid(), 'sub_doc_remover', p_id, to_jsonb(v_d));
END;
$$;

-- ── 5. Evidências dos autos ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auto_evidencias (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  auto_id          uuid          NOT NULL REFERENCES public.autos_medicao(id) ON DELETE CASCADE,
  linha_id         uuid          REFERENCES public.auto_linhas(id) ON DELETE SET NULL,
  path             text          NOT NULL,
  legenda          text,
  latitude         numeric(9,6),
  longitude        numeric(9,6),
  precisao_m       numeric(8,2),
  tirada_em        timestamptz   NOT NULL,
  enviada_em       timestamptz   NOT NULL DEFAULT now(),
  hash_sha256      text          NOT NULL,
  distancia_obra_m numeric(10,1),
  dentro_obra      boolean,
  precisao_ok      boolean,
  valida           boolean       NOT NULL DEFAULT false,
  motivo_invalida  text,
  autor_id         uuid          REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  CONSTRAINT ux_auto_evid_path   UNIQUE (path),
  CONSTRAINT ux_auto_evid_hash   UNIQUE (hash_sha256),
  CONSTRAINT ck_auto_evid_path   CHECK (path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/autos/[0-9]{1,16}-[a-z0-9]{1,12}\.(jpg|jpeg|png|webp|heic|heif)$'),
  CONSTRAINT ck_auto_evid_hash   CHECK (hash_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_auto_evid_coord  CHECK ((latitude IS NULL) = (longitude IS NULL)
                                        AND (latitude  IS NULL OR latitude  BETWEEN -90  AND 90)
                                        AND (longitude IS NULL OR longitude BETWEEN -180 AND 180)),
  CONSTRAINT ck_auto_evid_prec   CHECK (precisao_m IS NULL OR precisao_m >= 0),
  CONSTRAINT ck_auto_evid_leg    CHECK (legenda IS NULL OR length(legenda) <= 300),
  CONSTRAINT ck_auto_evid_motivo CHECK (motivo_invalida IS NULL OR motivo_invalida IN ('sem_gps', 'obra_sem_coordenadas', 'precisao_insuficiente', 'fora_do_raio')),
  CONSTRAINT ck_auto_evid_valida CHECK (valida = (motivo_invalida IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_auto_evidencias_auto ON public.auto_evidencias (auto_id, enviada_em);

CREATE OR REPLACE FUNCTION public._distancia_m(lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public
AS $$
  SELECT round((2 * 6371000 * asin(least(1, sqrt(
           power(sin(radians((lat2 - lat1)::float8) / 2), 2)
           + cos(radians(lat1::float8)) * cos(radians(lat2::float8)) * power(sin(radians((lon2 - lon1)::float8) / 2), 2)
         ))))::numeric, 1)
$$;

-- Editável para evidências: rascunho e, quando a Migration B acrescentar "workflow", rascunho/submetido
CREATE OR REPLACE FUNCTION public._auto_workflow(p_auto_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wf text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'autos_medicao' AND column_name = 'workflow') THEN
    RETURN NULL;
  END IF;
  EXECUTE 'SELECT workflow::text FROM public.autos_medicao WHERE id = $1' INTO v_wf USING p_auto_id;
  RETURN v_wf;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_registar_evidencia(
  p_auto_id    uuid,
  p_path       text,
  p_legenda    text,
  p_lat        numeric,
  p_lon        numeric,
  p_precisao_m numeric,
  p_tirada_em  timestamptz,
  p_hash       text,
  p_linha_id   uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a      public.autos_medicao%ROWTYPE;
  v_o      public.obras%ROWTYPE;
  v_cfg    public.subs_config%ROWTYPE := public._subs_cfg();
  v_wf     text;
  v_hash   text := lower(btrim(p_hash));
  v_leg    text := NULLIF(btrim(p_legenda), '');
  v_dist   numeric;
  v_dentro boolean;
  v_prec   boolean;
  v_motivo text;
  v_id     uuid;
  v_con    text;
BEGIN
  IF NOT public.pode_medir_obras() THEN
    RAISE EXCEPTION 'Sem permissão para registar evidências';
  END IF;
  SELECT * INTO v_a FROM public.autos_medicao WHERE id = p_auto_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auto não encontrado';
  END IF;
  v_wf := public._auto_workflow(p_auto_id);
  IF v_a.estado <> 'rascunho' OR (v_wf IS NOT NULL AND v_wf NOT IN ('rascunho', 'submetido')) THEN
    RAISE EXCEPTION 'Este auto já não aceita evidências';
  END IF;
  SELECT o.* INTO v_o FROM public.obras o JOIN public.subempreiteiros s ON s.obra_id = o.id WHERE s.id = v_a.subempreiteiro_id;

  IF p_path IS NULL OR p_path !~ ('^' || v_o.id::text || '/autos/[0-9]{1,16}-[a-z0-9]{1,12}\.(jpg|jpeg|png|webp|heic|heif)$') THEN
    RAISE EXCEPTION 'Fotografia inválida: o ficheiro não pertence aos autos desta obra';
  END IF;
  IF p_tirada_em IS NULL THEN
    RAISE EXCEPTION 'Indique a hora a que a fotografia foi tirada';
  END IF;
  IF p_tirada_em > now() + interval '2 minutes' THEN
    RAISE EXCEPTION 'A hora da fotografia está no futuro — verifique o relógio do telemóvel';
  END IF;
  IF p_tirada_em < now() - make_interval(mins => v_cfg.foto_idade_max_min) THEN
    RAISE EXCEPTION 'A fotografia foi tirada há mais de % minutos — tire uma nova fotografia na obra', v_cfg.foto_idade_max_min;
  END IF;
  IF v_hash IS NULL OR v_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Impressão digital (SHA-256) da fotografia inválida';
  END IF;
  IF EXISTS (SELECT 1 FROM public.auto_evidencias WHERE hash_sha256 = v_hash) THEN
    RAISE EXCEPTION 'Esta fotografia já foi usada noutro registo';
  END IF;
  IF EXISTS (SELECT 1 FROM public.auto_evidencias WHERE path = p_path) THEN
    RAISE EXCEPTION 'Este ficheiro já foi registado';
  END IF;
  IF p_linha_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.auto_linhas WHERE id = p_linha_id AND auto_id = p_auto_id) THEN
    RAISE EXCEPTION 'A linha indicada não pertence a este auto';
  END IF;
  IF length(v_leg) > 300 THEN
    RAISE EXCEPTION 'A legenda da foto é demasiado longa (máximo 300 caracteres)';
  END IF;
  IF (p_lat IS NULL) <> (p_lon IS NULL) THEN
    RAISE EXCEPTION 'Indique a latitude e a longitude, ou nenhuma';
  END IF;
  IF p_lat NOT BETWEEN -90 AND 90 OR p_lon NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Coordenadas GPS inválidas';
  END IF;
  IF p_precisao_m < 0 OR p_precisao_m >= 1000000 THEN
    RAISE EXCEPTION 'Precisão do GPS inválida';
  END IF;

  v_prec := CASE WHEN p_precisao_m IS NOT NULL THEN p_precisao_m <= v_cfg.precisao_max_m END;
  IF p_lat IS NOT NULL AND v_o.latitude IS NOT NULL THEN
    v_dist   := public._distancia_m(p_lat, p_lon, v_o.latitude, v_o.longitude);
    v_dentro := v_dist <= COALESCE(v_o.geofence_raio_m, v_cfg.raio_padrao_m);
  END IF;
  v_motivo := CASE
    WHEN p_lat IS NULL               THEN 'sem_gps'
    WHEN v_o.latitude IS NULL        THEN 'obra_sem_coordenadas'
    WHEN v_prec IS DISTINCT FROM true THEN 'precisao_insuficiente'
    WHEN NOT v_dentro                THEN 'fora_do_raio'
  END;

  BEGIN
    INSERT INTO public.auto_evidencias (auto_id, linha_id, path, legenda, latitude, longitude, precisao_m, tirada_em,
                                        hash_sha256, distancia_obra_m, dentro_obra, precisao_ok, valida, motivo_invalida, autor_id)
    VALUES (p_auto_id, p_linha_id, p_path, v_leg, p_lat, p_lon, p_precisao_m, p_tirada_em,
            v_hash, v_dist, v_dentro, v_prec, v_motivo IS NULL, v_motivo, auth.uid())
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    IF v_con = 'ux_auto_evid_hash' THEN
      RAISE EXCEPTION 'Esta fotografia já foi usada noutro registo';
    END IF;
    RAISE EXCEPTION 'Este ficheiro já foi registado';
  END;

  RETURN jsonb_build_object('id', v_id, 'valida', v_motivo IS NULL, 'dentro_obra', v_dentro, 'distancia_m', v_dist,
                            'precisao_ok', v_prec, 'motivo', v_motivo);
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_apagar_evidencia(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_e  public.auto_evidencias%ROWTYPE;
  v_a  public.autos_medicao%ROWTYPE;
  v_wf text;
BEGIN
  IF NOT public.pode_medir_obras() THEN
    RAISE EXCEPTION 'Sem permissão para apagar evidências';
  END IF;
  SELECT * INTO v_e FROM public.auto_evidencias WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evidência não encontrada';
  END IF;
  SELECT * INTO v_a FROM public.autos_medicao WHERE id = v_e.auto_id FOR UPDATE;
  v_wf := public._auto_workflow(v_e.auto_id);
  IF v_a.estado <> 'rascunho' OR (v_wf IS NOT NULL AND v_wf <> 'rascunho') THEN
    RAISE EXCEPTION 'As evidências só podem ser apagadas enquanto o auto está em rascunho';
  END IF;
  IF NOT (public.pode_gerir_obras() OR v_e.autor_id = auth.uid()) THEN
    RAISE EXCEPTION 'Só quem enviou a evidência, o gestor ou o administrador a pode apagar';
  END IF;
  DELETE FROM public.auto_evidencias WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_evidencias_lista(p_auto_id uuid)
RETURNS SETOF public.auto_evidencias
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_obra uuid;
BEGIN
  SELECT s.obra_id INTO v_obra
    FROM public.autos_medicao a JOIN public.subempreiteiros s ON s.id = a.subempreiteiro_id
   WHERE a.id = p_auto_id;
  IF NOT FOUND OR NOT public.pode_ver_obra(v_obra) THEN
    RAISE EXCEPTION 'Auto não encontrado';
  END IF;
  RETURN QUERY SELECT * FROM public.auto_evidencias e WHERE e.auto_id = p_auto_id ORDER BY e.enviada_em, e.id;
END;
$$;

-- ── 6. RLS e GRANTs das tabelas novas (só leitura; a escrita é por RPC) ─────
ALTER TABLE public.subs_config          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obra_orcamento_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_documentos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_evidencias      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subs_config_select" ON public.subs_config;
CREATE POLICY "subs_config_select" ON public.subs_config
  FOR SELECT TO authenticated USING (public.pode_ler_obras());

DROP POLICY IF EXISTS "obra_orcamento_itens_select" ON public.obra_orcamento_itens;
CREATE POLICY "obra_orcamento_itens_select" ON public.obra_orcamento_itens
  FOR SELECT TO authenticated USING (public.pode_ver_obra(obra_id));

DROP POLICY IF EXISTS "sub_documentos_select" ON public.sub_documentos;
CREATE POLICY "sub_documentos_select" ON public.sub_documentos
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.subempreiteiros s WHERE s.id = subempreiteiro_id AND public.pode_ver_obra(s.obra_id))
  );

DROP POLICY IF EXISTS "auto_evidencias_select" ON public.auto_evidencias;
CREATE POLICY "auto_evidencias_select" ON public.auto_evidencias
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.autos_medicao a JOIN public.subempreiteiros s ON s.id = a.subempreiteiro_id
             WHERE a.id = auto_id AND public.pode_ver_obra(s.obra_id))
  );

REVOKE ALL ON TABLE public.subs_config, public.obra_orcamento_itens, public.sub_documentos, public.auto_evidencias
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.subs_config, public.obra_orcamento_itens, public.sub_documentos, public.auto_evidencias
  TO authenticated;

-- ── 7. Armazenamento: documentos e faturas no bucket privado ────────────────
-- <subempreiteiro>/<contrato|doc|fatura>-<ts>.<ext>; faturas só pela gestão
CREATE OR REPLACE FUNCTION public.contrato_obra_valido(p_nome text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_nome ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(contrato|doc|fatura)-[0-9]{1,16}\.(pdf|jpg|jpeg|png|webp|heic|heif)$'
      THEN EXISTS (SELECT 1 FROM public.subempreiteiros WHERE id = split_part(p_nome, '/', 1)::uuid)
           AND CASE WHEN split_part(p_nome, '/', 2) LIKE 'fatura-%' THEN public.pode_gerir_obras()
                    ELSE public.pode_escrever('subempreitadas') END
    ELSE false
  END
$$;

DROP POLICY IF EXISTS "obras_contratos_insert" ON storage.objects;
CREATE POLICY "obras_contratos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'obras-contratos' AND public.contrato_obra_valido(name));

DROP POLICY IF EXISTS "obras_contratos_delete" ON storage.objects;
CREATE POLICY "obras_contratos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'obras-contratos' AND CASE
    WHEN split_part(name, '/', 2) LIKE 'fatura-%' THEN public.auth_role() = 'admin'
    WHEN split_part(name, '/', 2) LIKE 'doc-%'    THEN public.pode_gerir_obras()
    ELSE public.pode_escrever('subempreitadas')
  END);

-- ── 8. GRANT / REVOKE das funções ───────────────────────────────────────────
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname = ANY (ARRAY[
         'subs_config_ler', 'subs_config_guardar', 'obra_orcamento_guardar_item', 'obra_orcamento_apagar_item',
         'obra_orcamento_resumo', 'validar_subempreiteiro', 'sub_doc_registar', 'sub_doc_remover', 'sub_docs_estado',
         'auto_registar_evidencia', 'auto_apagar_evidencia', 'auto_evidencias_lista', 'contrato_obra_valido'])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;

  FOR f IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname = ANY (ARRAY['_subs_cfg', '_trg_artigo_orcamento_obra', '_trg_sub_obra_orcamento', '_sub_docs_estado',
                                  '_sub_docs_bloqueio', '_distancia_m', '_auto_workflow'])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
END $$;
