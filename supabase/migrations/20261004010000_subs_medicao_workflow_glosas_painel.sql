-- ================================================================
-- ENCIVIL — Controlo de subempreitadas (Migration B, 2026-10-04)
-- Desenho: docs/superpowers/specs/2026-10-04-controlo-subempreitadas-design.md §2 "Migration B" e §3
-- Requer: 20261003000000_obras_completo.sql e 20261004000000_subs_orcamento_docs_evidencias.sql.
--
--  1. autos_medicao: fluxo rascunho → submetido → verificado → validado (coluna workflow), glosas
--     (valor_glosado), vencimento, fatura do subempreiteiro (só GUARDADA — o ERP não emite faturas)
--     e motivo das exceções. auto_linhas: quantidade pedida pelo subempreiteiro e justificação.
--  2. Imutabilidade: depois de submetido, o auto e as suas linhas só mudam pelas RPCs deste módulo
--     (trigger com app.auto_rpc = 'on' + utilizador privilegiado — um set_config feito pela API não basta).
--  3. auto_verificacoes (lista de verificação) e auto_glosas (descontos com motivo).
--  4. RPCs do fluxo: auto_submeter, auto_iniciar_verificacao, auto_registar_verificacao, auto_verificar,
--     auto_glosar, auto_levantar_glosa, auto_devolver, auto_aprovar (validar_auto passa a delegar nela),
--     auto_registar_fatura, marcar_auto_pago (com bloqueios), sub_libertar_retencao (liberacoes_retencao
--     perde a escrita direta), subs_painel_ceo e subs_fluxo_caixa.
--  5. Métricas (_subs_metricas, sub_painel, subs_resumo) e custos (custos_consolidados_por_obra) passam
--     a usar o CERTIFICADO = valor_periodo − valor_glosado.
--
-- Regras (constantes vêm de subs_config):
--   • Certificado = valor_periodo − valor_glosado; retenção = round(certificado × % retenção / 100, 2)
--     por auto; a pagar = certificado − retenção. Convenção: pago + por_pagar + retencao = executado.
--   • Invariante: estado = 'validado' ⇔ workflow = 'validado'. Backfill: autos validados → 'validado',
--     com data_vencimento = data de validação (ou da medição) + prazo_pagamento_dias.
--   • Submeter (pode_medir_obras): contrato validado; rascunho; data não futura.
--       unitário: ≥ 1 linha; linhas que não são trabalhos a mais têm de estar ligadas a um artigo do
--       contrato, com o preço do contrato, quantidade ≤ pedida e acumulado (este + autos submetidos,
--       verificados e validados) ≤ prevista; trabalhos a mais com justificação; valor = Σ qtd × preço (±0,01).
--       global: sem linhas; percentagem > 0; acumulado ≤ 100 %; valor = % × valor global / 100 (±0,01).
--   • Verificar (pode_medir_obras): lista sem itens pendentes e ≥ min_fotos_verificacao evidências
--     válidas — ou exceção do admin às fotografias (motivo ≥ 10 caracteres, audit_log).
--   • Glosar (pode_medir_obras) enquanto não validado; Σ glosas aplicadas ≤ valor_periodo.
--     Levantar glosa: pode_gerir_obras, motivo ≥ 5 caracteres.
--   • Aprovar (pode_gerir_obras): verificado; certificado > 0; com trabalhos a mais ou certificado >
--     alcada_gestor_ate só o admin; quem criou não aprova (admin isento); documentos obrigatórios em dia
--     se bloquear_pagamento_sem_docs — ou exceção do admin (motivo ≥ 10, audit_log).
--   • Fatura (pode_gerir_obras): auto validado e por pagar; ficheiro <subempreiteiro>/fatura-<ts>.<ext>
--     no bucket privado "obras-contratos". Pode substituir-se até ao pagamento (histórico em obra_eventos).
--     O valor diferente do certificado é AVISO (sub_painel.avisos / subs_painel_ceo.alertas), nunca bloqueia.
--   • Pagar (admin, gestor): validado; fatura guardada se exigir_fatura_para_pagar; sem ocorrência
--     'alta' de QUALIDADE/SEGURANCA por resolver; documentos em dia se bloquear_pagamento_sem_docs — ou
--     exceção do admin (só para os documentos).
--   • Libertar retenção (pode_gerir_obras): total libertado ≤ retenção acumulada dos autos validados;
--     bloqueada com ocorrência 'alta' de QUALIDADE/SEGURANCA por resolver.
--   • Painel: progresso físico = do último auto validado que o indica; desvio = executado_pct − progresso
--     físico; saúde: documentos obrigatórios em falta/expirados (contratos validados) = crítico, a expirar
--     ou desvio > 10 pp = atenção. subs_painel_ceo e subs_fluxo_caixa contam só contratos validados e
--     ativos de obras não arquivadas.
--   • Eventos novos: AUTO_SUBMETIDO, AUTO_VERIFICADO, AUTO_DEVOLVIDO, AUTO_GLOSADO, AUTO_FATURA, AUTO_PAGO
--     (AUTO_VALIDADO continua a vir do trigger, agora com o valor certificado).
--   • Tabelas novas só com SELECT (RLS por pode_ver_obra); escrita por RPC SECURITY DEFINER.
--
-- APLICAR: SQL Editor, depois de 20261004000000. Idempotente.
-- ================================================================

-- ── 1. Colunas novas ─────────────────────────────────────────────────────────
ALTER TABLE public.autos_medicao
  ADD COLUMN IF NOT EXISTS workflow            text          NOT NULL DEFAULT 'rascunho',
  ADD COLUMN IF NOT EXISTS submetido_por       uuid          REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS submetido_em        timestamptz,
  ADD COLUMN IF NOT EXISTS verificado_por      uuid          REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS verificado_em       timestamptz,
  ADD COLUMN IF NOT EXISTS valor_glosado       numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS data_vencimento     date,
  ADD COLUMN IF NOT EXISTS fatura_numero       text,
  ADD COLUMN IF NOT EXISTS fatura_data         date,
  ADD COLUMN IF NOT EXISTS fatura_valor        numeric(14,2),
  ADD COLUMN IF NOT EXISTS fatura_path         text,
  ADD COLUMN IF NOT EXISTS fatura_nome         text,
  ADD COLUMN IF NOT EXISTS fatura_registada_em timestamptz,
  ADD COLUMN IF NOT EXISTS excecao_motivo      text;

ALTER TABLE public.auto_linhas
  ADD COLUMN IF NOT EXISTS qtd_pedida   numeric(14,3),
  ADD COLUMN IF NOT EXISTS justificacao text;

-- Backfill antes das restrições (num só comando: o sinal das RPCs vale só nesta transação)
DO $$
BEGIN
  PERFORM set_config('app.auto_rpc', 'on', true);
  UPDATE public.autos_medicao SET workflow = 'validado' WHERE estado = 'validado' AND workflow <> 'validado';
  UPDATE public.autos_medicao a
     SET data_vencimento = COALESCE((a.validado_em AT TIME ZONE 'Europe/Lisbon')::date, a.data_medicao)
                           + (SELECT c.prazo_pagamento_dias FROM public.subs_config c WHERE c.id)
   WHERE a.estado = 'validado' AND a.data_vencimento IS NULL;
  PERFORM set_config('app.auto_rpc', 'off', true);
END $$;

ALTER TABLE public.autos_medicao DROP CONSTRAINT IF EXISTS ck_auto_workflow;
ALTER TABLE public.autos_medicao ADD CONSTRAINT ck_auto_workflow
  CHECK (workflow IN ('rascunho', 'submetido', 'verificado', 'validado'));
ALTER TABLE public.autos_medicao DROP CONSTRAINT IF EXISTS ck_auto_workflow_estado;
ALTER TABLE public.autos_medicao ADD CONSTRAINT ck_auto_workflow_estado
  CHECK ((estado = 'validado') = (workflow = 'validado'));
ALTER TABLE public.autos_medicao DROP CONSTRAINT IF EXISTS ck_auto_glosado;
ALTER TABLE public.autos_medicao ADD CONSTRAINT ck_auto_glosado
  CHECK (valor_glosado >= 0 AND valor_glosado <= valor_periodo);
ALTER TABLE public.autos_medicao DROP CONSTRAINT IF EXISTS ck_auto_fatura;
ALTER TABLE public.autos_medicao ADD CONSTRAINT ck_auto_fatura
  CHECK ((fatura_valor IS NULL OR fatura_valor > 0)
         AND (fatura_numero IS NULL OR length(fatura_numero) BETWEEN 1 AND 50)
         AND (fatura_nome IS NULL OR length(fatura_nome) <= 200)
         AND (fatura_path IS NULL OR fatura_path ~ ('^' || subempreiteiro_id::text || '/fatura-[0-9]{1,16}\.(pdf|jpg|jpeg|png|webp|heic|heif)$')));
ALTER TABLE public.autos_medicao DROP CONSTRAINT IF EXISTS ck_auto_excecao;
ALTER TABLE public.autos_medicao ADD CONSTRAINT ck_auto_excecao
  CHECK (excecao_motivo IS NULL OR length(excecao_motivo) <= 4000);

ALTER TABLE public.auto_linhas DROP CONSTRAINT IF EXISTS ck_linha_qtd_pedida;
ALTER TABLE public.auto_linhas ADD CONSTRAINT ck_linha_qtd_pedida CHECK (qtd_pedida IS NULL OR qtd_pedida >= 0);
ALTER TABLE public.auto_linhas DROP CONSTRAINT IF EXISTS ck_linha_justificacao;
ALTER TABLE public.auto_linhas ADD CONSTRAINT ck_linha_justificacao CHECK (justificacao IS NULL OR length(justificacao) <= 2000);

CREATE INDEX IF NOT EXISTS idx_autos_workflow_pendente ON public.autos_medicao (subempreiteiro_id, workflow)
  WHERE workflow IN ('submetido', 'verificado');
CREATE INDEX IF NOT EXISTS idx_autos_vencimento ON public.autos_medicao (data_vencimento)
  WHERE workflow = 'validado' AND estado_pagamento <> 'pago';
CREATE UNIQUE INDEX IF NOT EXISTS ux_autos_fatura_path ON public.autos_medicao (fatura_path) WHERE fatura_path IS NOT NULL;

-- ── 2. Verificação e glosas ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auto_verificacoes (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  auto_id        uuid        NOT NULL REFERENCES public.autos_medicao(id) ON DELETE CASCADE,
  ordem          integer     NOT NULL,
  item           text        NOT NULL,
  resultado      text        NOT NULL DEFAULT 'pendente',
  observacao     text,
  verificado_por uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  verificado_em  timestamptz,
  CONSTRAINT ux_auto_verif_ordem     UNIQUE (auto_id, ordem),
  CONSTRAINT ck_auto_verif_resultado CHECK (resultado IN ('pendente', 'conforme', 'nao_conforme', 'na')),
  CONSTRAINT ck_auto_verif_obs       CHECK (observacao IS NULL OR length(observacao) <= 1000),
  CONSTRAINT ck_auto_verif_nc        CHECK (resultado <> 'nao_conforme' OR observacao IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.auto_glosas (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  auto_id             uuid          NOT NULL REFERENCES public.autos_medicao(id) ON DELETE CASCADE,
  linha_id            uuid          REFERENCES public.auto_linhas(id) ON DELETE SET NULL,
  motivo              text          NOT NULL,
  descricao           text          NOT NULL,
  valor               numeric(14,2) NOT NULL,
  estado              text          NOT NULL DEFAULT 'aplicada',
  ocorrencia_id       uuid          REFERENCES public.sub_ocorrencias(id),
  criado_por          uuid          REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  criado_em           timestamptz   NOT NULL DEFAULT now(),
  levantada_por       uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  levantada_em        timestamptz,
  motivo_levantamento text,
  CONSTRAINT ck_glosa_motivo    CHECK (motivo IN ('QUALIDADE', 'QUANTIDADE_NAO_CONFIRMADA', 'ATRASO', 'SEGURANCA', 'DOCUMENTACAO', 'OUTRO')),
  CONSTRAINT ck_glosa_descricao CHECK (length(btrim(descricao)) BETWEEN 1 AND 1000),
  CONSTRAINT ck_glosa_valor     CHECK (valor > 0),
  CONSTRAINT ck_glosa_estado    CHECK (estado IN ('aplicada', 'levantada')),
  CONSTRAINT ck_glosa_levantada CHECK ((estado = 'levantada') = (levantada_em IS NOT NULL)
                                       AND (motivo_levantamento IS NULL OR length(motivo_levantamento) <= 1000))
);
CREATE INDEX IF NOT EXISTS idx_auto_glosas_auto ON public.auto_glosas (auto_id, criado_em);

-- ── 3. Imutabilidade depois da submissão ────────────────────────────────────
-- SECURITY INVOKER de propósito: current_user distingue a API (authenticated/anon e o papel de serviço)
-- de uma RPC SECURITY DEFINER deste módulo, que liga app.auto_rpc antes de escrever.
CREATE OR REPLACE FUNCTION public._trg_auto_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.workflow <> 'rascunho'
     AND NOT (COALESCE(current_setting('app.auto_rpc', true), '') = 'on'
              AND current_user NOT IN ('authenticated', 'anon', 'service' || '_role')) THEN
    RAISE EXCEPTION 'Este auto já foi submetido: só muda pelo fluxo de aprovação (devolva-o ao rascunho para o corrigir)';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_imutavel ON public.autos_medicao;
CREATE TRIGGER trg_auto_imutavel
  BEFORE UPDATE OR DELETE ON public.autos_medicao
  FOR EACH ROW EXECUTE FUNCTION public._trg_auto_imutavel();

CREATE OR REPLACE FUNCTION public._trg_auto_linha_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_rpc boolean := COALESCE(current_setting('app.auto_rpc', true), '') = 'on'
                   AND current_user NOT IN ('authenticated', 'anon', 'service' || '_role');
  v_api boolean := current_user IN ('authenticated', 'anon', 'service' || '_role');
  v_wf  text;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT a.workflow INTO v_wf FROM public.autos_medicao a WHERE a.id = OLD.auto_id;
    -- Sem auto-pai: apagado em cascata (corre como dono da tabela); pela API é recusado
    IF NOT FOUND AND v_api THEN
      RAISE EXCEPTION 'Auto não encontrado';
    END IF;
    IF FOUND AND v_wf <> 'rascunho' AND NOT v_rpc THEN
      RAISE EXCEPTION 'Este auto já foi submetido: as linhas só mudam pelo fluxo de aprovação';
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT a.workflow INTO v_wf FROM public.autos_medicao a WHERE a.id = NEW.auto_id;
    IF FOUND AND v_wf <> 'rascunho' AND NOT v_rpc THEN
      RAISE EXCEPTION 'Este auto já foi submetido: as linhas só mudam pelo fluxo de aprovação';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_linha_imutavel ON public.auto_linhas;
CREATE TRIGGER trg_auto_linha_imutavel
  BEFORE INSERT OR UPDATE OR DELETE ON public.auto_linhas
  FOR EACH ROW EXECUTE FUNCTION public._trg_auto_linha_imutavel();

-- ── 4. Utilitários internos ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._eur(p numeric)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$ SELECT to_char(p, 'FM999G999G990D00') || ' €' $$;

CREATE OR REPLACE FUNCTION public._auto_evento(p_auto_id uuid, p_tipo text, p_acao text, p_detalhe text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  SELECT a.numero, s.nome, s.obra_id INTO r
    FROM public.autos_medicao a JOIN public.subempreiteiros s ON s.id = a.subempreiteiro_id
   WHERE a.id = p_auto_id;
  PERFORM public._obra_evento(r.obra_id, p_tipo, 'Auto n.º ' || r.numero || ' ' || p_acao || ' — ' || r.nome, p_detalhe);
END;
$$;

-- Ocorrências que bloqueiam pagamento e libertação de retenção
CREATE OR REPLACE FUNCTION public._sub_oc_bloqueantes(p_sub_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int FROM public.sub_ocorrencias o
   WHERE o.subempreiteiro_id = p_sub_id AND NOT o.resolvido AND o.gravidade = 'alta' AND o.tipo IN ('QUALIDADE', 'SEGURANCA')
$$;

CREATE OR REPLACE FUNCTION public._auto_recalcular_glosado(p_auto_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.autos_medicao a
     SET valor_glosado = COALESCE((SELECT sum(g.valor) FROM public.auto_glosas g WHERE g.auto_id = a.id AND g.estado = 'aplicada'), 0)
   WHERE a.id = p_auto_id
$$;

-- ── 5. Submeter ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_submeter(p_auto_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a    public.autos_medicao%ROWTYPE;
  v_s    public.subempreiteiros%ROWTYPE;
  v_l    record;
  v_exc  record;
  v_n    integer;
  v_soma numeric;
  v_pct  numeric;
  v_esp  numeric;
BEGIN
  IF NOT public.pode_medir_obras() THEN
    RAISE EXCEPTION 'Sem permissão para submeter autos de medição';
  END IF;
  SELECT * INTO v_a FROM public.autos_medicao WHERE id = p_auto_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auto não encontrado';
  END IF;
  -- Duas submissões em simultâneo do mesmo contrato não podem, juntas, passar o previsto
  PERFORM pg_advisory_xact_lock(('x' || substr(md5('subs_auto:' || v_a.subempreiteiro_id::text), 1, 16))::bit(64)::bigint);
  SELECT * INTO v_a FROM public.autos_medicao WHERE id = p_auto_id FOR UPDATE;
  SELECT * INTO v_s FROM public.subempreiteiros WHERE id = v_a.subempreiteiro_id;

  IF v_a.workflow <> 'rascunho' THEN
    RAISE EXCEPTION 'Este auto já foi submetido';
  END IF;
  IF v_s.estado <> 'validado' THEN
    RAISE EXCEPTION 'A contratação ainda não está validada — não se submetem autos';
  END IF;
  IF v_a.data_medicao > public._hoje_pt() THEN
    RAISE EXCEPTION 'A data da medição não pode ser futura';
  END IF;

  SELECT count(*) INTO v_n FROM public.auto_linhas WHERE auto_id = p_auto_id;
  IF v_s.tipo = 'unitario' THEN
    IF v_n = 0 THEN
      RAISE EXCEPTION 'O auto não tem linhas de medição';
    END IF;
    FOR v_l IN
      SELECT l.*, ar.subempreiteiro_id AS art_sub, ar.preco_unitario AS art_preco
        FROM public.auto_linhas l
        LEFT JOIN public.subempreiteiro_artigos ar ON ar.id = l.artigo_id
       WHERE l.auto_id = p_auto_id
       ORDER BY l.created_at, l.id
    LOOP
      IF v_l.is_extra THEN
        IF NULLIF(btrim(v_l.justificacao), '') IS NULL THEN
          RAISE EXCEPTION 'Trabalhos a mais exigem justificação (%)', v_l.descricao;
        END IF;
        CONTINUE;
      END IF;
      IF v_l.artigo_id IS NULL THEN
        RAISE EXCEPTION 'A linha "%" tem de estar ligada a um artigo do contrato ou ser marcada como trabalho a mais', v_l.descricao;
      END IF;
      IF v_l.art_sub IS DISTINCT FROM v_a.subempreiteiro_id THEN
        RAISE EXCEPTION 'O artigo de "%" não pertence a este contrato', v_l.descricao;
      END IF;
      IF v_l.preco_unitario <> v_l.art_preco THEN
        RAISE EXCEPTION 'O preço de "%" não corresponde ao do contrato (% €)', v_l.descricao, trim_scale(v_l.art_preco);
      END IF;
      IF v_l.quantidade > COALESCE(v_l.qtd_pedida, v_l.quantidade) THEN
        RAISE EXCEPTION 'A quantidade verificada de "%" (%) excede a pedida pelo subempreiteiro (%)',
          v_l.descricao, trim_scale(v_l.quantidade), trim_scale(v_l.qtd_pedida);
      END IF;
    END LOOP;

    SELECT ar.descricao, ar.quantidade_prevista AS prevista, sum(l.quantidade) AS acumulado
      INTO v_exc
      FROM public.auto_linhas l
      JOIN public.autos_medicao am ON am.id = l.auto_id
      JOIN public.subempreiteiro_artigos ar ON ar.id = l.artigo_id
     WHERE ar.subempreiteiro_id = v_a.subempreiteiro_id
       AND NOT l.is_extra
       AND l.artigo_id IN (SELECT x.artigo_id FROM public.auto_linhas x WHERE x.auto_id = p_auto_id AND x.artigo_id IS NOT NULL)
       AND (am.id = p_auto_id OR am.workflow IN ('submetido', 'verificado', 'validado'))
     GROUP BY ar.id, ar.descricao, ar.quantidade_prevista
    HAVING sum(l.quantidade) > ar.quantidade_prevista
     ORDER BY ar.descricao
     LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'A quantidade acumulada de "%" (%) excede a prevista no contrato (%)',
        v_exc.descricao, trim_scale(v_exc.acumulado), trim_scale(v_exc.prevista);
    END IF;

    SELECT round(COALESCE(sum(l.quantidade * l.preco_unitario), 0), 2) INTO v_soma
      FROM public.auto_linhas l WHERE l.auto_id = p_auto_id;
    IF abs(v_soma - v_a.valor_periodo) > 0.01 THEN
      RAISE EXCEPTION 'O valor do período (%) não corresponde à soma das linhas (%)', public._eur(v_a.valor_periodo), public._eur(v_soma);
    END IF;
  ELSE
    IF v_n > 0 THEN
      RAISE EXCEPTION 'Num contrato global o auto mede-se só pela percentagem (retire as linhas)';
    END IF;
    IF COALESCE(v_a.percentagem_periodo, 0) <= 0 THEN
      RAISE EXCEPTION 'A percentagem do período tem de ser superior a 0';
    END IF;
    SELECT COALESCE(sum(am.percentagem_periodo), 0) INTO v_pct
      FROM public.autos_medicao am
     WHERE am.subempreiteiro_id = v_a.subempreiteiro_id AND am.id <> p_auto_id
       AND am.workflow IN ('submetido', 'verificado', 'validado');
    IF v_pct + v_a.percentagem_periodo > 100 THEN
      RAISE EXCEPTION 'O acumulado (% %%) ultrapassa 100 %% do contrato', trim_scale(v_pct + v_a.percentagem_periodo);
    END IF;
    v_esp := round(v_a.percentagem_periodo * COALESCE(v_s.valor_global, 0) / 100, 2);
    IF abs(v_esp - v_a.valor_periodo) > 0.01 THEN
      RAISE EXCEPTION 'O valor do período (%) não corresponde à percentagem do valor global (%)', public._eur(v_a.valor_periodo), public._eur(v_esp);
    END IF;
  END IF;

  PERFORM set_config('app.auto_rpc', 'on', true);
  UPDATE public.autos_medicao
     SET workflow = 'submetido', submetido_por = auth.uid(), submetido_em = now()
   WHERE id = p_auto_id;
  PERFORM set_config('app.auto_rpc', 'off', true);
  PERFORM public._auto_evento(p_auto_id, 'AUTO_SUBMETIDO', 'submetido', public._eur(v_a.valor_periodo));
END;
$$;

-- ── 6. Verificação ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_iniciar_verificacao(p_auto_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a public.autos_medicao%ROWTYPE;
BEGIN
  IF NOT public.pode_medir_obras() THEN
    RAISE EXCEPTION 'Sem permissão para verificar autos de medição';
  END IF;
  SELECT * INTO v_a FROM public.autos_medicao WHERE id = p_auto_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auto não encontrado';
  END IF;
  IF v_a.workflow <> 'submetido' THEN
    RAISE EXCEPTION 'Só se verifica um auto submetido';
  END IF;
  IF EXISTS (SELECT 1 FROM public.auto_verificacoes WHERE auto_id = p_auto_id) THEN
    RETURN;
  END IF;
  INSERT INTO public.auto_verificacoes (auto_id, ordem, item)
  SELECT p_auto_id, t.ord::int,
         CASE jsonb_typeof(t.v) WHEN 'string' THEN t.v #>> '{}' ELSE t.v ->> 'item' END
    FROM jsonb_array_elements((public._subs_cfg()).checklist_padrao) WITH ORDINALITY AS t(v, ord);
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_registar_verificacao(p_auto_id uuid, p_itens jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a     public.autos_medicao%ROWTYPE;
  v_i     jsonb;
  v_ordem integer;
  v_res   text;
  v_obs   text;
BEGIN
  IF NOT public.pode_medir_obras() THEN
    RAISE EXCEPTION 'Sem permissão para verificar autos de medição';
  END IF;
  SELECT * INTO v_a FROM public.autos_medicao WHERE id = p_auto_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auto não encontrado';
  END IF;
  IF v_a.workflow <> 'submetido' THEN
    RAISE EXCEPTION 'Este auto não está em verificação';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.auto_verificacoes WHERE auto_id = p_auto_id) THEN
    RAISE EXCEPTION 'Inicie a verificação primeiro';
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) IS DISTINCT FROM 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'Indique os itens da verificação';
  END IF;

  FOR v_i IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    IF jsonb_typeof(v_i) IS DISTINCT FROM 'object' OR jsonb_typeof(v_i -> 'ordem') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Item de verificação inválido';
    END IF;
    v_ordem := (v_i ->> 'ordem')::numeric::integer;
    v_res   := v_i ->> 'resultado';
    v_obs   := NULLIF(btrim(v_i ->> 'observacao'), '');
    IF v_res IS NULL OR v_res NOT IN ('pendente', 'conforme', 'nao_conforme', 'na') THEN
      RAISE EXCEPTION 'Resultado de verificação inválido (item n.º %)', v_ordem;
    END IF;
    IF v_res = 'nao_conforme' AND v_obs IS NULL THEN
      RAISE EXCEPTION 'Explique na observação o item n.º % (não conforme)', v_ordem;
    END IF;
    IF length(v_obs) > 1000 THEN
      RAISE EXCEPTION 'A observação é demasiado longa (máximo 1000 caracteres)';
    END IF;
    UPDATE public.auto_verificacoes
       SET resultado = v_res, observacao = v_obs, verificado_por = auth.uid(), verificado_em = now()
     WHERE auto_id = p_auto_id AND ordem = v_ordem;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'O item de verificação n.º % não existe', v_ordem;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_verificar(p_auto_id uuid, p_excecao_motivo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a     public.autos_medicao%ROWTYPE;
  v_cfg   public.subs_config%ROWTYPE := public._subs_cfg();
  v_fotos integer;
  v_mot   text;
BEGIN
  IF NOT public.pode_medir_obras() THEN
    RAISE EXCEPTION 'Sem permissão para verificar autos de medição';
  END IF;
  SELECT * INTO v_a FROM public.autos_medicao WHERE id = p_auto_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auto não encontrado';
  END IF;
  IF v_a.workflow <> 'submetido' THEN
    RAISE EXCEPTION 'Só se verifica um auto submetido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.auto_verificacoes WHERE auto_id = p_auto_id) THEN
    RAISE EXCEPTION 'Inicie e preencha a lista de verificação';
  END IF;
  IF EXISTS (SELECT 1 FROM public.auto_verificacoes WHERE auto_id = p_auto_id AND resultado = 'pendente') THEN
    RAISE EXCEPTION 'Há itens da lista de verificação por preencher';
  END IF;

  SELECT count(*) INTO v_fotos FROM public.auto_evidencias WHERE auto_id = p_auto_id AND valida;
  IF v_fotos < v_cfg.min_fotos_verificacao THEN
    v_mot := NULLIF(btrim(p_excecao_motivo), '');
    IF v_mot IS NULL THEN
      RAISE EXCEPTION 'São precisas pelo menos % fotografias válidas tiradas na obra (há %)', v_cfg.min_fotos_verificacao, v_fotos;
    END IF;
    IF public.auth_role() IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Só o administrador pode verificar sem as fotografias exigidas';
    END IF;
    IF length(v_mot) < 10 THEN
      RAISE EXCEPTION 'O motivo da exceção tem de ter pelo menos 10 caracteres';
    END IF;
  END IF;

  PERFORM set_config('app.auto_rpc', 'on', true);
  UPDATE public.autos_medicao
     SET workflow = 'verificado', verificado_por = auth.uid(), verificado_em = now(),
         excecao_motivo = CASE WHEN v_mot IS NULL THEN excecao_motivo
                               ELSE left(concat_ws(E'\n', excecao_motivo, 'Verificação sem fotografias suficientes: ' || v_mot), 4000) END
   WHERE id = p_auto_id;
  PERFORM set_config('app.auto_rpc', 'off', true);

  IF v_mot IS NOT NULL THEN
    INSERT INTO public.audit_log (actor_id, action, target_id, details)
    VALUES (auth.uid(), 'auto_verificar_excecao', p_auto_id,
      jsonb_build_object('motivo', v_mot, 'fotos_validas', v_fotos, 'minimo', v_cfg.min_fotos_verificacao));
  END IF;
  PERFORM public._auto_evento(p_auto_id, 'AUTO_VERIFICADO', 'verificado',
    CASE WHEN v_mot IS NOT NULL THEN 'Com exceção do administrador: ' || v_mot END);
END;
$$;

-- ── 7. Glosas ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_glosar(
  p_auto_id       uuid,
  p_motivo        text,
  p_descricao     text,
  p_valor         numeric,
  p_linha_id      uuid DEFAULT NULL,
  p_ocorrencia_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a     public.autos_medicao%ROWTYPE;
  v_desc  text := NULLIF(btrim(p_descricao), '');
  v_valor numeric := round(p_valor, 2);
  v_atual numeric;
  v_id    uuid;
BEGIN
  IF NOT public.pode_medir_obras() THEN
    RAISE EXCEPTION 'Sem permissão para aplicar glosas';
  END IF;
  SELECT * INTO v_a FROM public.autos_medicao WHERE id = p_auto_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auto não encontrado';
  END IF;
  IF v_a.workflow = 'validado' THEN
    RAISE EXCEPTION 'Este auto já está aprovado — já não se aplicam glosas';
  END IF;
  IF p_motivo IS NULL OR p_motivo NOT IN ('QUALIDADE', 'QUANTIDADE_NAO_CONFIRMADA', 'ATRASO', 'SEGURANCA', 'DOCUMENTACAO', 'OUTRO') THEN
    RAISE EXCEPTION 'Motivo de glosa inválido';
  END IF;
  IF v_desc IS NULL THEN
    RAISE EXCEPTION 'Descreva a glosa';
  END IF;
  IF length(v_desc) > 1000 THEN
    RAISE EXCEPTION 'A descrição é demasiado longa (máximo 1000 caracteres)';
  END IF;
  IF v_valor IS NULL OR v_valor <= 0 THEN
    RAISE EXCEPTION 'O valor da glosa tem de ser superior a 0';
  END IF;
  IF p_linha_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.auto_linhas WHERE id = p_linha_id AND auto_id = p_auto_id) THEN
    RAISE EXCEPTION 'A linha indicada não pertence a este auto';
  END IF;
  IF p_ocorrencia_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sub_ocorrencias WHERE id = p_ocorrencia_id AND subempreiteiro_id = v_a.subempreiteiro_id
  ) THEN
    RAISE EXCEPTION 'A ocorrência indicada não é deste subempreiteiro';
  END IF;
  SELECT COALESCE(sum(valor), 0) INTO v_atual FROM public.auto_glosas WHERE auto_id = p_auto_id AND estado = 'aplicada';
  IF v_atual + v_valor > v_a.valor_periodo THEN
    RAISE EXCEPTION 'As glosas (%) não podem ultrapassar o valor do período (%)', public._eur(v_atual + v_valor), public._eur(v_a.valor_periodo);
  END IF;

  INSERT INTO public.auto_glosas (auto_id, linha_id, motivo, descricao, valor, ocorrencia_id, criado_por)
  VALUES (p_auto_id, p_linha_id, p_motivo, v_desc, v_valor, p_ocorrencia_id, auth.uid())
  RETURNING id INTO v_id;
  PERFORM set_config('app.auto_rpc', 'on', true);
  PERFORM public._auto_recalcular_glosado(p_auto_id);
  PERFORM set_config('app.auto_rpc', 'off', true);

  INSERT INTO public.audit_log (actor_id, action, target_id, details)
  VALUES (auth.uid(), 'auto_glosar', p_auto_id,
    jsonb_build_object('glosa_id', v_id, 'motivo', p_motivo, 'valor', v_valor, 'descricao', v_desc));
  PERFORM public._auto_evento(p_auto_id, 'AUTO_GLOSADO', 'glosado', p_motivo || ': ' || public._eur(v_valor) || ' — ' || left(v_desc, 150));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_levantar_glosa(p_glosa_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_g   public.auto_glosas%ROWTYPE;
  v_a   public.autos_medicao%ROWTYPE;
  v_mot text := NULLIF(btrim(p_motivo), '');
BEGIN
  IF NOT public.pode_gerir_obras() THEN
    RAISE EXCEPTION 'Sem permissão para levantar glosas';
  END IF;
  SELECT * INTO v_g FROM public.auto_glosas WHERE id = p_glosa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Glosa não encontrada';
  END IF;
  SELECT * INTO v_a FROM public.autos_medicao WHERE id = v_g.auto_id FOR UPDATE;
  SELECT * INTO v_g FROM public.auto_glosas WHERE id = p_glosa_id FOR UPDATE;
  IF v_a.workflow = 'validado' THEN
    RAISE EXCEPTION 'Este auto já está aprovado — as glosas já não se alteram';
  END IF;
  IF v_g.estado = 'levantada' THEN
    RAISE EXCEPTION 'Esta glosa já foi levantada';
  END IF;
  IF v_mot IS NULL OR length(v_mot) < 5 THEN
    RAISE EXCEPTION 'Indique o motivo para levantar a glosa (mínimo 5 caracteres)';
  END IF;
  IF length(v_mot) > 1000 THEN
    RAISE EXCEPTION 'O motivo é demasiado longo (máximo 1000 caracteres)';
  END IF;

  UPDATE public.auto_glosas
     SET estado = 'levantada', levantada_por = auth.uid(), levantada_em = now(), motivo_levantamento = v_mot
   WHERE id = p_glosa_id;
  PERFORM set_config('app.auto_rpc', 'on', true);
  PERFORM public._auto_recalcular_glosado(v_g.auto_id);
  PERFORM set_config('app.auto_rpc', 'off', true);

  INSERT INTO public.audit_log (actor_id, action, target_id, details)
  VALUES (auth.uid(), 'auto_levantar_glosa', v_g.auto_id,
    jsonb_build_object('glosa_id', p_glosa_id, 'valor', v_g.valor, 'motivo', v_mot));
  PERFORM public._auto_evento(v_g.auto_id, 'AUTO_GLOSADO', 'com glosa levantada',
    public._eur(v_g.valor) || ' (' || v_g.motivo || ') — ' || left(v_mot, 150));
END;
$$;

-- ── 8. Devolver ao rascunho ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_devolver(p_auto_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a   public.autos_medicao%ROWTYPE;
  v_mot text := NULLIF(btrim(p_motivo), '');
BEGIN
  IF NOT public.pode_medir_obras() THEN
    RAISE EXCEPTION 'Sem permissão para devolver autos de medição';
  END IF;
  SELECT * INTO v_a FROM public.autos_medicao WHERE id = p_auto_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auto não encontrado';
  END IF;
  IF v_a.workflow NOT IN ('submetido', 'verificado') THEN
    RAISE EXCEPTION 'Só se devolve um auto submetido ou verificado';
  END IF;
  IF v_mot IS NULL OR length(v_mot) < 5 THEN
    RAISE EXCEPTION 'Indique o motivo da devolução (mínimo 5 caracteres)';
  END IF;
  IF length(v_mot) > 1000 THEN
    RAISE EXCEPTION 'O motivo é demasiado longo (máximo 1000 caracteres)';
  END IF;

  DELETE FROM public.auto_verificacoes WHERE auto_id = p_auto_id;
  PERFORM set_config('app.auto_rpc', 'on', true);
  UPDATE public.autos_medicao
     SET workflow = 'rascunho', submetido_por = NULL, submetido_em = NULL, verificado_por = NULL, verificado_em = NULL
   WHERE id = p_auto_id;
  PERFORM set_config('app.auto_rpc', 'off', true);

  INSERT INTO public.audit_log (actor_id, action, target_id, details)
  VALUES (auth.uid(), 'auto_devolver', p_auto_id, jsonb_build_object('de', v_a.workflow, 'motivo', v_mot));
  PERFORM public._auto_evento(p_auto_id, 'AUTO_DEVOLVIDO', 'devolvido ao rascunho', v_mot);
END;
$$;

-- ── 9. Aprovar (alçada, segregação, documentos) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_aprovar(p_auto_id uuid, p_excecao_docs_motivo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a      public.autos_medicao%ROWTYPE;
  v_cfg    public.subs_config%ROWTYPE := public._subs_cfg();
  v_admin  boolean := COALESCE(public.auth_role() = 'admin', false);
  v_cert   numeric;
  v_extras boolean;
  v_docs   text[] := '{}';
  v_mot    text;
BEGIN
  IF NOT public.pode_gerir_obras() THEN
    RAISE EXCEPTION 'Sem permissão para aprovar autos de medição';
  END IF;
  SELECT * INTO v_a FROM public.autos_medicao WHERE id = p_auto_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auto não encontrado';
  END IF;
  IF v_a.workflow = 'validado' THEN
    RAISE EXCEPTION 'Este auto já está aprovado';
  END IF;
  IF v_a.workflow <> 'verificado' THEN
    RAISE EXCEPTION 'O auto tem de estar verificado antes de ser aprovado';
  END IF;
  v_cert := v_a.valor_periodo - v_a.valor_glosado;
  IF v_cert <= 0 THEN
    RAISE EXCEPTION 'O valor certificado do auto tem de ser superior a 0';
  END IF;

  v_extras := EXISTS (SELECT 1 FROM public.auto_linhas WHERE auto_id = p_auto_id AND is_extra);
  IF NOT v_admin AND v_extras THEN
    RAISE EXCEPTION 'Este auto tem trabalhos a mais: só o administrador o pode aprovar';
  END IF;
  IF NOT v_admin AND v_cert > v_cfg.alcada_gestor_ate THEN
    RAISE EXCEPTION 'Acima de % só o administrador pode aprovar (certificado: %)', public._eur(v_cfg.alcada_gestor_ate), public._eur(v_cert);
  END IF;
  IF NOT v_admin AND v_a.created_by = auth.uid() THEN
    RAISE EXCEPTION 'Quem criou o auto não o pode aprovar';
  END IF;

  IF v_cfg.bloquear_pagamento_sem_docs THEN
    v_docs := public._sub_docs_bloqueio(v_a.subempreiteiro_id);
  END IF;
  IF cardinality(v_docs) > 0 THEN
    v_mot := NULLIF(btrim(p_excecao_docs_motivo), '');
    IF v_mot IS NULL THEN
      RAISE EXCEPTION 'Documentos obrigatórios em falta ou expirados: %', array_to_string(v_docs, ', ');
    END IF;
    IF NOT v_admin THEN
      RAISE EXCEPTION 'Só o administrador pode aprovar com documentos em falta';
    END IF;
    IF length(v_mot) < 10 THEN
      RAISE EXCEPTION 'O motivo da exceção tem de ter pelo menos 10 caracteres';
    END IF;
  END IF;

  PERFORM set_config('app.auto_rpc', 'on', true);
  UPDATE public.autos_medicao
     SET estado = 'validado', workflow = 'validado', validado_por = auth.uid(), validado_em = now(),
         data_vencimento = public._hoje_pt() + v_cfg.prazo_pagamento_dias,
         excecao_motivo = CASE WHEN v_mot IS NULL THEN excecao_motivo
                               ELSE left(concat_ws(E'\n', excecao_motivo,
                                    'Aprovação com documentos em falta (' || array_to_string(v_docs, ', ') || '): ' || v_mot), 4000) END
   WHERE id = p_auto_id;
  PERFORM set_config('app.auto_rpc', 'off', true);

  INSERT INTO public.audit_log (actor_id, action, target_id, details)
  VALUES (auth.uid(), 'auto_aprovar', p_auto_id, jsonb_build_object(
    'subempreiteiro_id', v_a.subempreiteiro_id, 'numero', v_a.numero, 'valor_periodo', v_a.valor_periodo,
    'valor_glosado', v_a.valor_glosado, 'certificado', v_cert, 'trabalhos_a_mais', v_extras,
    'excecao_docs', v_mot, 'docs_em_falta', to_jsonb(v_docs)));
END;
$$;

-- Legado: a cadeia não se contorna — validar_auto é só outro nome de auto_aprovar
CREATE OR REPLACE FUNCTION public.validar_auto(p_id uuid)
RETURNS public.autos_medicao
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.autos_medicao%ROWTYPE;
BEGIN
  PERFORM public.auto_aprovar(p_id, NULL);
  SELECT * INTO v_row FROM public.autos_medicao WHERE id = p_id;
  RETURN v_row;
END;
$$;

-- ── 10. Fatura do subempreiteiro (só guardada) e pagamento ──────────────────
CREATE OR REPLACE FUNCTION public.auto_registar_fatura(
  p_auto_id uuid,
  p_numero  text,
  p_data    date,
  p_valor   numeric,
  p_path    text,
  p_nome    text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a     public.autos_medicao%ROWTYPE;
  v_num   text := NULLIF(btrim(p_numero), '');
  v_nome  text := NULLIF(btrim(p_nome), '');
  v_valor numeric := round(p_valor, 2);
  v_cert  numeric;
  v_det   text;
BEGIN
  IF NOT public.pode_gerir_obras() THEN
    RAISE EXCEPTION 'Sem permissão para guardar faturas de subempreiteiros';
  END IF;
  SELECT * INTO v_a FROM public.autos_medicao WHERE id = p_auto_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auto não encontrado';
  END IF;
  IF v_a.workflow <> 'validado' THEN
    RAISE EXCEPTION 'A fatura só se guarda depois de o auto ser aprovado';
  END IF;
  IF v_a.estado_pagamento = 'pago' THEN
    RAISE EXCEPTION 'Este auto já foi pago — a fatura já não pode ser substituída';
  END IF;
  IF v_num IS NULL THEN
    RAISE EXCEPTION 'Indique o número da fatura';
  END IF;
  IF length(v_num) > 50 THEN
    RAISE EXCEPTION 'O número da fatura é demasiado longo (máximo 50 caracteres)';
  END IF;
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'Indique a data da fatura';
  END IF;
  IF p_data > public._hoje_pt() THEN
    RAISE EXCEPTION 'A data da fatura não pode ser futura';
  END IF;
  IF v_valor IS NULL OR v_valor <= 0 THEN
    RAISE EXCEPTION 'O valor da fatura tem de ser superior a 0';
  END IF;
  IF p_path IS NULL OR p_path !~ ('^' || v_a.subempreiteiro_id::text || '/fatura-[0-9]{1,16}\.(pdf|jpg|jpeg|png|webp|heic|heif)$') THEN
    RAISE EXCEPTION 'Ficheiro da fatura inválido';
  END IF;
  IF v_nome IS NULL OR length(v_nome) > 200 THEN
    RAISE EXCEPTION 'Indique o nome do ficheiro (máximo 200 caracteres)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.autos_medicao WHERE fatura_path = p_path AND id <> p_auto_id) THEN
    RAISE EXCEPTION 'Este ficheiro já foi registado noutro auto';
  END IF;

  v_cert := v_a.valor_periodo - v_a.valor_glosado;
  v_det := 'Fatura ' || v_num || ' de ' || to_char(p_data, 'DD/MM/YYYY') || ': ' || public._eur(v_valor)
    || CASE WHEN v_a.fatura_numero IS NOT NULL
            THEN ' (substitui a fatura ' || v_a.fatura_numero || ': ' || public._eur(v_a.fatura_valor) || ')' ELSE '' END
    || CASE WHEN abs(v_valor - v_cert) > 0.01 THEN ' — diverge do certificado (' || public._eur(v_cert) || ')' ELSE '' END;

  PERFORM set_config('app.auto_rpc', 'on', true);
  UPDATE public.autos_medicao
     SET fatura_numero = v_num, fatura_data = p_data, fatura_valor = v_valor, fatura_path = p_path,
         fatura_nome = v_nome, fatura_registada_em = now()
   WHERE id = p_auto_id;
  PERFORM set_config('app.auto_rpc', 'off', true);

  INSERT INTO public.audit_log (actor_id, action, target_id, details)
  VALUES (auth.uid(), 'auto_registar_fatura', p_auto_id, jsonb_build_object(
    'numero', v_num, 'data', p_data, 'valor', v_valor, 'path', p_path, 'certificado', v_cert,
    'anterior', CASE WHEN v_a.fatura_numero IS NOT NULL THEN jsonb_build_object('numero', v_a.fatura_numero,
      'valor', v_a.fatura_valor, 'path', v_a.fatura_path) END));
  PERFORM public._auto_evento(p_auto_id, 'AUTO_FATURA',
    CASE WHEN v_a.fatura_numero IS NOT NULL THEN 'com fatura substituída' ELSE 'com fatura guardada' END, v_det);
END;
$$;

DROP FUNCTION IF EXISTS public.marcar_auto_pago(uuid, text);
CREATE OR REPLACE FUNCTION public.marcar_auto_pago(
  p_auto_id        uuid,
  p_referencia     text DEFAULT NULL,
  p_excecao_motivo text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a     public.autos_medicao%ROWTYPE;
  v_s     public.subempreiteiros%ROWTYPE;
  v_cfg   public.subs_config%ROWTYPE := public._subs_cfg();
  v_admin boolean := COALESCE(public.auth_role() = 'admin', false);
  v_ref   text := NULLIF(btrim(p_referencia), '');
  v_docs  text[] := '{}';
  v_mot   text;
  v_cert  numeric;
  v_pagar numeric;
BEGIN
  IF NOT public.pode_gerir_obras() THEN
    RAISE EXCEPTION 'Sem permissão para marcar pagamento de auto';
  END IF;
  SELECT * INTO v_a FROM public.autos_medicao WHERE id = p_auto_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auto não encontrado';
  END IF;
  IF v_a.estado_pagamento = 'pago' THEN
    RAISE EXCEPTION 'Este auto já foi pago';
  END IF;
  IF v_a.workflow <> 'validado' THEN
    RAISE EXCEPTION 'Só se paga um auto aprovado';
  END IF;
  IF length(v_ref) > 100 THEN
    RAISE EXCEPTION 'A referência do pagamento é demasiado longa (máximo 100 caracteres)';
  END IF;
  IF v_cfg.exigir_fatura_para_pagar AND (v_a.fatura_numero IS NULL OR v_a.fatura_path IS NULL) THEN
    RAISE EXCEPTION 'Falta guardar a fatura do subempreiteiro (número e ficheiro)';
  END IF;
  IF public._sub_oc_bloqueantes(v_a.subempreiteiro_id) > 0 THEN
    RAISE EXCEPTION 'Existem ocorrências graves de qualidade ou segurança por resolver neste subempreiteiro';
  END IF;
  IF v_cfg.bloquear_pagamento_sem_docs THEN
    v_docs := public._sub_docs_bloqueio(v_a.subempreiteiro_id);
  END IF;
  IF cardinality(v_docs) > 0 THEN
    v_mot := NULLIF(btrim(p_excecao_motivo), '');
    IF v_mot IS NULL THEN
      RAISE EXCEPTION 'Documentos obrigatórios em falta ou expirados: %', array_to_string(v_docs, ', ');
    END IF;
    IF NOT v_admin THEN
      RAISE EXCEPTION 'Só o administrador pode pagar com documentos em falta';
    END IF;
    IF length(v_mot) < 10 THEN
      RAISE EXCEPTION 'O motivo da exceção tem de ter pelo menos 10 caracteres';
    END IF;
  END IF;

  SELECT * INTO v_s FROM public.subempreiteiros WHERE id = v_a.subempreiteiro_id;
  v_cert  := v_a.valor_periodo - v_a.valor_glosado;
  v_pagar := v_cert - round(v_cert * v_s.percentagem_retencao / 100, 2);

  PERFORM set_config('app.auto_rpc', 'on', true);
  UPDATE public.autos_medicao
     SET estado_pagamento = 'pago', data_pagamento = now(), referencia_pagamento = v_ref,
         excecao_motivo = CASE WHEN v_mot IS NULL THEN excecao_motivo
                               ELSE left(concat_ws(E'\n', excecao_motivo,
                                    'Pagamento com documentos em falta (' || array_to_string(v_docs, ', ') || '): ' || v_mot), 4000) END
   WHERE id = p_auto_id;
  PERFORM set_config('app.auto_rpc', 'off', true);

  INSERT INTO public.audit_log (actor_id, action, target_id, details)
  VALUES (auth.uid(), 'marcar_auto_pago', p_auto_id, jsonb_build_object(
    'referencia', v_ref, 'certificado', v_cert, 'a_pagar', v_pagar, 'fatura_numero', v_a.fatura_numero,
    'fatura_valor', v_a.fatura_valor, 'fatura_diverge', v_a.fatura_valor IS NOT NULL AND abs(v_a.fatura_valor - v_cert) > 0.01,
    'excecao_docs', v_mot, 'docs_em_falta', to_jsonb(v_docs)));
  PERFORM public._auto_evento(p_auto_id, 'AUTO_PAGO', 'pago',
    public._eur(v_pagar) || CASE WHEN v_ref IS NOT NULL THEN ' — ref. ' || v_ref ELSE '' END);
END;
$$;

CREATE OR REPLACE FUNCTION public.marcar_auto_em_atraso(p_auto_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.pode_gerir_obras() THEN
    RAISE EXCEPTION 'Sem permissão para marcar auto em atraso';
  END IF;
  PERFORM set_config('app.auto_rpc', 'on', true);
  UPDATE public.autos_medicao
     SET estado_pagamento = 'em_atraso'
   WHERE id = p_auto_id AND estado = 'validado' AND estado_pagamento = 'por_pagar';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auto não encontrado, não está validado, ou já foi pago';
  END IF;
  PERFORM set_config('app.auto_rpc', 'off', true);
END;
$$;

-- ── 11. Libertação da retenção ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sub_libertar_retencao(
  p_sub_id uuid,
  p_valor  numeric,
  p_motivo text,
  p_obs    text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s      public.subempreiteiros%ROWTYPE;
  v_valor  numeric := round(p_valor, 2);
  v_obs    text := NULLIF(btrim(p_obs), '');
  v_retido numeric;
  v_lib    numeric;
  v_id     uuid;
BEGIN
  IF NOT public.pode_gerir_obras() THEN
    RAISE EXCEPTION 'Sem permissão para libertar retenções';
  END IF;
  SELECT * INTO v_s FROM public.subempreiteiros WHERE id = p_sub_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contratação não encontrada';
  END IF;
  IF v_valor IS NULL OR v_valor <= 0 THEN
    RAISE EXCEPTION 'O valor a libertar tem de ser superior a 0';
  END IF;
  IF p_motivo IS NULL OR p_motivo NOT IN ('conclusao_obra', 'periodo_garantia', 'acordo_parcial', 'outro') THEN
    RAISE EXCEPTION 'Motivo de libertação inválido';
  END IF;
  IF length(v_obs) > 1000 THEN
    RAISE EXCEPTION 'As observações são demasiado longas (máximo 1000 caracteres)';
  END IF;
  IF public._sub_oc_bloqueantes(p_sub_id) > 0 THEN
    RAISE EXCEPTION 'Existem ocorrências graves de qualidade ou segurança por resolver — a retenção não pode ser libertada';
  END IF;

  SELECT COALESCE(sum(round((a.valor_periodo - a.valor_glosado) * v_s.percentagem_retencao / 100, 2)), 0) INTO v_retido
    FROM public.autos_medicao a WHERE a.subempreiteiro_id = p_sub_id AND a.workflow = 'validado';
  SELECT COALESCE(sum(l.valor), 0) INTO v_lib FROM public.liberacoes_retencao l WHERE l.subempreiteiro_id = p_sub_id;
  IF v_lib + v_valor > v_retido THEN
    RAISE EXCEPTION 'Só pode libertar até % (retido %, já libertado %)', public._eur(v_retido - v_lib), public._eur(v_retido), public._eur(v_lib);
  END IF;

  INSERT INTO public.liberacoes_retencao (subempreiteiro_id, obra_id, valor, data_liberacao, motivo, observacoes, registado_por)
  VALUES (p_sub_id, v_s.obra_id, v_valor, public._hoje_pt(), p_motivo, v_obs, auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.audit_log (actor_id, action, target_id, details)
  VALUES (auth.uid(), 'sub_libertar_retencao', p_sub_id, jsonb_build_object(
    'liberacao_id', v_id, 'valor', v_valor, 'motivo', p_motivo, 'retido', v_retido, 'ja_libertado', v_lib));
  RETURN v_id;
END;
$$;

-- ── 12. Provas legadas (auto_guardar_evidencias) respeitam o fluxo ──────────
CREATE OR REPLACE FUNCTION public.auto_guardar_evidencias(
  p_auto_id              uuid,
  p_fotos                jsonb   DEFAULT '[]',
  p_anotacoes            text    DEFAULT NULL,
  p_problemas            text    DEFAULT NULL,
  p_atraso_dias          integer DEFAULT 0,
  p_clima                text    DEFAULT NULL,
  p_clima_descricao      text    DEFAULT NULL,
  p_progresso_fisico_pct numeric DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a     public.autos_medicao%ROWTYPE;
  v_obra  uuid;
  v_dias  integer := COALESCE(p_atraso_dias, 0);
  v_fotos jsonb;
BEGIN
  IF NOT public.pode_escrever('subempreitadas') THEN
    RAISE EXCEPTION 'Sem permissão para alterar autos de medição';
  END IF;
  SELECT * INTO v_a FROM public.autos_medicao WHERE id = p_auto_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auto não encontrado';
  END IF;
  IF v_a.workflow <> 'rascunho' AND public.auth_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Este auto já foi submetido — só o administrador pode alterar as provas';
  END IF;
  IF v_dias < 0 OR v_dias > 3650 THEN
    RAISE EXCEPTION 'Dias de atraso inválidos';
  END IF;
  IF p_progresso_fisico_pct IS NOT NULL AND (p_progresso_fisico_pct < 0 OR p_progresso_fisico_pct > 100) THEN
    RAISE EXCEPTION 'O progresso físico tem de estar entre 0 e 100';
  END IF;
  IF NOT public._clima_ok(p_clima) THEN
    RAISE EXCEPTION 'Clima inválido';
  END IF;
  IF length(p_anotacoes) > 5000 OR length(p_problemas) > 5000 OR length(p_clima_descricao) > 1000 THEN
    RAISE EXCEPTION 'Texto demasiado longo';
  END IF;
  SELECT obra_id INTO v_obra FROM public.subempreiteiros WHERE id = v_a.subempreiteiro_id;
  v_fotos := public._obra_fotos_validar(v_obra, p_fotos);

  PERFORM set_config('app.auto_rpc', 'on', true);
  UPDATE public.autos_medicao
     SET fotos = v_fotos, anotacoes = NULLIF(btrim(p_anotacoes), ''), problemas = NULLIF(btrim(p_problemas), ''),
         atraso_dias = v_dias, clima = p_clima, clima_descricao = NULLIF(btrim(p_clima_descricao), ''),
         progresso_fisico_pct = p_progresso_fisico_pct
   WHERE id = p_auto_id;
  PERFORM set_config('app.auto_rpc', 'off', true);

  IF v_a.workflow <> 'rascunho' THEN
    INSERT INTO public.audit_log (actor_id, action, target_id, details)
    VALUES (auth.uid(), 'auto_guardar_evidencias_admin', p_auto_id, jsonb_build_object(
      'workflow', v_a.workflow, 'antes', jsonb_build_object('anotacoes', v_a.anotacoes, 'problemas', v_a.problemas,
      'atraso_dias', v_a.atraso_dias, 'progresso_fisico_pct', v_a.progresso_fisico_pct, 'fotos', v_a.fotos)));
  END IF;
END;
$$;

-- Atividade: o auto validado mostra o valor certificado
CREATE OR REPLACE FUNCTION public._trg_evento_auto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s public.subempreiteiros%ROWTYPE;
BEGIN
  IF NEW.estado = 'validado' AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    SELECT * INTO v_s FROM public.subempreiteiros WHERE id = NEW.subempreiteiro_id;
    PERFORM public._obra_evento(v_s.obra_id, 'AUTO_VALIDADO',
      'Auto n.º ' || NEW.numero || ' validado — ' || v_s.nome,
      to_char(NEW.valor_periodo - NEW.valor_glosado, 'FM999G999G990D00') || ' € certificados');
  END IF;
  RETURN NULL;
END;
$$;

-- ── 13. Métricas sobre o certificado ────────────────────────────────────────
DROP FUNCTION IF EXISTS public._subs_metricas(uuid, uuid);
CREATE FUNCTION public._subs_metricas(p_obra_id uuid, p_sub_id uuid)
RETURNS TABLE (
  sub_id uuid, obra_id uuid, obra_nome text, nome text, especialidade text, tipo text, estado text, ativo boolean,
  valor_contrato numeric, executado numeric, executado_pct numeric, pago numeric, por_pagar numeric, retencao_acumulada numeric,
  autos_n integer, ultimo_auto date, dias_sem_auto integer, atraso_dias_total integer, atraso_aberto integer,
  oc_baixa integer, oc_media integer, oc_alta integer, ocorrencias_total integer, presencas_relatorios integer,
  tem_contrato boolean, data_inicio date, data_fim_prevista date, dias_restantes integer, saude text, motivos text[],
  bruto numeric, glosado numeric, taxa_glosa_pct numeric, em_aprovacao_n integer, em_aprovacao_valor numeric,
  progresso_fisico_pct numeric, desvio_pp numeric, retencao_libertada numeric, artigos_sem_eap integer, orcado_ligado numeric,
  ocorrencias_bloqueantes integer, docs_estado text, docs_em_falta text[], docs_a_expirar text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH hoje AS (SELECT public._hoje_pt() AS d),
  s AS (
    SELECT sb.*, o.nome AS obra_nome
      FROM public.subempreiteiros sb
      JOIN public.obras o ON o.id = sb.obra_id
     WHERE (p_sub_id IS NULL OR sb.id = p_sub_id) AND (p_obra_id IS NULL OR sb.obra_id = p_obra_id)
  ),
  k AS (
    SELECT s.id, round(CASE WHEN s.tipo = 'global' THEN COALESCE(s.valor_global, 0)
                            ELSE COALESCE((SELECT sum(a.preco_unitario * a.quantidade_prevista)
                                             FROM public.subempreiteiro_artigos a WHERE a.subempreiteiro_id = s.id), 0) END, 2) AS contrato
      FROM s
  ),
  am AS (
    SELECT a.subempreiteiro_id AS sid, a.estado::text AS est, a.workflow, a.estado_pagamento, a.data_medicao, a.numero,
           a.atraso_dias, a.progresso_fisico_pct, a.valor_periodo, a.valor_glosado,
           a.valor_periodo - a.valor_glosado AS cert,
           round((a.valor_periodo - a.valor_glosado) * s.percentagem_retencao / 100, 2) AS ret
      FROM public.autos_medicao a JOIN s ON s.id = a.subempreiteiro_id
  ),
  au AS (
    SELECT am.sid, count(*)::int AS n, max(am.data_medicao) AS ultimo,
           COALESCE(sum(am.atraso_dias), 0)::int AS atraso,
           COALESCE(sum(am.cert) FILTER (WHERE am.est = 'validado'), 0) AS exec,
           COALESCE(sum(am.ret) FILTER (WHERE am.est = 'validado'), 0) AS ret,
           COALESCE(sum(am.cert - am.ret) FILTER (WHERE am.est = 'validado' AND am.estado_pagamento = 'pago'), 0) AS pago,
           COALESCE(sum(am.valor_periodo) FILTER (WHERE am.est = 'validado'), 0) AS bruto,
           COALESCE(sum(am.valor_glosado) FILTER (WHERE am.est = 'validado'), 0) AS glos,
           (count(*) FILTER (WHERE am.workflow IN ('submetido', 'verificado')))::int AS em_n,
           COALESCE(sum(am.cert) FILTER (WHERE am.workflow IN ('submetido', 'verificado')), 0) AS em_v
      FROM am GROUP BY am.sid
  ),
  pf AS (
    SELECT DISTINCT ON (am.sid) am.sid, am.progresso_fisico_pct AS pf
      FROM am WHERE am.est = 'validado' AND am.progresso_fisico_pct IS NOT NULL
     ORDER BY am.sid, am.data_medicao DESC, am.numero DESC
  ),
  lib AS (
    SELECT l.subempreiteiro_id AS sid, sum(l.valor) AS v
      FROM public.liberacoes_retencao l WHERE l.subempreiteiro_id IN (SELECT id FROM s) GROUP BY l.subempreiteiro_id
  ),
  art AS (
    SELECT a.subempreiteiro_id AS sid, (count(*) FILTER (WHERE a.orcamento_item_id IS NULL))::int AS sem_eap,
           COALESCE(sum(a.quantidade_prevista * i.preco_unitario) FILTER (WHERE i.id IS NOT NULL), 0) AS orc
      FROM public.subempreiteiro_artigos a
      LEFT JOIN public.obra_orcamento_itens i ON i.id = a.orcamento_item_id
     WHERE a.subempreiteiro_id IN (SELECT id FROM s)
     GROUP BY a.subempreiteiro_id
  ),
  oc AS (
    SELECT x.subempreiteiro_id AS sid, count(*)::int AS total,
           COALESCE(sum(x.dias_atraso), 0)::int AS atraso,
           COALESCE(sum(x.dias_atraso) FILTER (WHERE NOT x.resolvido), 0)::int AS atraso_ab,
           (count(*) FILTER (WHERE NOT x.resolvido AND x.gravidade = 'baixa'))::int AS baixa,
           (count(*) FILTER (WHERE NOT x.resolvido AND x.gravidade = 'media'))::int AS media,
           (count(*) FILTER (WHERE NOT x.resolvido AND x.gravidade = 'alta'))::int AS alta,
           (count(*) FILTER (WHERE NOT x.resolvido AND x.gravidade = 'alta' AND x.tipo IN ('QUALIDADE', 'SEGURANCA')))::int AS bloq
      FROM public.sub_ocorrencias x
     WHERE x.subempreiteiro_id IN (SELECT id FROM s)
     GROUP BY x.subempreiteiro_id
  ),
  pr AS (
    SELECT t.sid, count(*)::int AS n
      FROM (SELECT unnest(r.subempreiteiros_ids) AS sid FROM public.obra_relatorios_diarios r WHERE r.estado = 'submetido') t
     WHERE t.sid IN (SELECT id FROM s)
     GROUP BY t.sid
  ),
  m AS (
    SELECT s.*, k.contrato, COALESCE(au.n, 0) AS autos_n, au.ultimo, COALESCE(au.atraso, 0) + COALESCE(oc.atraso, 0) AS atraso_total,
           COALESCE(oc.atraso_ab, 0) AS atraso_ab, COALESCE(oc.baixa, 0) AS baixa, COALESCE(oc.media, 0) AS media,
           COALESCE(oc.alta, 0) AS alta, COALESCE(oc.bloq, 0) AS bloq, COALESCE(oc.total, 0) AS oc_total, COALESCE(pr.n, 0) AS pres,
           COALESCE(au.exec, 0) AS exec, COALESCE(au.ret, 0) AS ret, COALESCE(au.pago, 0) AS pago,
           COALESCE(au.bruto, 0) AS bruto, COALESCE(au.glos, 0) AS glos, COALESCE(au.em_n, 0) AS em_n, COALESCE(au.em_v, 0) AS em_v,
           COALESCE(lib.v, 0) AS lib, COALESCE(art.sem_eap, 0) AS sem_eap, COALESCE(art.orc, 0) AS orc, pf.pf,
           CASE WHEN k.contrato > 0 THEN round(COALESCE(au.exec, 0) / k.contrato * 100, 2) END AS pct,
           d.falta, d.aexp,
           h.d AS hoje,
           CASE WHEN s.data_fim_prevista IS NOT NULL THEN s.data_fim_prevista - h.d END AS restantes
      FROM s
      JOIN k ON k.id = s.id
      CROSS JOIN hoje h
      LEFT JOIN au  ON au.sid  = s.id
      LEFT JOIN oc  ON oc.sid  = s.id
      LEFT JOIN pr  ON pr.sid  = s.id
      LEFT JOIN pf  ON pf.sid  = s.id
      LEFT JOIN lib ON lib.sid = s.id
      LEFT JOIN art ON art.sid = s.id
      CROSS JOIN LATERAL (
        SELECT COALESCE(array_agg(e.tipo) FILTER (WHERE e.obrigatorio AND e.estado IN ('em_falta', 'expirado')), '{}'::text[]) AS falta,
               COALESCE(array_agg(e.tipo) FILTER (WHERE e.obrigatorio AND e.estado = 'a_expirar'), '{}'::text[]) AS aexp
          FROM public._sub_docs_estado(s.id) e
      ) d
  ),
  m2 AS (
    SELECT m.*, CASE WHEN m.pct IS NOT NULL AND m.pf IS NOT NULL THEN round(m.pct - m.pf, 2) END AS desvio
      FROM m
  )
  SELECT m.id, m.obra_id, m.obra_nome, m.nome, m.especialidade, m.tipo::text, m.estado::text, m.ativo,
         m.contrato, round(m.exec, 2), m.pct, round(m.pago, 2), round(m.exec - m.ret - m.pago, 2), round(m.ret, 2),
         m.autos_n, m.ultimo, CASE WHEN m.ultimo IS NOT NULL THEN m.hoje - m.ultimo END,
         m.atraso_total, m.atraso_ab, m.baixa, m.media, m.alta, m.oc_total, m.pres,
         m.contrato_path IS NOT NULL, m.data_inicio, m.data_fim_prevista, m.restantes,
         CASE WHEN cardinality(x.crit) > 0 THEN 'critico' WHEN cardinality(x.aten) > 0 THEN 'atencao' ELSE 'ok' END,
         x.crit || x.aten,
         round(m.bruto, 2), round(m.glos, 2), CASE WHEN m.bruto > 0 THEN round(m.glos / m.bruto * 100, 2) ELSE 0 END,
         m.em_n, round(m.em_v, 2), m.pf, m.desvio, round(m.lib, 2), m.sem_eap, round(m.orc, 2), m.bloq,
         CASE WHEN cardinality(m.falta) > 0 THEN 'critico' WHEN cardinality(m.aexp) > 0 THEN 'a_expirar' ELSE 'ok' END,
         m.falta, m.aexp
    FROM m2 m
    CROSS JOIN LATERAL (
      SELECT array_remove(ARRAY[
               CASE WHEN m.alta > 0 THEN m.alta || CASE WHEN m.alta = 1 THEN ' ocorrência grave por resolver' ELSE ' ocorrências graves por resolver' END END,
               CASE WHEN m.restantes < 0 AND COALESCE(m.pct, 0) < 100
                    THEN 'Prazo ultrapassado há ' || (-m.restantes) || CASE WHEN m.restantes = -1 THEN ' dia' ELSE ' dias' END END,
               CASE WHEN m.atraso_ab >= 15 THEN 'Atraso acumulado de ' || m.atraso_ab || ' dias' END,
               CASE WHEN m.estado = 'validado' AND cardinality(m.falta) > 0
                    THEN 'Documentos obrigatórios em falta ou expirados: ' || array_to_string(m.falta, ', ') END
             ]::text[], NULL) AS crit,
             array_remove(ARRAY[
               CASE WHEN m.baixa + m.media > 0 THEN (m.baixa + m.media) || CASE WHEN m.baixa + m.media = 1 THEN ' ocorrência por resolver' ELSE ' ocorrências por resolver' END END,
               CASE WHEN m.atraso_ab > 0 AND m.atraso_ab < 15 THEN 'Atraso de ' || m.atraso_ab || CASE WHEN m.atraso_ab = 1 THEN ' dia' ELSE ' dias' END END,
               CASE WHEN m.restantes BETWEEN 0 AND 7 AND COALESCE(m.pct, 0) < 100
                    THEN CASE WHEN m.restantes = 0 THEN 'O prazo termina hoje' ELSE 'O prazo termina em ' || m.restantes || CASE WHEN m.restantes = 1 THEN ' dia' ELSE ' dias' END END END,
               CASE WHEN m.estado = 'validado' AND m.contrato > 0 AND COALESCE(m.pct, 0) < 100 AND m.ultimo IS NOT NULL AND m.hoje - m.ultimo > 45
                    THEN 'Sem auto de medição há ' || (m.hoje - m.ultimo) || ' dias' END,
               CASE WHEN m.estado = 'validado' AND m.contrato > 0 AND COALESCE(m.pct, 0) < 100 AND m.ultimo IS NULL
                         AND m.validado_em IS NOT NULL AND m.hoje - (m.validado_em AT TIME ZONE 'Europe/Lisbon')::date > 45
                    THEN 'Ainda sem autos de medição' END,
               CASE WHEN m.estado = 'validado' AND cardinality(m.falta) = 0 AND cardinality(m.aexp) > 0
                    THEN 'Documentos a expirar: ' || array_to_string(m.aexp, ', ') END,
               CASE WHEN m.desvio > 10
                    THEN 'Execução financeira ' || round(m.desvio)::int || ' pp acima do progresso físico' END
             ]::text[], NULL) AS aten
    ) x
$$;

CREATE OR REPLACE FUNCTION public.sub_painel(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_obra   uuid;
  v_cfg    public.subs_config%ROWTYPE := public._subs_cfg();
  m        record;
  v_bloq   text[] := '{}';
  v_avisos text[];
BEGIN
  SELECT obra_id INTO v_obra FROM public.subempreiteiros WHERE id = p_id;
  IF NOT FOUND OR NOT public.pode_ver_obra(v_obra) THEN
    RAISE EXCEPTION 'Contratação não encontrada';
  END IF;
  SELECT * INTO m FROM public._subs_metricas(NULL, p_id);

  IF v_cfg.bloquear_pagamento_sem_docs AND cardinality(m.docs_em_falta) > 0 THEN
    v_bloq := v_bloq || ('Documentos obrigatórios em falta ou expirados: ' || array_to_string(m.docs_em_falta, ', '));
  END IF;
  IF m.ocorrencias_bloqueantes > 0 THEN
    v_bloq := v_bloq || 'Existem ocorrências graves de qualidade ou segurança por resolver'::text;
  END IF;

  SELECT COALESCE(array_agg(t.texto ORDER BY t.numero, t.ord), '{}') INTO v_avisos
    FROM (
      SELECT a.numero, 1 AS ord, 'Auto n.º ' || a.numero || ': o valor da fatura (' || public._eur(a.fatura_valor)
             || ') diverge do certificado (' || public._eur(a.valor_periodo - a.valor_glosado) || ')' AS texto
        FROM public.autos_medicao a
       WHERE a.subempreiteiro_id = p_id AND a.workflow = 'validado' AND a.estado_pagamento <> 'pago'
         AND a.fatura_valor IS NOT NULL AND abs(a.fatura_valor - (a.valor_periodo - a.valor_glosado)) > 0.01
      UNION ALL
      SELECT a.numero, 2, 'Auto n.º ' || a.numero || ': falta guardar a fatura do subempreiteiro'
        FROM public.autos_medicao a
       WHERE v_cfg.exigir_fatura_para_pagar AND a.subempreiteiro_id = p_id AND a.workflow = 'validado'
         AND a.estado_pagamento <> 'pago' AND a.fatura_numero IS NULL
    ) t;
  IF m.artigos_sem_eap > 0 THEN
    v_avisos := v_avisos || (m.artigos_sem_eap || CASE WHEN m.artigos_sem_eap = 1 THEN ' artigo sem ligação ao orçamento (EAP)'
                                                       ELSE ' artigos sem ligação ao orçamento (EAP)' END);
  END IF;

  RETURN jsonb_build_object(
    'valor_contrato', m.valor_contrato,
    'executado', m.executado,
    'executado_pct', m.executado_pct,
    'pago', m.pago,
    'por_pagar', m.por_pagar,
    'retencao_acumulada', m.retencao_acumulada,
    'autos_n', m.autos_n,
    'ultimo_auto', m.ultimo_auto,
    'dias_sem_auto', m.dias_sem_auto,
    'atraso_dias_total', m.atraso_dias_total,
    'ocorrencias_abertas', jsonb_build_object('baixa', m.oc_baixa, 'media', m.oc_media, 'alta', m.oc_alta),
    'ocorrencias_total', m.ocorrencias_total,
    'presencas_relatorios', m.presencas_relatorios,
    'prazo', jsonb_build_object('inicio', m.data_inicio, 'fim_previsto', m.data_fim_prevista, 'dias_restantes', m.dias_restantes),
    'saude', m.saude,
    'motivos', to_jsonb(m.motivos),
    'executado_bruto', m.bruto,
    'glosado', m.glosado,
    'taxa_glosa_pct', m.taxa_glosa_pct,
    'em_aprovacao_n', m.em_aprovacao_n,
    'em_aprovacao_valor', m.em_aprovacao_valor,
    'progresso_fisico_pct', m.progresso_fisico_pct,
    'desvio_fisico_financeiro_pp', m.desvio_pp,
    'retencao_libertada', m.retencao_libertada,
    'artigos_sem_eap', m.artigos_sem_eap,
    'ocorrencias_bloqueantes', m.ocorrencias_bloqueantes,
    'docs_estado', m.docs_estado,
    'docs_em_falta', to_jsonb(m.docs_em_falta),
    'bloqueios', to_jsonb(v_bloq),
    'avisos', to_jsonb(v_avisos)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.subs_resumo(p_obra_id uuid DEFAULT NULL)
RETURNS TABLE (
  sub_id uuid, obra_id uuid, obra_nome text, nome text, especialidade text, tipo text, estado text,
  valor_contrato numeric, executado numeric, executado_pct numeric, atraso_dias_total integer, ocorrencias_abertas integer,
  tem_contrato boolean, data_fim_prevista date, saude text, motivos text[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.sub_id, m.obra_id, m.obra_nome, m.nome, m.especialidade, m.tipo, m.estado,
         m.valor_contrato, m.executado, m.executado_pct, m.atraso_dias_total,
         m.oc_baixa + m.oc_media + m.oc_alta, m.tem_contrato, m.data_fim_prevista, m.saude, m.motivos
    FROM public._subs_metricas(p_obra_id, NULL) m
   WHERE m.ativo AND public.pode_ver_obra(m.obra_id)
   ORDER BY m.obra_nome, m.nome
$$;

-- ── 14. Painel do CEO e fluxo de caixa ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.subs_painel_ceo(p_obra_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg  public.subs_config%ROWTYPE := public._subs_cfg();
  v_hoje date := public._hoje_pt();
  v_res  jsonb;
BEGIN
  IF NOT public.pode_ler_obras() THEN
    RAISE EXCEPTION 'Sem permissão para ver o painel das subempreitadas';
  END IF;
  IF p_obra_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.obras WHERE id = p_obra_id) THEN
    RAISE EXCEPTION 'Obra não encontrada';
  END IF;

  WITH m AS (
    SELECT x.* FROM public._subs_metricas(p_obra_id, NULL) x
      JOIN public.obras o ON o.id = x.obra_id
     WHERE x.ativo AND x.estado = 'validado' AND o.ativo
  ),
  au AS (
    SELECT a.subempreiteiro_id AS sid, a.numero, a.workflow, a.estado_pagamento, a.data_vencimento, a.fatura_numero, a.fatura_valor,
           a.valor_periodo - a.valor_glosado AS cert, m.nome, m.obra_id, m.obra_nome
      FROM public.autos_medicao a JOIN m ON m.sub_id = a.subempreiteiro_id
  ),
  al AS (
    SELECT 'DOCS_EM_FALTA' AS tipo, m.sub_id, m.obra_id,
           'Documentos obrigatórios em falta ou expirados (' || array_to_string(m.docs_em_falta, ', ') || ') — ' || m.nome || ' (' || m.obra_nome || ')' AS texto,
           'alta' AS gravidade
      FROM m WHERE cardinality(m.docs_em_falta) > 0
    UNION ALL
    SELECT 'OCORRENCIA_GRAVE', m.sub_id, m.obra_id,
           m.oc_alta || CASE WHEN m.oc_alta = 1 THEN ' ocorrência grave por resolver' ELSE ' ocorrências graves por resolver' END
           || ' — ' || m.nome || ' (' || m.obra_nome || ')', 'alta'
      FROM m WHERE m.oc_alta > 0
    UNION ALL
    SELECT 'PAGAMENTO_VENCIDO', au.sid, au.obra_id,
           'Auto n.º ' || au.numero || ' de ' || au.nome || ' venceu em ' || to_char(au.data_vencimento, 'DD/MM/YYYY') || ' e não está pago', 'alta'
      FROM au WHERE au.workflow = 'validado' AND au.estado_pagamento <> 'pago' AND au.data_vencimento < v_hoje
    UNION ALL
    SELECT 'FATURA_DIVERGE', au.sid, au.obra_id,
           'Auto n.º ' || au.numero || ' de ' || au.nome || ': o valor da fatura (' || public._eur(au.fatura_valor)
           || ') diverge do certificado (' || public._eur(au.cert) || ')', 'media'
      FROM au WHERE au.workflow = 'validado' AND au.estado_pagamento <> 'pago' AND au.fatura_valor IS NOT NULL AND abs(au.fatura_valor - au.cert) > 0.01
    UNION ALL
    SELECT 'DOCS_A_EXPIRAR', m.sub_id, m.obra_id,
           'Documentos a expirar (' || array_to_string(m.docs_a_expirar, ', ') || ') — ' || m.nome || ' (' || m.obra_nome || ')', 'media'
      FROM m WHERE cardinality(m.docs_em_falta) = 0 AND cardinality(m.docs_a_expirar) > 0
    UNION ALL
    SELECT 'DESVIO_FISICO_FINANCEIRO', m.sub_id, m.obra_id,
           'Execução financeira ' || round(m.desvio_pp)::int || ' pp acima do progresso físico — ' || m.nome || ' (' || m.obra_nome || ')', 'media'
      FROM m WHERE m.desvio_pp > 10
    UNION ALL
    SELECT 'FATURA_EM_FALTA', au.sid, au.obra_id,
           'Auto n.º ' || au.numero || ' de ' || au.nome || ': falta guardar a fatura do subempreiteiro', 'baixa'
      FROM au WHERE v_cfg.exigir_fatura_para_pagar AND au.workflow = 'validado' AND au.estado_pagamento <> 'pago' AND au.fatura_numero IS NULL
    UNION ALL
    SELECT 'ARTIGOS_SEM_EAP', m.sub_id, m.obra_id,
           m.artigos_sem_eap || CASE WHEN m.artigos_sem_eap = 1 THEN ' artigo sem ligação ao orçamento (EAP)' ELSE ' artigos sem ligação ao orçamento (EAP)' END
           || ' — ' || m.nome || ' (' || m.obra_nome || ')', 'baixa'
      FROM m WHERE m.artigos_sem_eap > 0
  )
  SELECT jsonb_build_object(
    'totais', (SELECT jsonb_build_object(
        'contratado', COALESCE(sum(m.valor_contrato), 0),
        'orcado_subempreitadas', COALESCE(sum(m.orcado_ligado), 0),
        'certificado', COALESCE(sum(m.executado), 0),
        'pago', COALESCE(sum(m.pago), 0),
        'por_pagar', COALESCE(sum(m.por_pagar), 0),
        'retencao_acumulada', COALESCE(sum(m.retencao_acumulada), 0),
        'retencao_libertada', COALESCE(sum(m.retencao_libertada), 0),
        'em_aprovacao_valor', COALESCE(sum(m.em_aprovacao_valor), 0),
        'em_aprovacao_n', COALESCE(sum(m.em_aprovacao_n), 0),
        'glosado', COALESCE(sum(m.glosado), 0),
        'taxa_glosa_pct', CASE WHEN sum(m.bruto) > 0 THEN round(sum(m.glosado) / sum(m.bruto) * 100, 2) ELSE 0 END)
      FROM m),
    'por_sub', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'sub_id', m.sub_id, 'nome', m.nome, 'obra_id', m.obra_id, 'obra_nome', m.obra_nome,
        'contratado', m.valor_contrato, 'orcado_ligado', m.orcado_ligado, 'certificado', m.executado,
        'executado_pct', m.executado_pct, 'progresso_fisico_pct', m.progresso_fisico_pct, 'desvio_pp', m.desvio_pp,
        'glosado', m.glosado, 'taxa_glosa_pct', m.taxa_glosa_pct, 'ocorrencias_altas', m.oc_alta,
        'ocorrencias_bloqueantes', m.ocorrencias_bloqueantes, 'docs_estado', m.docs_estado,
        'docs_em_falta', to_jsonb(m.docs_em_falta), 'por_pagar', m.por_pagar, 'saude', m.saude)
        ORDER BY m.obra_nome, m.nome) FROM m), '[]'::jsonb),
    'passivo_documental', (SELECT jsonb_build_object(
        'subs_com_pendencia', count(*) FILTER (WHERE m.docs_estado = 'critico'),
        'valor_por_pagar_em_risco', COALESCE(sum(m.por_pagar) FILTER (WHERE m.docs_estado = 'critico'), 0))
      FROM m),
    'alertas', COALESCE((SELECT jsonb_agg(jsonb_build_object('tipo', al.tipo, 'sub_id', al.sub_id, 'obra_id', al.obra_id,
        'texto', al.texto, 'gravidade', al.gravidade)
        ORDER BY CASE al.gravidade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, al.tipo, al.texto) FROM al), '[]'::jsonb)
  ) INTO v_res;
  RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public.subs_fluxo_caixa(p_obra_id uuid DEFAULT NULL, p_semanas integer DEFAULT 12)
RETURNS TABLE (semana_inicio date, aprovado numeric, em_aprovacao numeric, n_autos integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg  public.subs_config%ROWTYPE := public._subs_cfg();
  v_hoje date := public._hoje_pt();
  v_s0   date;
BEGIN
  IF NOT public.pode_ler_obras() THEN
    RAISE EXCEPTION 'Sem permissão para ver o fluxo de caixa das subempreitadas';
  END IF;
  IF p_semanas IS NULL OR p_semanas < 1 OR p_semanas > 52 THEN
    RAISE EXCEPTION 'O número de semanas tem de estar entre 1 e 52';
  END IF;
  IF p_obra_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.obras WHERE id = p_obra_id) THEN
    RAISE EXCEPTION 'Obra não encontrada';
  END IF;
  v_s0 := date_trunc('week', v_hoje::timestamp)::date;

  RETURN QUERY
  WITH sem AS (
    SELECT g AS idx, v_s0 + g * 7 AS ini FROM generate_series(0, p_semanas - 1) g
  ),
  au AS (
    SELECT a.workflow = 'validado' AS ok_aprov,
           (a.valor_periodo - a.valor_glosado) - round((a.valor_periodo - a.valor_glosado) * s.percentagem_retencao / 100, 2) AS liquido,
           CASE WHEN a.workflow = 'validado' THEN COALESCE(a.data_vencimento, v_hoje)
                ELSE v_hoje + v_cfg.prazo_pagamento_dias END AS quando
      FROM public.autos_medicao a
      JOIN public.subempreiteiros s ON s.id = a.subempreiteiro_id
      JOIN public.obras o ON o.id = s.obra_id
     WHERE s.ativo AND s.estado = 'validado' AND o.ativo AND (p_obra_id IS NULL OR s.obra_id = p_obra_id)
       AND ((a.workflow = 'validado' AND a.estado_pagamento <> 'pago') OR a.workflow IN ('submetido', 'verificado'))
  ),
  b AS (
    SELECT greatest(0, (au.quando - v_s0) / 7) AS idx, au.ok_aprov, au.liquido FROM au
  )
  SELECT sem.ini,
         COALESCE(sum(b.liquido) FILTER (WHERE b.ok_aprov), 0)::numeric,
         COALESCE(sum(b.liquido) FILTER (WHERE NOT b.ok_aprov), 0)::numeric,
         count(b.idx)::int
    FROM sem LEFT JOIN b ON b.idx = sem.idx
   GROUP BY sem.idx, sem.ini
   ORDER BY sem.idx;
END;
$$;

-- ── 15. Custos da obra sobre o certificado ──────────────────────────────────
-- A implementação original (_custos_consolidados_por_obra_impl) fica intacta (a produção pode
-- divergir do repositório); a guarda desconta as glosas dos autos validados no mesmo período.
CREATE OR REPLACE FUNCTION public.custos_consolidados_por_obra(
  p_obra_id  uuid,
  p_data_ini date DEFAULT '2000-01-01'::date,
  p_data_fim date DEFAULT CURRENT_DATE
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_j    json;
  v      jsonb;
  v_glos numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sem permissão para consultar custos';
  END IF;
  v_j := public._custos_consolidados_por_obra_impl(p_obra_id, p_data_ini, p_data_fim);
  SELECT COALESCE(sum(am.valor_glosado), 0) INTO v_glos
    FROM public.autos_medicao am
    JOIN public.subempreiteiros s ON s.id = am.subempreiteiro_id
   WHERE s.obra_id = p_obra_id AND am.estado = 'validado' AND am.data_medicao BETWEEN p_data_ini AND p_data_fim;
  IF v_glos = 0 THEN
    RETURN v_j;
  END IF;
  v := v_j::jsonb;
  v := jsonb_set(v, '{subempreiteiros}', to_jsonb((v ->> 'subempreiteiros')::numeric - v_glos));
  v := jsonb_set(v, '{total}', to_jsonb((v ->> 'total')::numeric - v_glos));
  RETURN v::json;
END;
$$;

-- ── 16. RLS, GRANTs e retenção sem escrita direta ───────────────────────────
ALTER TABLE public.auto_verificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_glosas       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auto_verificacoes_select" ON public.auto_verificacoes;
CREATE POLICY "auto_verificacoes_select" ON public.auto_verificacoes
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.autos_medicao a JOIN public.subempreiteiros s ON s.id = a.subempreiteiro_id
             WHERE a.id = auto_id AND public.pode_ver_obra(s.obra_id))
  );

DROP POLICY IF EXISTS "auto_glosas_select" ON public.auto_glosas;
CREATE POLICY "auto_glosas_select" ON public.auto_glosas
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.autos_medicao a JOIN public.subempreiteiros s ON s.id = a.subempreiteiro_id
             WHERE a.id = auto_id AND public.pode_ver_obra(s.obra_id))
  );

REVOKE ALL ON TABLE public.auto_verificacoes, public.auto_glosas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.auto_verificacoes, public.auto_glosas TO authenticated;

-- Libertações só por sub_libertar_retencao (teto e bloqueios); o admin pode corrigir apagando
DROP POLICY IF EXISTS "liberacoes_retencao_insert" ON public.liberacoes_retencao;
DROP POLICY IF EXISTS "liberacoes_retencao_update" ON public.liberacoes_retencao;
DROP POLICY IF EXISTS "liberacoes_retencao_select" ON public.liberacoes_retencao;
CREATE POLICY "liberacoes_retencao_select" ON public.liberacoes_retencao
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.subempreiteiros s WHERE s.id = subempreiteiro_id AND public.pode_ver_obra(s.obra_id))
  );
REVOKE ALL ON TABLE public.liberacoes_retencao FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.liberacoes_retencao FROM authenticated;
GRANT SELECT, DELETE ON TABLE public.liberacoes_retencao TO authenticated;

DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname = ANY (ARRAY[
         'auto_submeter', 'auto_iniciar_verificacao', 'auto_registar_verificacao', 'auto_verificar', 'auto_glosar',
         'auto_levantar_glosa', 'auto_devolver', 'auto_aprovar', 'validar_auto', 'auto_registar_fatura', 'marcar_auto_pago',
         'marcar_auto_em_atraso', 'sub_libertar_retencao', 'auto_guardar_evidencias', 'sub_painel', 'subs_resumo',
         'subs_painel_ceo', 'subs_fluxo_caixa', 'custos_consolidados_por_obra', 'criar_auto_rpc'])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;

  FOR f IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname = ANY (ARRAY['_subs_metricas', '_trg_auto_imutavel', '_trg_auto_linha_imutavel', '_eur', '_auto_evento',
                                  '_sub_oc_bloqueantes', '_auto_recalcular_glosado', '_trg_evento_auto'])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
END $$;
