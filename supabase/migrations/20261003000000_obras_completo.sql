-- ================================================================
-- ENCIVIL — Módulo OBRAS completo (2026-10-03)
-- Desenho: docs/superpowers/specs/2026-10-03-obras-completo-design.md §3
--
--  1. Obras: datas, morada, GPS, responsável/engenheiro, estado planeada|ativa|suspensa|concluida.
--  2. Equipa por obra, fases (progresso ponderado), aferições do engenheiro.
--  3. Relatórios diários (rascunho → submetido imutável; só o admin reabre), autores designados.
--  4. Galeria de fotos + vista unificada obra_fotos_todas.
--  5. Subempreitadas: ficha, contrato anexável, ocorrências, evidências nos autos, painel e resumo.
--  6. Atividade da obra (obra_eventos), painel de obras com semáforo de saúde, cruzamentos
--     com Frota / Ferramentas / Armazém.
--  7. Buckets "obras" (público, fotos) e "obras-contratos" (privado, URL assinada).
--
-- Regras de permissão (a RLS e as RPCs são a segurança real):
--   pode_gerir_obras()   admin, gestor           (criar/editar obra, equipa, autores)
--   pode_medir_obras()   admin, gestor, medicoes (fases, aferições, ocorrências)
--   pode_ler_obras()     admin, gestor, armazem, medicoes, leitura
--   pode_relatar_obra(o) pode_medir_obras() OU autor designado dessa obra
--   pode_ver_obra(o)     pode_ler_obras()  OU autor designado dessa obra
--   (um autor designado nunca é mecanico/motorista, que só vêem o seu módulo)
-- As tabelas novas só têm SELECT; toda a escrita passa por RPC SECURITY DEFINER.
--
-- Convenções:
--   • "hoje" = data em Europe/Lisbon (public._hoje_pt), não a do servidor (UTC).
--   • fotos = [{ "path": "<obra>/<pasta>/<ts>-<rand>.<ext>", "legenda": text|null }].
--   • Presença na obra (obra_equipa_lista.presente_hoje): última picagem de hoje, na obra, não
--     recusada, é ENTRADA ou PAUSA_FIM (voltou da pausa).
--   • Progresso da obra: fases (média ponderada pelo peso) > última aferição com % > execução
--     das subempreitadas validadas (executado / valor do contrato) > nenhum.
--   • Saúde (só obras 'ativa'; as outras são sempre 'ok'):
--       crítico  prazo vencido · atraso ≥ 20 pontos face ao esperado · ocorrência grave aberta
--       atenção  atraso ≥ 8 pontos · iniciada sem relatório submetido há ≥ 3 dias ·
--                custo ≥ 90 % do orçamento · ocorrência aberta
--   • custo_total = custos_consolidados_por_obra(...).total (materiais, combustível, mão de
--     obra, faturas e subempreiteiros).
--   • Subempreitada: executado = autos validados; retenção = % da contratação sobre o executado;
--     pago/por_pagar = valor líquido (sem retenção) dos autos pagos / não pagos;
--     atraso_dias_total = dias das ocorrências + dias dos autos (a saúde só conta o atraso das
--     ocorrências por resolver).
--   • Tipos de evento (obra_eventos.tipo): OBRA_CRIADA, OBRA_EDITADA, OBRA_ESTADO, EQUIPA_ALOCADA,
--     EQUIPA_REMOVIDA, AUTORES_DEFINIDOS, AFERICAO, RELATORIO_SUBMETIDO, RELATORIO_REABERTO,
--     CONTRATO_ANEXADO, CONTRATO_REMOVIDO, SUB_FICHA, SUB_CONTRATADA, SUB_VALIDADA, AUTO_VALIDADO,
--     OCORRENCIA_REGISTADA, OCORRENCIA_RESOLVIDA.
--
-- APLICAR: SQL Editor. Idempotente.
-- ================================================================

-- ── 1. Permissões ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._hoje_pt()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$ SELECT (now() AT TIME ZONE 'Europe/Lisbon')::date $$;

CREATE OR REPLACE FUNCTION public.pode_gerir_obras()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT COALESCE(public.auth_role() IN ('admin', 'gestor'), false) $$;

CREATE OR REPLACE FUNCTION public.pode_medir_obras()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT COALESCE(public.auth_role() IN ('admin', 'gestor', 'medicoes'), false) $$;

CREATE OR REPLACE FUNCTION public.pode_ler_obras()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT COALESCE(public.auth_role() IN ('admin', 'gestor', 'armazem', 'medicoes', 'leitura'), false) $$;

CREATE TABLE IF NOT EXISTS public.obra_autores (
  obra_id        uuid        NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  adicionado_por uuid        REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  criado_em      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (obra_id, user_id)
);

CREATE OR REPLACE FUNCTION public._autor_designado(p_obra_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    auth.uid() IS NOT NULL
    AND public.auth_role() NOT IN ('', 'mecanico', 'motorista')
    AND EXISTS (SELECT 1 FROM public.obra_autores a WHERE a.obra_id = p_obra_id AND a.user_id = auth.uid()),
    false)
$$;

CREATE OR REPLACE FUNCTION public.pode_relatar_obra(p_obra_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.pode_medir_obras() OR public._autor_designado(p_obra_id) $$;

CREATE OR REPLACE FUNCTION public.pode_ver_obra(p_obra_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.pode_ler_obras() OR public._autor_designado(p_obra_id) $$;

-- A política antiga deixava qualquer autenticado ler obras, incluindo os papéis
-- isolados de Frota e Abastecimento. A leitura acompanha o contrato deste módulo.
DROP POLICY IF EXISTS "obras_select_auth" ON public.obras;
DROP POLICY IF EXISTS "obras_select_modulo" ON public.obras;
CREATE POLICY "obras_select_modulo" ON public.obras
  FOR SELECT TO authenticated USING (public.pode_ver_obra(id));

DROP POLICY IF EXISTS "subempreiteiros_select_auth" ON public.subempreiteiros;
DROP POLICY IF EXISTS "subempreiteiros_select_modulo" ON public.subempreiteiros;
CREATE POLICY "subempreiteiros_select_modulo" ON public.subempreiteiros
  FOR SELECT TO authenticated USING (public.pode_ver_obra(obra_id));

DROP POLICY IF EXISTS "artigos_select_auth" ON public.subempreiteiro_artigos;
DROP POLICY IF EXISTS "artigos_select_modulo" ON public.subempreiteiro_artigos;
CREATE POLICY "artigos_select_modulo" ON public.subempreiteiro_artigos
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.subempreiteiros s WHERE s.id = subempreiteiro_id)
  );

DROP POLICY IF EXISTS "autos_select_auth" ON public.autos_medicao;
DROP POLICY IF EXISTS "autos_select_modulo" ON public.autos_medicao;
CREATE POLICY "autos_select_modulo" ON public.autos_medicao
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.subempreiteiros s WHERE s.id = subempreiteiro_id)
  );

DROP POLICY IF EXISTS "auto_linhas_select_auth" ON public.auto_linhas;
DROP POLICY IF EXISTS "auto_linhas_select_modulo" ON public.auto_linhas;
CREATE POLICY "auto_linhas_select_modulo" ON public.auto_linhas
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.autos_medicao a WHERE a.id = auto_id)
  );

-- Clima aceite nos relatórios, aferições e autos
CREATE OR REPLACE FUNCTION public._clima_ok(p_clima text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_clima IS NULL OR p_clima IN
    ('SOL', 'NUBLADO', 'CHUVA_FRACA', 'CHUVA_FORTE', 'VENTO', 'NEVOEIRO', 'CALOR_EXTREMO', 'FRIO', 'TEMPESTADE')
$$;

-- Forma mínima do array de fotos (a validação dos caminhos faz-se nas RPCs)
CREATE OR REPLACE FUNCTION public._fotos_forma_ok(p_fotos jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT jsonb_typeof(p_fotos) = 'array' AND jsonb_array_length(p_fotos) <= 60 $$;

-- ── 2. Obras ─────────────────────────────────────────────────────────────────
ALTER TABLE public.obras
  ADD COLUMN IF NOT EXISTS data_inicio       date,
  ADD COLUMN IF NOT EXISTS data_prevista_fim date,
  ADD COLUMN IF NOT EXISTS data_fim_real     date,
  ADD COLUMN IF NOT EXISTS morada            text,
  ADD COLUMN IF NOT EXISTS latitude          numeric(9,6),
  ADD COLUMN IF NOT EXISTS longitude         numeric(9,6),
  ADD COLUMN IF NOT EXISTS responsavel_id    uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS engenheiro_id     uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tipo_obra         text,
  ADD COLUMN IF NOT EXISTS descricao         text;

ALTER TABLE public.obras DROP CONSTRAINT IF EXISTS ck_obra_estado;
ALTER TABLE public.obras ADD CONSTRAINT ck_obra_estado
  CHECK (estado IN ('planeada', 'ativa', 'suspensa', 'concluida'));
ALTER TABLE public.obras DROP CONSTRAINT IF EXISTS ck_obra_datas;
ALTER TABLE public.obras ADD CONSTRAINT ck_obra_datas
  CHECK (data_inicio IS NULL OR data_prevista_fim IS NULL OR data_prevista_fim >= data_inicio);
ALTER TABLE public.obras DROP CONSTRAINT IF EXISTS ck_obra_coordenadas;
ALTER TABLE public.obras ADD CONSTRAINT ck_obra_coordenadas
  CHECK ((latitude IS NULL) = (longitude IS NULL)
         AND (latitude  IS NULL OR latitude  BETWEEN -90  AND 90)
         AND (longitude IS NULL OR longitude BETWEEN -180 AND 180));

CREATE INDEX IF NOT EXISTS idx_obras_responsavel ON public.obras (responsavel_id) WHERE responsavel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_obras_engenheiro  ON public.obras (engenheiro_id)  WHERE engenheiro_id  IS NOT NULL;

-- ── 3. Atividade da obra ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.obra_eventos (
  id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id   uuid        NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  tipo      text        NOT NULL,
  titulo    text        NOT NULL,
  detalhe   text,
  autor_id  uuid        REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_obra_eventos_obra ON public.obra_eventos (obra_id, criado_em DESC);

CREATE OR REPLACE FUNCTION public._obra_evento(p_obra_id uuid, p_tipo text, p_titulo text, p_detalhe text DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.obra_eventos (obra_id, tipo, titulo, detalhe)
  VALUES (p_obra_id, p_tipo, p_titulo, NULLIF(btrim(p_detalhe), ''))
$$;

-- ── 4. Equipa ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.obra_equipa (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id        uuid        NOT NULL REFERENCES public.obras(id),
  colaborador_id uuid        NOT NULL REFERENCES public.colaboradores(id),
  funcao         text,
  desde          date        NOT NULL DEFAULT CURRENT_DATE,
  ate            date,
  criado_por     uuid        REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  criado_em      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_obra_equipa_datas  CHECK (ate IS NULL OR ate >= desde),
  CONSTRAINT ck_obra_equipa_funcao CHECK (funcao IS NULL OR length(funcao) <= 100)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_obra_equipa_ativa ON public.obra_equipa (obra_id, colaborador_id) WHERE ate IS NULL;
CREATE INDEX IF NOT EXISTS idx_obra_equipa_colab ON public.obra_equipa (colaborador_id);

-- ── 5. Progresso: fases e aferições ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.obra_fases (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id            uuid        NOT NULL REFERENCES public.obras(id),
  nome               text        NOT NULL,
  peso               numeric     NOT NULL DEFAULT 1,
  progresso          numeric     NOT NULL DEFAULT 0,
  data_inicio        date,
  data_fim_prevista  date,
  estado             text        NOT NULL DEFAULT 'pendente',
  ordem              integer     NOT NULL DEFAULT 0,
  notas              text,
  atualizado_por     uuid        REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  atualizado_em      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_obra_fase_nome     CHECK (length(btrim(nome)) BETWEEN 1 AND 200),
  CONSTRAINT ck_obra_fase_peso     CHECK (peso > 0 AND peso <= 100000),
  CONSTRAINT ck_obra_fase_progresso CHECK (progresso BETWEEN 0 AND 100),
  CONSTRAINT ck_obra_fase_estado   CHECK (estado IN ('pendente', 'em_curso', 'concluida')),
  CONSTRAINT ck_obra_fase_datas    CHECK (data_inicio IS NULL OR data_fim_prevista IS NULL OR data_fim_prevista >= data_inicio)
);
CREATE INDEX IF NOT EXISTS idx_obra_fases_obra ON public.obra_fases (obra_id, ordem);

CREATE TABLE IF NOT EXISTS public.obra_afericoes (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id        uuid        NOT NULL REFERENCES public.obras(id),
  data           date        NOT NULL,
  progresso_pct  numeric,
  resumo         text        NOT NULL,
  problemas      text,
  atrasos_dias   integer     NOT NULL DEFAULT 0,
  atraso_motivo  text,
  clima          text,
  clima_descricao text,
  fotos          jsonb       NOT NULL DEFAULT '[]',
  autor_id       uuid        REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  criado_em      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_obra_afericao_pct    CHECK (progresso_pct IS NULL OR progresso_pct BETWEEN 0 AND 100),
  CONSTRAINT ck_obra_afericao_atraso CHECK (atrasos_dias BETWEEN 0 AND 3650),
  CONSTRAINT ck_obra_afericao_clima  CHECK (public._clima_ok(clima)),
  CONSTRAINT ck_obra_afericao_fotos  CHECK (public._fotos_forma_ok(fotos))
);
CREATE INDEX IF NOT EXISTS idx_obra_afericoes_obra ON public.obra_afericoes (obra_id, data DESC, criado_em DESC);

-- ── 6. Relatórios diários ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.obra_relatorios_diarios (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id             uuid        NOT NULL REFERENCES public.obras(id),
  data                date        NOT NULL,
  estado              text        NOT NULL DEFAULT 'rascunho',
  clima               text,
  temperatura_c       numeric,
  clima_descricao     text,
  equipa_ids          uuid[]      NOT NULL DEFAULT '{}',
  equipa_outros       text,
  subempreiteiros_ids uuid[]      NOT NULL DEFAULT '{}',
  trabalhos           text,
  houve_ocorrencias   boolean     NOT NULL DEFAULT false,
  ocorrencias         text,
  observacoes         text,
  fotos               jsonb       NOT NULL DEFAULT '[]',
  autor_id            uuid        REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now(),
  submetido_em        timestamptz,
  submetido_por       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reaberto_em         timestamptz,
  reaberto_por        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reaberto_motivo     text,
  CONSTRAINT ck_obra_rel_estado CHECK (estado IN ('rascunho', 'submetido')),
  CONSTRAINT ck_obra_rel_clima  CHECK (public._clima_ok(clima)),
  CONSTRAINT ck_obra_rel_temp   CHECK (temperatura_c IS NULL OR temperatura_c BETWEEN -50 AND 60),
  CONSTRAINT ck_obra_rel_fotos  CHECK (public._fotos_forma_ok(fotos))
);
CREATE INDEX IF NOT EXISTS idx_obra_rel_obra_data ON public.obra_relatorios_diarios (obra_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_obra_rel_estado    ON public.obra_relatorios_diarios (estado, data DESC);

-- ── 7. Fotos ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.obra_fotos (
  id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id   uuid        NOT NULL REFERENCES public.obras(id),
  path      text        NOT NULL,
  legenda   text,
  tirada_em date        NOT NULL DEFAULT CURRENT_DATE,
  autor_id  uuid        REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_obra_foto_legenda CHECK (legenda IS NULL OR length(legenda) <= 300),
  CONSTRAINT ux_obra_foto_path UNIQUE (obra_id, path)
);
CREATE INDEX IF NOT EXISTS idx_obra_fotos_obra ON public.obra_fotos (obra_id, tirada_em DESC);

-- ── 8. Subempreitadas ────────────────────────────────────────────────────────
ALTER TABLE public.subempreiteiros
  ADD COLUMN IF NOT EXISTS nif                 text,
  ADD COLUMN IF NOT EXISTS telefone            text,
  ADD COLUMN IF NOT EXISTS email               text,
  ADD COLUMN IF NOT EXISTS especialidade       text,
  ADD COLUMN IF NOT EXISTS data_inicio         date,
  ADD COLUMN IF NOT EXISTS data_fim_prevista   date,
  ADD COLUMN IF NOT EXISTS contrato_path       text,
  ADD COLUMN IF NOT EXISTS contrato_nome       text,
  ADD COLUMN IF NOT EXISTS contrato_enviado_em timestamptz;

ALTER TABLE public.subempreiteiros DROP CONSTRAINT IF EXISTS ck_sub_datas;
ALTER TABLE public.subempreiteiros ADD CONSTRAINT ck_sub_datas
  CHECK (data_inicio IS NULL OR data_fim_prevista IS NULL OR data_fim_prevista >= data_inicio);
ALTER TABLE public.subempreiteiros DROP CONSTRAINT IF EXISTS ck_sub_contrato_path;
ALTER TABLE public.subempreiteiros ADD CONSTRAINT ck_sub_contrato_path
  CHECK (contrato_path IS NULL OR contrato_path ~ ('^' || id::text || '/contrato-[0-9]{1,16}\.(pdf|jpg|jpeg|png|webp|heic|heif)$'));

CREATE TABLE IF NOT EXISTS public.sub_ocorrencias (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subempreiteiro_id uuid        NOT NULL REFERENCES public.subempreiteiros(id),
  obra_id           uuid        NOT NULL REFERENCES public.obras(id),
  tipo              text        NOT NULL,
  gravidade         text        NOT NULL DEFAULT 'baixa',
  data              date        NOT NULL,
  descricao         text        NOT NULL,
  dias_atraso       integer     NOT NULL DEFAULT 0,
  fotos             jsonb       NOT NULL DEFAULT '[]',
  resolvido         boolean     NOT NULL DEFAULT false,
  resolvido_em      timestamptz,
  resolvido_por     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  resolucao         text,
  autor_id          uuid        REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  criado_em         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_sub_oc_tipo      CHECK (tipo IN ('ATRASO', 'PROBLEMA', 'CLIMA', 'QUALIDADE', 'SEGURANCA', 'NOTA')),
  CONSTRAINT ck_sub_oc_gravidade CHECK (gravidade IN ('baixa', 'media', 'alta')),
  CONSTRAINT ck_sub_oc_dias      CHECK (dias_atraso BETWEEN 0 AND 3650),
  CONSTRAINT ck_sub_oc_fotos     CHECK (public._fotos_forma_ok(fotos))
);
CREATE INDEX IF NOT EXISTS idx_sub_oc_sub  ON public.sub_ocorrencias (subempreiteiro_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_sub_oc_obra ON public.sub_ocorrencias (obra_id) WHERE NOT resolvido;

ALTER TABLE public.autos_medicao
  ADD COLUMN IF NOT EXISTS fotos                jsonb        NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS anotacoes            text,
  ADD COLUMN IF NOT EXISTS problemas            text,
  ADD COLUMN IF NOT EXISTS atraso_dias          integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clima                text,
  ADD COLUMN IF NOT EXISTS clima_descricao      text,
  ADD COLUMN IF NOT EXISTS progresso_fisico_pct numeric(5,2);

ALTER TABLE public.autos_medicao DROP CONSTRAINT IF EXISTS ck_auto_fotos;
ALTER TABLE public.autos_medicao ADD CONSTRAINT ck_auto_fotos CHECK (public._fotos_forma_ok(fotos));
ALTER TABLE public.autos_medicao DROP CONSTRAINT IF EXISTS ck_auto_atraso;
ALTER TABLE public.autos_medicao ADD CONSTRAINT ck_auto_atraso CHECK (atraso_dias BETWEEN 0 AND 3650);
ALTER TABLE public.autos_medicao DROP CONSTRAINT IF EXISTS ck_auto_clima;
ALTER TABLE public.autos_medicao ADD CONSTRAINT ck_auto_clima CHECK (public._clima_ok(clima));
ALTER TABLE public.autos_medicao DROP CONSTRAINT IF EXISTS ck_auto_progresso_fisico;
ALTER TABLE public.autos_medicao ADD CONSTRAINT ck_auto_progresso_fisico
  CHECK (progresso_fisico_pct IS NULL OR progresso_fisico_pct BETWEEN 0 AND 100);

-- As tabelas já tinham INSERT/UPDATE ao nível da tabela. Sem revogar esses
-- privilégios, as colunas novas contornariam as RPCs, validações e eventos.
-- Mantemos escrita direta apenas nas colunas legadas usadas pelos fluxos antigos.
REVOKE INSERT, UPDATE ON TABLE public.obras, public.subempreiteiros, public.autos_medicao FROM authenticated;
GRANT INSERT (nome, cliente, localizacao, estado, observacoes, ativo, created_by,
              orcamento, geofence_tipo, geofence_centro, geofence_raio_m, geofence_poligono,
              orcamento_materiais, orcamento_mao_obra, orcamento_combustivel,
              orcamento_fornecedores, orcamento_subempreiteiros)
  ON public.obras TO authenticated;
GRANT UPDATE (nome, cliente, localizacao, estado, observacoes, ativo,
              orcamento, geofence_tipo, geofence_centro, geofence_raio_m, geofence_poligono,
              orcamento_materiais, orcamento_mao_obra, orcamento_combustivel,
              orcamento_fornecedores, orcamento_subempreiteiros)
  ON public.obras TO authenticated;
GRANT INSERT (obra_id, nome, contacto_responsavel, tipo, valor_global, condicoes,
              estado, created_by, percentagem_retencao, ativo)
  ON public.subempreiteiros TO authenticated;
GRANT UPDATE (obra_id, nome, contacto_responsavel, tipo, valor_global, condicoes,
              estado, percentagem_retencao, ativo)
  ON public.subempreiteiros TO authenticated;
GRANT INSERT (subempreiteiro_id, numero, data_medicao, percentagem_periodo, valor_periodo,
              observacoes, estado, created_by, estado_pagamento, data_pagamento, referencia_pagamento)
  ON public.autos_medicao TO authenticated;
GRANT UPDATE (data_medicao, percentagem_periodo, valor_periodo, observacoes,
              estado, estado_pagamento, data_pagamento, referencia_pagamento)
  ON public.autos_medicao TO authenticated;

-- ── 9. RLS e GRANTs das tabelas novas (só leitura; a escrita é por RPC) ─────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['obra_autores', 'obra_eventos', 'obra_equipa', 'obra_fases', 'obra_afericoes',
                           'obra_relatorios_diarios', 'obra_fotos', 'sub_ocorrencias']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.pode_ver_obra(obra_id))',
                   t || '_select', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', t);
  END LOOP;
END $$;

-- ── 10. Fotos: validação e RPCs ──────────────────────────────────────────────
-- Valida o array e devolve-o normalizado ([{path, legenda}]); os caminhos têm de ser da obra
CREATE OR REPLACE FUNCTION public._obra_fotos_validar(p_obra_id uuid, p_fotos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_out  jsonb := '[]'::jsonb;
  v_path text;
  v_leg  text;
BEGIN
  IF p_fotos IS NULL OR p_fotos = 'null'::jsonb THEN
    RETURN '[]'::jsonb;
  END IF;
  IF jsonb_typeof(p_fotos) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'As fotos têm de ser uma lista';
  END IF;
  IF jsonb_array_length(p_fotos) > 30 THEN
    RAISE EXCEPTION 'No máximo 30 fotos de cada vez';
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_fotos) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' OR jsonb_typeof(v_item -> 'path') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Foto inválida';
    END IF;
    v_path := v_item ->> 'path';
    IF v_path !~ ('^' || p_obra_id::text || '/(galeria|relatorios|afericoes|subempreitadas|autos)/[0-9]{1,16}-[a-z0-9]{1,12}\.(jpg|jpeg|png|webp|heic|heif)$') THEN
      RAISE EXCEPTION 'Foto inválida: o ficheiro não pertence a esta obra';
    END IF;
    v_leg := NULLIF(btrim(v_item ->> 'legenda'), '');
    IF length(v_leg) > 300 THEN
      RAISE EXCEPTION 'A legenda da foto é demasiado longa (máximo 300 caracteres)';
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object('path', v_path, 'legenda', v_leg));
  END LOOP;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.obra_adicionar_fotos(p_obra_id uuid, p_fotos jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fotos jsonb;
  v_n     integer;
BEGIN
  IF NOT public.pode_relatar_obra(p_obra_id) THEN
    RAISE EXCEPTION 'Sem permissão para adicionar fotos a esta obra';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.obras WHERE id = p_obra_id AND ativo) THEN
    RAISE EXCEPTION 'Obra não encontrada';
  END IF;
  v_fotos := public._obra_fotos_validar(p_obra_id, p_fotos);
  IF jsonb_array_length(v_fotos) = 0 THEN
    RAISE EXCEPTION 'Escolha pelo menos uma foto';
  END IF;

  INSERT INTO public.obra_fotos (obra_id, path, legenda, tirada_em, autor_id)
  SELECT p_obra_id, f ->> 'path', f ->> 'legenda', public._hoje_pt(), auth.uid()
    FROM jsonb_array_elements(v_fotos) f
  ON CONFLICT (obra_id, path) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.obra_apagar_foto(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_f public.obra_fotos%ROWTYPE;
BEGIN
  SELECT * INTO v_f FROM public.obra_fotos WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Foto não encontrada';
  END IF;
  IF NOT (public.pode_gerir_obras() OR (v_f.autor_id = auth.uid() AND public.pode_relatar_obra(v_f.obra_id))) THEN
    RAISE EXCEPTION 'Só quem enviou a foto, o gestor ou o administrador a pode apagar';
  END IF;
  DELETE FROM public.obra_fotos WHERE id = p_id;
END;
$$;

-- Galeria unificada (a segurança: só devolve linhas das obras que o utilizador pode ver)
CREATE OR REPLACE VIEW public.obra_fotos_todas WITH (security_invoker = true) AS
SELECT t.*
  FROM (
    SELECT f.obra_id, f.path, f.legenda, f.tirada_em AS data, 'GALERIA'::text AS origem, f.id AS ref_id, f.autor_id
      FROM public.obra_fotos f
    UNION ALL
    SELECT r.obra_id, x ->> 'path', x ->> 'legenda', r.data, 'RELATORIO', r.id, r.autor_id
      FROM public.obra_relatorios_diarios r, jsonb_array_elements(r.fotos) x
     WHERE r.estado = 'submetido'
    UNION ALL
    SELECT a.obra_id, x ->> 'path', x ->> 'legenda', a.data, 'AFERICAO', a.id, a.autor_id
      FROM public.obra_afericoes a, jsonb_array_elements(a.fotos) x
    UNION ALL
    SELECT o.obra_id, x ->> 'path', x ->> 'legenda', o.data, 'SUBEMPREITADA', o.id, o.autor_id
      FROM public.sub_ocorrencias o, jsonb_array_elements(o.fotos) x
    UNION ALL
    SELECT s.obra_id, x ->> 'path', x ->> 'legenda', am.data_medicao, 'AUTO', am.id, am.created_by
      FROM public.autos_medicao am
      JOIN public.subempreiteiros s ON s.id = am.subempreiteiro_id, jsonb_array_elements(am.fotos) x
  ) t
 WHERE public.pode_ver_obra(t.obra_id);

REVOKE ALL ON public.obra_fotos_todas FROM anon;
GRANT SELECT ON public.obra_fotos_todas TO authenticated;

-- ── 11. Obras: guardar ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.obra_guardar(
  p_id                uuid    DEFAULT NULL,
  p_nome              text    DEFAULT NULL,
  p_cliente           text    DEFAULT NULL,
  p_morada            text    DEFAULT NULL,
  p_localizacao       text    DEFAULT NULL,
  p_latitude          numeric DEFAULT NULL,
  p_longitude         numeric DEFAULT NULL,
  p_estado            text    DEFAULT NULL,
  p_data_inicio       date    DEFAULT NULL,
  p_data_prevista_fim date    DEFAULT NULL,
  p_orcamento         numeric DEFAULT NULL,
  p_responsavel_id    uuid    DEFAULT NULL,
  p_engenheiro_id     uuid    DEFAULT NULL,
  p_tipo_obra         text    DEFAULT NULL,
  p_descricao         text    DEFAULT NULL,
  p_observacoes       text    DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old    public.obras%ROWTYPE;
  v_new    public.obras%ROWTYPE;
  v_nome   text := NULLIF(btrim(p_nome), '');
  v_estado text;
  v_fim    date;
BEGIN
  IF NOT public.pode_gerir_obras() THEN
    RAISE EXCEPTION 'Sem permissão para criar ou editar obras';
  END IF;
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Indique o nome da obra';
  END IF;
  IF length(v_nome) > 200 THEN
    RAISE EXCEPTION 'O nome da obra é demasiado longo (máximo 200 caracteres)';
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.obras WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Obra não encontrada';
    END IF;
  END IF;

  v_estado := COALESCE(NULLIF(btrim(p_estado), ''), v_old.estado, 'ativa');
  IF v_estado NOT IN ('planeada', 'ativa', 'suspensa', 'concluida') THEN
    RAISE EXCEPTION 'Estado inválido: use planeada, ativa, suspensa ou concluída';
  END IF;
  IF p_data_inicio IS NOT NULL AND p_data_prevista_fim IS NOT NULL AND p_data_prevista_fim < p_data_inicio THEN
    RAISE EXCEPTION 'A data prevista de fim não pode ser anterior à data de início';
  END IF;
  IF (p_latitude IS NULL) <> (p_longitude IS NULL) THEN
    RAISE EXCEPTION 'Indique a latitude e a longitude (ou nenhuma delas)';
  END IF;
  IF p_latitude NOT BETWEEN -90 AND 90 THEN
    RAISE EXCEPTION 'Latitude inválida (entre -90 e 90)';
  END IF;
  IF p_longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Longitude inválida (entre -180 e 180)';
  END IF;
  IF p_orcamento IS NOT NULL AND (p_orcamento < 0 OR p_orcamento >= 1e12) THEN
    RAISE EXCEPTION 'Orçamento inválido';
  END IF;
  IF length(p_tipo_obra) > 100 THEN
    RAISE EXCEPTION 'O tipo de obra é demasiado longo (máximo 100 caracteres)';
  END IF;
  IF length(p_descricao) > 5000 OR length(p_observacoes) > 5000 THEN
    RAISE EXCEPTION 'Texto demasiado longo (máximo 5000 caracteres)';
  END IF;
  IF p_responsavel_id IS NOT NULL AND p_responsavel_id IS DISTINCT FROM v_old.responsavel_id
     AND NOT EXISTS (SELECT 1 FROM public.colaboradores WHERE id = p_responsavel_id AND ativo) THEN
    RAISE EXCEPTION 'Responsável inválido: escolha um colaborador ativo';
  END IF;
  IF p_engenheiro_id IS NOT NULL AND p_engenheiro_id IS DISTINCT FROM v_old.engenheiro_id
     AND NOT EXISTS (SELECT 1 FROM public.colaboradores WHERE id = p_engenheiro_id AND ativo) THEN
    RAISE EXCEPTION 'Engenheiro inválido: escolha um colaborador ativo';
  END IF;

  v_fim := CASE WHEN v_estado = 'concluida' THEN COALESCE(v_old.data_fim_real, public._hoje_pt()) END;

  IF p_id IS NULL THEN
    INSERT INTO public.obras
      (nome, cliente, morada, localizacao, latitude, longitude, estado, data_inicio, data_prevista_fim, data_fim_real,
       orcamento, responsavel_id, engenheiro_id, tipo_obra, descricao, observacoes)
    VALUES
      (v_nome, NULLIF(btrim(p_cliente), ''), NULLIF(btrim(p_morada), ''), NULLIF(btrim(p_localizacao), ''),
       p_latitude, p_longitude, v_estado, p_data_inicio, p_data_prevista_fim, v_fim,
       p_orcamento, p_responsavel_id, p_engenheiro_id, NULLIF(btrim(p_tipo_obra), ''),
       NULLIF(btrim(p_descricao), ''), NULLIF(btrim(p_observacoes), ''))
    RETURNING * INTO v_new;
    PERFORM public._obra_evento(v_new.id, 'OBRA_CRIADA', 'Obra criada: ' || v_new.nome, 'Estado: ' || v_new.estado);
  ELSE
    UPDATE public.obras SET
      nome = v_nome, cliente = NULLIF(btrim(p_cliente), ''), morada = NULLIF(btrim(p_morada), ''),
      localizacao = NULLIF(btrim(p_localizacao), ''), latitude = p_latitude, longitude = p_longitude,
      estado = v_estado, data_inicio = p_data_inicio, data_prevista_fim = p_data_prevista_fim, data_fim_real = v_fim,
      orcamento = p_orcamento, responsavel_id = p_responsavel_id, engenheiro_id = p_engenheiro_id,
      tipo_obra = NULLIF(btrim(p_tipo_obra), ''), descricao = NULLIF(btrim(p_descricao), ''),
      observacoes = NULLIF(btrim(p_observacoes), '')
    WHERE id = p_id
    RETURNING * INTO v_new;

    IF v_old.estado IS DISTINCT FROM v_new.estado THEN
      PERFORM public._obra_evento(v_new.id, 'OBRA_ESTADO', 'Estado da obra alterado', v_old.estado || ' → ' || v_new.estado);
    END IF;
    IF (v_old.nome, v_old.cliente, v_old.morada, v_old.localizacao, v_old.latitude, v_old.longitude, v_old.data_inicio,
        v_old.data_prevista_fim, v_old.orcamento, v_old.responsavel_id, v_old.engenheiro_id, v_old.tipo_obra,
        v_old.descricao, v_old.observacoes)
       IS DISTINCT FROM
       (v_new.nome, v_new.cliente, v_new.morada, v_new.localizacao, v_new.latitude, v_new.longitude, v_new.data_inicio,
        v_new.data_prevista_fim, v_new.orcamento, v_new.responsavel_id, v_new.engenheiro_id, v_new.tipo_obra,
        v_new.descricao, v_new.observacoes) THEN
      PERFORM public._obra_evento(v_new.id, 'OBRA_EDITADA', 'Dados da obra atualizados', NULL);
    END IF;
  END IF;
  RETURN v_new.id;
END;
$$;

-- ── 12. Equipa ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.obra_alocar_colaborador(
  p_obra_id        uuid,
  p_colaborador_id uuid,
  p_funcao         text DEFAULT NULL,
  p_desde          date DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_obra   public.obras%ROWTYPE;
  v_colab  public.colaboradores%ROWTYPE;
  v_funcao text := NULLIF(btrim(p_funcao), '');
  v_id     uuid;
BEGIN
  IF NOT public.pode_gerir_obras() THEN
    RAISE EXCEPTION 'Sem permissão para gerir a equipa da obra';
  END IF;
  SELECT * INTO v_obra FROM public.obras WHERE id = p_obra_id AND ativo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Obra não encontrada';
  END IF;
  IF v_obra.estado = 'concluida' THEN
    RAISE EXCEPTION 'A obra "%" está concluída', v_obra.nome;
  END IF;
  SELECT * INTO v_colab FROM public.colaboradores WHERE id = p_colaborador_id AND ativo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Escolha um colaborador ativo';
  END IF;
  IF length(v_funcao) > 100 THEN
    RAISE EXCEPTION 'A função é demasiado longa (máximo 100 caracteres)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.obra_equipa WHERE obra_id = p_obra_id AND colaborador_id = p_colaborador_id AND ate IS NULL) THEN
    RAISE EXCEPTION '% já está na equipa desta obra', v_colab.nome;
  END IF;

  BEGIN
    INSERT INTO public.obra_equipa (obra_id, colaborador_id, funcao, desde)
    VALUES (p_obra_id, p_colaborador_id, v_funcao, COALESCE(p_desde, public._hoje_pt()))
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION '% já está na equipa desta obra', v_colab.nome;
  END;

  PERFORM public._obra_evento(p_obra_id, 'EQUIPA_ALOCADA', v_colab.nome || ' juntou-se à equipa', v_funcao);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.obra_remover_colaborador(p_alocacao_id uuid, p_ate date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a   public.obra_equipa%ROWTYPE;
  v_ate date := COALESCE(p_ate, public._hoje_pt());
  v_nome text;
BEGIN
  IF NOT public.pode_gerir_obras() THEN
    RAISE EXCEPTION 'Sem permissão para gerir a equipa da obra';
  END IF;
  SELECT * INTO v_a FROM public.obra_equipa WHERE id = p_alocacao_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alocação não encontrada';
  END IF;
  IF v_a.ate IS NOT NULL THEN
    RAISE EXCEPTION 'Este colaborador já saiu da equipa';
  END IF;
  IF v_ate > public._hoje_pt() THEN
    RAISE EXCEPTION 'A data de saída não pode ser futura';
  END IF;
  IF v_ate < v_a.desde THEN
    RAISE EXCEPTION 'A saída não pode ser anterior à entrada (%)', to_char(v_a.desde, 'DD/MM/YYYY');
  END IF;
  UPDATE public.obra_equipa SET ate = v_ate WHERE id = p_alocacao_id;
  SELECT nome INTO v_nome FROM public.colaboradores WHERE id = v_a.colaborador_id;
  PERFORM public._obra_evento(v_a.obra_id, 'EQUIPA_REMOVIDA', v_nome || ' saiu da equipa', 'Até ' || to_char(v_ate, 'DD/MM/YYYY'));
END;
$$;

CREATE OR REPLACE FUNCTION public.obra_equipa_lista(p_obra_id uuid)
RETURNS TABLE (
  alocacao_id uuid, colaborador_id uuid, nome text, funcao text, desde date, ate date,
  ativo boolean, ultima_picagem timestamptz, presente_hoje boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.colaborador_id, c.nome, e.funcao, e.desde, e.ate, (e.ate IS NULL),
         ult.ts,
         COALESCE(e.ate IS NULL AND hj.presente, false)
    FROM public.obra_equipa e
    JOIN public.colaboradores c ON c.id = e.colaborador_id
    LEFT JOIN LATERAL (
      SELECT max(COALESCE(p.hora_final_validada, p.timestamp_dispositivo)) AS ts
        FROM public.picagens p
       WHERE p.colaborador_id = e.colaborador_id AND p.obra_id = e.obra_id AND p.resultado <> 'RECUSADA'
    ) ult ON true
    LEFT JOIN LATERAL (
      SELECT p.tipo IN ('ENTRADA', 'PAUSA_FIM') AS presente
        FROM public.picagens p
       WHERE p.colaborador_id = e.colaborador_id AND p.obra_id = e.obra_id AND p.resultado <> 'RECUSADA'
         AND (COALESCE(p.hora_final_validada, p.timestamp_dispositivo) AT TIME ZONE 'Europe/Lisbon')::date = public._hoje_pt()
       ORDER BY COALESCE(p.hora_final_validada, p.timestamp_dispositivo) DESC
       LIMIT 1
    ) hj ON true
   WHERE e.obra_id = p_obra_id AND public.pode_ver_obra(p_obra_id)
   ORDER BY (e.ate IS NULL) DESC, c.nome, e.desde DESC
$$;

-- ── 13. Fases e aferições ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.obra_guardar_fase(
  p_id                uuid    DEFAULT NULL,
  p_obra_id           uuid    DEFAULT NULL,
  p_nome              text    DEFAULT NULL,
  p_peso              numeric DEFAULT 1,
  p_progresso         numeric DEFAULT 0,
  p_data_inicio       date    DEFAULT NULL,
  p_data_fim_prevista date    DEFAULT NULL,
  p_notas             text    DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fase   public.obra_fases%ROWTYPE;
  v_obra   uuid := p_obra_id;
  v_nome   text := NULLIF(btrim(p_nome), '');
  v_peso   numeric := COALESCE(p_peso, 1);
  v_prog   numeric := COALESCE(p_progresso, 0);
  v_estado text;
  v_id     uuid;
BEGIN
  IF NOT public.pode_medir_obras() THEN
    RAISE EXCEPTION 'Sem permissão para alterar o progresso da obra';
  END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_fase FROM public.obra_fases WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Fase não encontrada';
    END IF;
    IF v_obra IS NOT NULL AND v_obra <> v_fase.obra_id THEN
      RAISE EXCEPTION 'Não pode mudar uma fase de obra';
    END IF;
    v_obra := v_fase.obra_id;
  ELSIF NOT EXISTS (SELECT 1 FROM public.obras WHERE id = v_obra AND ativo) THEN
    RAISE EXCEPTION 'Obra não encontrada';
  END IF;
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Indique o nome da fase';
  END IF;
  IF length(v_nome) > 200 THEN
    RAISE EXCEPTION 'O nome da fase é demasiado longo (máximo 200 caracteres)';
  END IF;
  IF v_peso <= 0 OR v_peso > 100000 THEN
    RAISE EXCEPTION 'O peso da fase tem de ser maior que zero';
  END IF;
  IF v_prog < 0 OR v_prog > 100 THEN
    RAISE EXCEPTION 'O progresso tem de estar entre 0 e 100';
  END IF;
  IF p_data_inicio IS NOT NULL AND p_data_fim_prevista IS NOT NULL AND p_data_fim_prevista < p_data_inicio THEN
    RAISE EXCEPTION 'A data prevista de fim não pode ser anterior ao início da fase';
  END IF;

  v_estado := CASE WHEN v_prog >= 100 THEN 'concluida' WHEN v_prog <= 0 THEN 'pendente' ELSE 'em_curso' END;

  IF p_id IS NULL THEN
    INSERT INTO public.obra_fases (obra_id, nome, peso, progresso, data_inicio, data_fim_prevista, estado, ordem, notas)
    VALUES (v_obra, v_nome, v_peso, v_prog, p_data_inicio, p_data_fim_prevista, v_estado,
            COALESCE((SELECT max(ordem) FROM public.obra_fases WHERE obra_id = v_obra), 0) + 1, NULLIF(btrim(p_notas), ''))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.obra_fases
       SET nome = v_nome, peso = v_peso, progresso = v_prog, data_inicio = p_data_inicio,
           data_fim_prevista = p_data_fim_prevista, estado = v_estado, notas = NULLIF(btrim(p_notas), ''),
           atualizado_por = auth.uid(), atualizado_em = now()
     WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.obra_apagar_fase(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.pode_medir_obras() THEN
    RAISE EXCEPTION 'Sem permissão para alterar o progresso da obra';
  END IF;
  DELETE FROM public.obra_fases WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fase não encontrada';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.obra_registar_afericao(
  p_obra_id         uuid,
  p_data            date    DEFAULT NULL,
  p_progresso_pct   numeric DEFAULT NULL,
  p_resumo          text    DEFAULT NULL,
  p_problemas       text    DEFAULT NULL,
  p_atrasos_dias    integer DEFAULT 0,
  p_atraso_motivo   text    DEFAULT NULL,
  p_clima           text    DEFAULT NULL,
  p_clima_descricao text    DEFAULT NULL,
  p_fotos           jsonb   DEFAULT '[]'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_data   date := COALESCE(p_data, public._hoje_pt());
  v_resumo text := NULLIF(btrim(p_resumo), '');
  v_atraso integer := COALESCE(p_atrasos_dias, 0);
  v_fotos  jsonb;
  v_id     uuid;
BEGIN
  IF NOT public.pode_medir_obras() THEN
    RAISE EXCEPTION 'Sem permissão para registar aferições';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.obras WHERE id = p_obra_id AND ativo) THEN
    RAISE EXCEPTION 'Obra não encontrada';
  END IF;
  IF v_resumo IS NULL THEN
    RAISE EXCEPTION 'Escreva o resumo da aferição';
  END IF;
  IF length(v_resumo) > 5000 OR length(p_problemas) > 5000 OR length(p_atraso_motivo) > 2000 OR length(p_clima_descricao) > 1000 THEN
    RAISE EXCEPTION 'Texto demasiado longo';
  END IF;
  IF v_data > public._hoje_pt() THEN
    RAISE EXCEPTION 'A data da aferição não pode ser futura';
  END IF;
  IF p_progresso_pct IS NOT NULL AND (p_progresso_pct < 0 OR p_progresso_pct > 100) THEN
    RAISE EXCEPTION 'A percentagem de progresso tem de estar entre 0 e 100';
  END IF;
  IF v_atraso < 0 OR v_atraso > 3650 THEN
    RAISE EXCEPTION 'Dias de atraso inválidos';
  END IF;
  IF NOT public._clima_ok(p_clima) THEN
    RAISE EXCEPTION 'Clima inválido';
  END IF;
  v_fotos := public._obra_fotos_validar(p_obra_id, p_fotos);

  INSERT INTO public.obra_afericoes
    (obra_id, data, progresso_pct, resumo, problemas, atrasos_dias, atraso_motivo, clima, clima_descricao, fotos, autor_id)
  VALUES
    (p_obra_id, v_data, p_progresso_pct, v_resumo, NULLIF(btrim(p_problemas), ''), v_atraso, NULLIF(btrim(p_atraso_motivo), ''),
     p_clima, NULLIF(btrim(p_clima_descricao), ''), v_fotos, auth.uid())
  RETURNING id INTO v_id;

  PERFORM public._obra_evento(p_obra_id, 'AFERICAO',
    'Aferição de ' || to_char(v_data, 'DD/MM/YYYY') || COALESCE(' — ' || round(p_progresso_pct)::text || ' %', ''),
    left(v_resumo, 200));
  RETURN v_id;
END;
$$;

-- ── 14. Relatórios diários ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.obra_definir_autores(p_obra_id uuid, p_user_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[] := ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(p_user_ids, '{}'::uuid[])) x WHERE x IS NOT NULL);
BEGIN
  IF NOT public.pode_gerir_obras() THEN
    RAISE EXCEPTION 'Sem permissão para designar quem escreve relatórios';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.obras WHERE id = p_obra_id AND ativo) THEN
    RAISE EXCEPTION 'Obra não encontrada';
  END IF;
  IF (SELECT count(*) FROM public.profiles WHERE id = ANY (v_ids) AND role::text NOT IN ('mecanico', 'motorista')) <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'Utilizador inválido: mecânicos e motoristas não escrevem relatórios de obra';
  END IF;

  DELETE FROM public.obra_autores WHERE obra_id = p_obra_id AND NOT (user_id = ANY (v_ids));
  INSERT INTO public.obra_autores (obra_id, user_id)
  SELECT p_obra_id, x FROM unnest(v_ids) x
  ON CONFLICT (obra_id, user_id) DO NOTHING;

  PERFORM public._obra_evento(p_obra_id, 'AUTORES_DEFINIDOS', 'Autores de relatórios atualizados',
    cardinality(v_ids)::text || CASE WHEN cardinality(v_ids) = 1 THEN ' autor designado' ELSE ' autores designados' END);
END;
$$;

-- Quem pode ser designado (os perfis só são legíveis por cada um e pelo admin)
CREATE OR REPLACE FUNCTION public.obra_autores_lista(p_obra_id uuid)
RETURNS TABLE (user_id uuid, nome text, role text, designado boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nome, p.role::text,
         EXISTS (SELECT 1 FROM public.obra_autores a WHERE a.obra_id = p_obra_id AND a.user_id = p.id)
    FROM public.profiles p
   WHERE public.pode_gerir_obras() AND p.role::text NOT IN ('mecanico', 'motorista')
   ORDER BY p.nome
$$;

CREATE OR REPLACE FUNCTION public.obra_guardar_relatorio(
  p_id                  uuid    DEFAULT NULL,
  p_obra_id             uuid    DEFAULT NULL,
  p_data                date    DEFAULT NULL,
  p_clima               text    DEFAULT NULL,
  p_temperatura_c       numeric DEFAULT NULL,
  p_clima_descricao     text    DEFAULT NULL,
  p_equipa_ids          uuid[]  DEFAULT '{}',
  p_equipa_outros       text    DEFAULT NULL,
  p_subempreiteiros_ids uuid[]  DEFAULT '{}',
  p_trabalhos           text    DEFAULT NULL,
  p_houve_ocorrencias   boolean DEFAULT false,
  p_ocorrencias         text    DEFAULT NULL,
  p_observacoes         text    DEFAULT NULL,
  p_fotos               jsonb   DEFAULT '[]'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_r      public.obra_relatorios_diarios%ROWTYPE;
  v_obra   uuid := p_obra_id;
  v_data   date := COALESCE(p_data, public._hoje_pt());
  v_equipa uuid[] := ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(p_equipa_ids, '{}'::uuid[])) x WHERE x IS NOT NULL);
  v_subs   uuid[] := ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(p_subempreiteiros_ids, '{}'::uuid[])) x WHERE x IS NOT NULL);
  v_houve  boolean := COALESCE(p_houve_ocorrencias, false);
  v_fotos  jsonb;
  v_id     uuid;
BEGIN
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_r FROM public.obra_relatorios_diarios WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR NOT public.pode_ver_obra(v_r.obra_id) THEN
      RAISE EXCEPTION 'Relatório não encontrado';
    END IF;
    IF NOT ((v_r.autor_id = auth.uid() AND public.pode_relatar_obra(v_r.obra_id)) OR public.pode_gerir_obras()) THEN
      RAISE EXCEPTION 'Só o autor, o gestor ou o administrador podem alterar este relatório';
    END IF;
    IF v_r.estado <> 'rascunho' THEN
      RAISE EXCEPTION 'Este relatório já foi submetido e não pode ser alterado';
    END IF;
    IF v_obra IS NOT NULL AND v_obra <> v_r.obra_id THEN
      RAISE EXCEPTION 'Não pode mudar um relatório de obra';
    END IF;
    v_obra := v_r.obra_id;
  ELSE
    IF v_obra IS NULL THEN
      RAISE EXCEPTION 'Escolha a obra';
    END IF;
    IF NOT public.pode_relatar_obra(v_obra) THEN
      RAISE EXCEPTION 'Sem permissão para escrever relatórios desta obra';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.obras WHERE id = v_obra AND ativo) THEN
      RAISE EXCEPTION 'Obra não encontrada';
    END IF;
  END IF;

  IF v_data > public._hoje_pt() THEN
    RAISE EXCEPTION 'A data do relatório não pode ser futura';
  END IF;
  IF NOT public._clima_ok(p_clima) THEN
    RAISE EXCEPTION 'Clima inválido';
  END IF;
  IF p_temperatura_c IS NOT NULL AND (p_temperatura_c < -50 OR p_temperatura_c > 60) THEN
    RAISE EXCEPTION 'Temperatura inválida (entre -50 e 60 °C)';
  END IF;
  IF length(p_trabalhos) > 10000 OR length(p_ocorrencias) > 10000 OR length(p_observacoes) > 10000
     OR length(p_equipa_outros) > 2000 OR length(p_clima_descricao) > 1000 THEN
    RAISE EXCEPTION 'Texto demasiado longo';
  END IF;
  IF (SELECT count(*) FROM public.colaboradores WHERE id = ANY (v_equipa)) <> cardinality(v_equipa) THEN
    RAISE EXCEPTION 'Equipa inválida: colaborador inexistente';
  END IF;
  IF (SELECT count(*) FROM public.subempreiteiros WHERE id = ANY (v_subs) AND obra_id = v_obra) <> cardinality(v_subs) THEN
    RAISE EXCEPTION 'Subempreiteiro inválido: não pertence a esta obra';
  END IF;
  v_fotos := public._obra_fotos_validar(v_obra, p_fotos);

  IF p_id IS NULL THEN
    INSERT INTO public.obra_relatorios_diarios
      (obra_id, data, clima, temperatura_c, clima_descricao, equipa_ids, equipa_outros, subempreiteiros_ids, trabalhos,
       houve_ocorrencias, ocorrencias, observacoes, fotos, autor_id)
    VALUES
      (v_obra, v_data, p_clima, p_temperatura_c, NULLIF(btrim(p_clima_descricao), ''), v_equipa, NULLIF(btrim(p_equipa_outros), ''),
       v_subs, NULLIF(btrim(p_trabalhos), ''), v_houve, CASE WHEN v_houve THEN NULLIF(btrim(p_ocorrencias), '') END,
       NULLIF(btrim(p_observacoes), ''), v_fotos, auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.obra_relatorios_diarios SET
      data = v_data, clima = p_clima, temperatura_c = p_temperatura_c, clima_descricao = NULLIF(btrim(p_clima_descricao), ''),
      equipa_ids = v_equipa, equipa_outros = NULLIF(btrim(p_equipa_outros), ''), subempreiteiros_ids = v_subs,
      trabalhos = NULLIF(btrim(p_trabalhos), ''), houve_ocorrencias = v_houve,
      ocorrencias = CASE WHEN v_houve THEN NULLIF(btrim(p_ocorrencias), '') END,
      observacoes = NULLIF(btrim(p_observacoes), ''), fotos = v_fotos, atualizado_em = now()
    WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.obra_submeter_relatorio(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_r public.obra_relatorios_diarios%ROWTYPE;
BEGIN
  SELECT * INTO v_r FROM public.obra_relatorios_diarios WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.pode_ver_obra(v_r.obra_id) THEN
    RAISE EXCEPTION 'Relatório não encontrado';
  END IF;
  IF NOT ((v_r.autor_id = auth.uid() AND public.pode_relatar_obra(v_r.obra_id)) OR public.pode_gerir_obras()) THEN
    RAISE EXCEPTION 'Só o autor, o gestor ou o administrador podem submeter este relatório';
  END IF;
  IF v_r.estado <> 'rascunho' THEN
    RAISE EXCEPTION 'Este relatório já foi submetido';
  END IF;
  IF v_r.clima IS NULL THEN
    RAISE EXCEPTION 'Indique o clima do dia';
  END IF;
  IF v_r.trabalhos IS NULL THEN
    RAISE EXCEPTION 'Descreva os trabalhos realizados';
  END IF;
  IF cardinality(v_r.equipa_ids) = 0 AND v_r.equipa_outros IS NULL THEN
    RAISE EXCEPTION 'Indique quem esteve presente na obra';
  END IF;
  IF v_r.houve_ocorrencias THEN
    IF v_r.ocorrencias IS NULL THEN
      RAISE EXCEPTION 'Descreva as ocorrências do dia';
    END IF;
    IF jsonb_array_length(v_r.fotos) = 0 THEN
      RAISE EXCEPTION 'Junte pelo menos uma foto das ocorrências';
    END IF;
  END IF;

  UPDATE public.obra_relatorios_diarios
     SET estado = 'submetido', submetido_em = now(), submetido_por = auth.uid(), atualizado_em = now()
   WHERE id = p_id;
  PERFORM public._obra_evento(v_r.obra_id, 'RELATORIO_SUBMETIDO',
    'Relatório diário de ' || to_char(v_r.data, 'DD/MM/YYYY') || ' submetido',
    CASE WHEN v_r.houve_ocorrencias THEN 'Com ocorrências' END);
END;
$$;

CREATE OR REPLACE FUNCTION public.obra_reabrir_relatorio(p_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_r      public.obra_relatorios_diarios%ROWTYPE;
  v_motivo text := NULLIF(btrim(p_motivo), '');
BEGIN
  IF public.auth_role() <> 'admin' THEN
    RAISE EXCEPTION 'Só o administrador pode reabrir um relatório submetido';
  END IF;
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'Indique o motivo da reabertura';
  END IF;
  IF length(v_motivo) > 1000 THEN
    RAISE EXCEPTION 'O motivo é demasiado longo (máximo 1000 caracteres)';
  END IF;
  SELECT * INTO v_r FROM public.obra_relatorios_diarios WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Relatório não encontrado';
  END IF;
  IF v_r.estado <> 'submetido' THEN
    RAISE EXCEPTION 'Este relatório ainda é um rascunho';
  END IF;

  UPDATE public.obra_relatorios_diarios
     SET estado = 'rascunho', submetido_em = NULL, submetido_por = NULL,
         reaberto_em = now(), reaberto_por = auth.uid(), reaberto_motivo = v_motivo, atualizado_em = now()
   WHERE id = p_id;
  PERFORM public._obra_evento(v_r.obra_id, 'RELATORIO_REABERTO',
    'Relatório diário de ' || to_char(v_r.data, 'DD/MM/YYYY') || ' reaberto', v_motivo);
END;
$$;

CREATE OR REPLACE FUNCTION public.obra_relatorios_lista(
  p_obra_id        uuid    DEFAULT NULL,
  p_desde          date    DEFAULT NULL,
  p_ate            date    DEFAULT NULL,
  p_estado         text    DEFAULT NULL,
  p_so_ocorrencias boolean DEFAULT false,
  p_limite         integer DEFAULT 200
)
RETURNS TABLE (
  id uuid, obra_id uuid, obra_nome text, data date, estado text, clima text, houve_ocorrencias boolean,
  trabalhos text, n_fotos integer, n_equipa integer, autor_id uuid, autor_nome text, submetido_em timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.obra_id, o.nome, r.data, r.estado, r.clima, r.houve_ocorrencias, r.trabalhos,
         jsonb_array_length(r.fotos), cardinality(r.equipa_ids), r.autor_id, public._nome_utilizador(r.autor_id), r.submetido_em
    FROM public.obra_relatorios_diarios r
    JOIN public.obras o ON o.id = r.obra_id
   WHERE public.pode_ver_obra(r.obra_id)
     AND (p_obra_id IS NULL OR r.obra_id = p_obra_id)
     AND (p_desde IS NULL OR r.data >= p_desde)
     AND (p_ate IS NULL OR r.data <= p_ate)
     AND (p_estado IS NULL OR r.estado = p_estado)
     AND (NOT COALESCE(p_so_ocorrencias, false) OR r.houve_ocorrencias)
   ORDER BY r.data DESC, r.criado_em DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limite, 200), 1), 1000)
$$;

CREATE OR REPLACE FUNCTION public.obra_relatorio_detalhe(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_r public.obra_relatorios_diarios%ROWTYPE;
BEGIN
  SELECT * INTO v_r FROM public.obra_relatorios_diarios WHERE id = p_id;
  IF NOT FOUND OR NOT public.pode_ver_obra(v_r.obra_id) THEN
    RAISE EXCEPTION 'Relatório não encontrado';
  END IF;
  RETURN to_jsonb(v_r) || jsonb_build_object(
    'obra_nome', (SELECT nome FROM public.obras WHERE id = v_r.obra_id),
    'autor_nome', public._nome_utilizador(v_r.autor_id),
    'submetido_por_nome', public._nome_utilizador(v_r.submetido_por),
    'reaberto_por_nome', public._nome_utilizador(v_r.reaberto_por),
    'equipa', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome) ORDER BY c.nome)
                          FROM public.colaboradores c WHERE c.id = ANY (v_r.equipa_ids)), '[]'::jsonb),
    'subempreiteiros', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome) ORDER BY s.nome)
                                   FROM public.subempreiteiros s WHERE s.id = ANY (v_r.subempreiteiros_ids)), '[]'::jsonb)
  );
END;
$$;

-- ── 15. Subempreitadas: ficha, contrato, ocorrências, evidências ────────────
CREATE OR REPLACE FUNCTION public.sub_atualizar_ficha(
  p_id                uuid,
  p_nif               text DEFAULT NULL,
  p_telefone          text DEFAULT NULL,
  p_email             text DEFAULT NULL,
  p_especialidade     text DEFAULT NULL,
  p_data_inicio       date DEFAULT NULL,
  p_data_fim_prevista date DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s public.subempreiteiros%ROWTYPE;
  v_email text := NULLIF(btrim(p_email), '');
BEGIN
  IF NOT public.pode_escrever('subempreitadas') THEN
    RAISE EXCEPTION 'Sem permissão para alterar subempreitadas';
  END IF;
  SELECT * INTO v_s FROM public.subempreiteiros WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contratação não encontrada';
  END IF;
  IF p_data_inicio IS NOT NULL AND p_data_fim_prevista IS NOT NULL AND p_data_fim_prevista < p_data_inicio THEN
    RAISE EXCEPTION 'A data prevista de fim não pode ser anterior à data de início';
  END IF;
  IF v_email IS NOT NULL AND v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Email inválido';
  END IF;
  IF length(p_nif) > 30 OR length(p_telefone) > 40 OR length(p_especialidade) > 100 OR length(v_email) > 200 THEN
    RAISE EXCEPTION 'Algum dos campos é demasiado longo';
  END IF;

  UPDATE public.subempreiteiros
     SET nif = NULLIF(btrim(p_nif), ''), telefone = NULLIF(btrim(p_telefone), ''), email = v_email,
         especialidade = NULLIF(btrim(p_especialidade), ''), data_inicio = p_data_inicio, data_fim_prevista = p_data_fim_prevista
   WHERE id = p_id;
  PERFORM public._obra_evento(v_s.obra_id, 'SUB_FICHA', 'Ficha de ' || v_s.nome || ' atualizada', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.sub_anexar_contrato(p_id uuid, p_path text, p_nome text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s    public.subempreiteiros%ROWTYPE;
  v_nome text := NULLIF(btrim(p_nome), '');
BEGIN
  IF NOT public.pode_escrever('subempreitadas') THEN
    RAISE EXCEPTION 'Sem permissão para anexar contratos';
  END IF;
  SELECT * INTO v_s FROM public.subempreiteiros WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contratação não encontrada';
  END IF;
  IF p_path IS NULL OR p_path !~ ('^' || p_id::text || '/contrato-[0-9]{1,16}\.(pdf|jpg|jpeg|png|webp|heic|heif)$') THEN
    RAISE EXCEPTION 'Ficheiro do contrato inválido';
  END IF;
  IF v_nome IS NULL OR length(v_nome) > 200 THEN
    RAISE EXCEPTION 'Indique o nome do ficheiro (máximo 200 caracteres)';
  END IF;

  UPDATE public.subempreiteiros
     SET contrato_path = p_path, contrato_nome = v_nome, contrato_enviado_em = now()
   WHERE id = p_id;
  PERFORM public._obra_evento(v_s.obra_id, 'CONTRATO_ANEXADO', 'Contrato anexado: ' || v_s.nome, v_nome);
END;
$$;

CREATE OR REPLACE FUNCTION public.sub_remover_contrato(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s public.subempreiteiros%ROWTYPE;
BEGIN
  IF NOT public.pode_escrever('subempreitadas') THEN
    RAISE EXCEPTION 'Sem permissão para remover contratos';
  END IF;
  SELECT * INTO v_s FROM public.subempreiteiros WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contratação não encontrada';
  END IF;
  IF v_s.contrato_path IS NULL THEN
    RAISE EXCEPTION 'Esta contratação não tem contrato anexado';
  END IF;
  UPDATE public.subempreiteiros
     SET contrato_path = NULL, contrato_nome = NULL, contrato_enviado_em = NULL
   WHERE id = p_id;
  PERFORM public._obra_evento(v_s.obra_id, 'CONTRATO_REMOVIDO', 'Contrato removido: ' || v_s.nome, v_s.contrato_nome);
END;
$$;

CREATE OR REPLACE FUNCTION public.sub_registar_ocorrencia(
  p_subempreiteiro_id uuid,
  p_tipo              text,
  p_gravidade         text    DEFAULT 'baixa',
  p_data              date    DEFAULT NULL,
  p_descricao         text    DEFAULT NULL,
  p_dias_atraso       integer DEFAULT 0,
  p_fotos             jsonb   DEFAULT '[]'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s     public.subempreiteiros%ROWTYPE;
  v_data  date := COALESCE(p_data, public._hoje_pt());
  v_desc  text := NULLIF(btrim(p_descricao), '');
  v_dias  integer := COALESCE(p_dias_atraso, 0);
  v_grav  text := COALESCE(p_gravidade, 'baixa');
  v_fotos jsonb;
  v_id    uuid;
BEGIN
  IF NOT public.pode_medir_obras() THEN
    RAISE EXCEPTION 'Sem permissão para registar ocorrências';
  END IF;
  SELECT * INTO v_s FROM public.subempreiteiros WHERE id = p_subempreiteiro_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contratação não encontrada';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('ATRASO', 'PROBLEMA', 'CLIMA', 'QUALIDADE', 'SEGURANCA', 'NOTA') THEN
    RAISE EXCEPTION 'Tipo de ocorrência inválido';
  END IF;
  IF v_grav NOT IN ('baixa', 'media', 'alta') THEN
    RAISE EXCEPTION 'Gravidade inválida';
  END IF;
  IF v_desc IS NULL THEN
    RAISE EXCEPTION 'Descreva a ocorrência';
  END IF;
  IF length(v_desc) > 5000 THEN
    RAISE EXCEPTION 'A descrição é demasiado longa (máximo 5000 caracteres)';
  END IF;
  IF v_data > public._hoje_pt() THEN
    RAISE EXCEPTION 'A data da ocorrência não pode ser futura';
  END IF;
  IF v_dias < 0 OR v_dias > 3650 THEN
    RAISE EXCEPTION 'Dias de atraso inválidos';
  END IF;
  IF p_tipo = 'ATRASO' AND v_dias = 0 THEN
    RAISE EXCEPTION 'Indique quantos dias de atraso';
  END IF;
  v_fotos := public._obra_fotos_validar(v_s.obra_id, p_fotos);

  INSERT INTO public.sub_ocorrencias (subempreiteiro_id, obra_id, tipo, gravidade, data, descricao, dias_atraso, fotos, autor_id)
  VALUES (v_s.id, v_s.obra_id, p_tipo, v_grav, v_data, v_desc, v_dias, v_fotos, auth.uid())
  RETURNING id INTO v_id;

  PERFORM public._obra_evento(v_s.obra_id, 'OCORRENCIA_REGISTADA',
    'Ocorrência (' || p_tipo || ', ' || v_grav || ') — ' || v_s.nome, left(v_desc, 200));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sub_resolver_ocorrencia(p_id uuid, p_resolucao text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_o   public.sub_ocorrencias%ROWTYPE;
  v_res text := NULLIF(btrim(p_resolucao), '');
  v_nome text;
BEGIN
  IF NOT public.pode_medir_obras() THEN
    RAISE EXCEPTION 'Sem permissão para resolver ocorrências';
  END IF;
  SELECT * INTO v_o FROM public.sub_ocorrencias WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ocorrência não encontrada';
  END IF;
  IF v_o.resolvido THEN
    RAISE EXCEPTION 'Esta ocorrência já está resolvida';
  END IF;
  IF v_res IS NULL THEN
    RAISE EXCEPTION 'Explique como foi resolvida';
  END IF;
  IF length(v_res) > 5000 THEN
    RAISE EXCEPTION 'A resolução é demasiado longa (máximo 5000 caracteres)';
  END IF;
  UPDATE public.sub_ocorrencias
     SET resolvido = true, resolvido_em = now(), resolvido_por = auth.uid(), resolucao = v_res
   WHERE id = p_id;
  SELECT nome INTO v_nome FROM public.subempreiteiros WHERE id = v_o.subempreiteiro_id;
  PERFORM public._obra_evento(v_o.obra_id, 'OCORRENCIA_RESOLVIDA', 'Ocorrência resolvida — ' || v_nome, left(v_res, 200));
END;
$$;

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
  IF v_a.estado = 'validado' AND public.auth_role() <> 'admin' THEN
    RAISE EXCEPTION 'Este auto já está validado — só o administrador pode alterar as provas';
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

  UPDATE public.autos_medicao
     SET fotos = v_fotos, anotacoes = NULLIF(btrim(p_anotacoes), ''), problemas = NULLIF(btrim(p_problemas), ''),
         atraso_dias = v_dias, clima = p_clima, clima_descricao = NULLIF(btrim(p_clima_descricao), ''),
         progresso_fisico_pct = p_progresso_fisico_pct
   WHERE id = p_auto_id;
END;
$$;

-- ── 16. Métricas das subempreitadas (painel e resumo) ───────────────────────
CREATE OR REPLACE FUNCTION public._subs_metricas(p_obra_id uuid, p_sub_id uuid)
RETURNS TABLE (
  sub_id uuid, obra_id uuid, obra_nome text, nome text, especialidade text, tipo text, estado text, ativo boolean,
  valor_contrato numeric, executado numeric, executado_pct numeric, pago numeric, por_pagar numeric, retencao_acumulada numeric,
  autos_n integer, ultimo_auto date, dias_sem_auto integer, atraso_dias_total integer, atraso_aberto integer,
  oc_baixa integer, oc_media integer, oc_alta integer, ocorrencias_total integer, presencas_relatorios integer,
  tem_contrato boolean, data_inicio date, data_fim_prevista date, dias_restantes integer, saude text, motivos text[]
)
LANGUAGE sql
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
  au AS (
    SELECT a.subempreiteiro_id AS sid, count(*)::int AS n, max(a.data_medicao) AS ultimo,
           COALESCE(sum(a.atraso_dias), 0)::int AS atraso,
           COALESCE(sum(a.valor_periodo) FILTER (WHERE a.estado = 'validado'), 0) AS exec,
           COALESCE(sum(a.valor_periodo * s.percentagem_retencao / 100) FILTER (WHERE a.estado = 'validado'), 0) AS ret,
           COALESCE(sum(a.valor_periodo * (100 - s.percentagem_retencao) / 100)
                    FILTER (WHERE a.estado = 'validado' AND a.estado_pagamento = 'pago'), 0) AS pago
      FROM public.autos_medicao a JOIN s ON s.id = a.subempreiteiro_id
     GROUP BY a.subempreiteiro_id
  ),
  oc AS (
    SELECT x.subempreiteiro_id AS sid, count(*)::int AS total,
           COALESCE(sum(x.dias_atraso), 0)::int AS atraso,
           COALESCE(sum(x.dias_atraso) FILTER (WHERE NOT x.resolvido), 0)::int AS atraso_ab,
           (count(*) FILTER (WHERE NOT x.resolvido AND x.gravidade = 'baixa'))::int AS baixa,
           (count(*) FILTER (WHERE NOT x.resolvido AND x.gravidade = 'media'))::int AS media,
           (count(*) FILTER (WHERE NOT x.resolvido AND x.gravidade = 'alta'))::int AS alta
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
           COALESCE(oc.alta, 0) AS alta, COALESCE(oc.total, 0) AS oc_total, COALESCE(pr.n, 0) AS pres,
           COALESCE(au.exec, 0) AS exec, COALESCE(au.ret, 0) AS ret, COALESCE(au.pago, 0) AS pago,
           CASE WHEN k.contrato > 0 THEN round(COALESCE(au.exec, 0) / k.contrato * 100, 2) END AS pct,
           h.d AS hoje,
           CASE WHEN s.data_fim_prevista IS NOT NULL THEN s.data_fim_prevista - h.d END AS restantes
      FROM s
      JOIN k ON k.id = s.id
      CROSS JOIN hoje h
      LEFT JOIN au ON au.sid = s.id
      LEFT JOIN oc ON oc.sid = s.id
      LEFT JOIN pr ON pr.sid = s.id
  )
  SELECT m.id, m.obra_id, m.obra_nome, m.nome, m.especialidade, m.tipo::text, m.estado::text, m.ativo,
         m.contrato, round(m.exec, 2), m.pct, round(m.pago, 2), round(m.exec - m.ret - m.pago, 2), round(m.ret, 2),
         m.autos_n, m.ultimo, CASE WHEN m.ultimo IS NOT NULL THEN m.hoje - m.ultimo END,
         m.atraso_total, m.atraso_ab, m.baixa, m.media, m.alta, m.oc_total, m.pres,
         m.contrato_path IS NOT NULL, m.data_inicio, m.data_fim_prevista, m.restantes,
         CASE WHEN cardinality(x.crit) > 0 THEN 'critico' WHEN cardinality(x.aten) > 0 THEN 'atencao' ELSE 'ok' END,
         x.crit || x.aten
    FROM m
    CROSS JOIN LATERAL (
      SELECT array_remove(ARRAY[
               CASE WHEN m.alta > 0 THEN m.alta || CASE WHEN m.alta = 1 THEN ' ocorrência grave por resolver' ELSE ' ocorrências graves por resolver' END END,
               CASE WHEN m.restantes < 0 AND COALESCE(m.pct, 0) < 100
                    THEN 'Prazo ultrapassado há ' || (-m.restantes) || CASE WHEN m.restantes = -1 THEN ' dia' ELSE ' dias' END END,
               CASE WHEN m.atraso_ab >= 15 THEN 'Atraso acumulado de ' || m.atraso_ab || ' dias' END
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
                    THEN 'Ainda sem autos de medição' END
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
  v_obra uuid;
  m      record;
BEGIN
  SELECT obra_id INTO v_obra FROM public.subempreiteiros WHERE id = p_id;
  IF NOT FOUND OR NOT public.pode_ver_obra(v_obra) THEN
    RAISE EXCEPTION 'Contratação não encontrada';
  END IF;
  SELECT * INTO m FROM public._subs_metricas(NULL, p_id);
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
    'motivos', to_jsonb(m.motivos)
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

-- Eventos da atividade: contratação criada/validada e auto validado (qualquer caminho)
CREATE OR REPLACE FUNCTION public._trg_evento_sub()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public._obra_evento(NEW.obra_id, 'SUB_CONTRATADA', 'Subempreitada registada: ' || NEW.nome, NULL);
  ELSIF NEW.estado = 'validado' AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    PERFORM public._obra_evento(NEW.obra_id, 'SUB_VALIDADA', 'Subempreitada validada: ' || NEW.nome, NULL);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_evento_sub ON public.subempreiteiros;
CREATE TRIGGER trg_evento_sub
  AFTER INSERT OR UPDATE OF estado ON public.subempreiteiros
  FOR EACH ROW EXECUTE FUNCTION public._trg_evento_sub();

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
      'Auto n.º ' || NEW.numero || ' validado — ' || v_s.nome, to_char(NEW.valor_periodo, 'FM999G999G990D00') || ' €');
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_evento_auto ON public.autos_medicao;
CREATE TRIGGER trg_evento_auto
  AFTER UPDATE OF estado ON public.autos_medicao
  FOR EACH ROW EXECUTE FUNCTION public._trg_evento_auto();

CREATE OR REPLACE FUNCTION public.obra_eventos_lista(p_obra_id uuid, p_limite integer DEFAULT 50)
RETURNS TABLE (id uuid, tipo text, titulo text, detalhe text, autor_nome text, criado_em timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.tipo, e.titulo, e.detalhe, public._nome_utilizador(e.autor_id), e.criado_em
    FROM public.obra_eventos e
   WHERE e.obra_id = p_obra_id AND public.pode_ver_obra(p_obra_id)
   ORDER BY e.criado_em DESC, e.id
   LIMIT LEAST(GREATEST(COALESCE(p_limite, 50), 1), 500)
$$;

-- ── 17. Painel e visão das obras ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.obras_painel();
DROP FUNCTION IF EXISTS public.obra_visao(uuid);
DROP FUNCTION IF EXISTS public._obra_resumos(uuid);
DROP TYPE IF EXISTS public.obra_resumo;

CREATE TYPE public.obra_resumo AS (
  obra_id uuid, nome text, cliente text, localizacao text, morada text, latitude numeric, longitude numeric,
  estado text, data_inicio date, data_prevista_fim date, data_fim_real date,
  progresso_pct numeric, progresso_fonte text, progresso_esperado_pct numeric,
  saude text, motivos text[], orcamento numeric, custo_total numeric,
  equipa_n integer, viaturas_n integer, ferramentas_n integer, subs_n integer, materiais_valor numeric,
  ocorrencias_abertas integer, relatorios_n integer, fotos_n integer, afericoes_n integer,
  ultimo_relatorio date, dias_sem_relatorio integer,
  responsavel_id uuid, responsavel_nome text, engenheiro_id uuid, engenheiro_nome text,
  tipo_obra text, descricao text, observacoes text
);

CREATE OR REPLACE FUNCTION public._obra_resumos(p_obra_id uuid)
RETURNS SETOF public.obra_resumo
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH hoje AS (SELECT public._hoje_pt() AS d),
  b AS (
    SELECT o.* FROM public.obras o
     WHERE o.ativo AND (p_obra_id IS NULL OR o.id = p_obra_id) AND public.pode_ver_obra(o.id)
  ),
  fases AS (
    SELECT f.obra_id, count(*) AS n, sum(f.peso * f.progresso) / sum(f.peso) AS p
      FROM public.obra_fases f WHERE f.obra_id IN (SELECT id FROM b) GROUP BY f.obra_id
  ),
  afer AS (
    SELECT DISTINCT ON (a.obra_id) a.obra_id, a.progresso_pct
      FROM public.obra_afericoes a
     WHERE a.progresso_pct IS NOT NULL AND a.obra_id IN (SELECT id FROM b)
     ORDER BY a.obra_id, a.data DESC, a.criado_em DESC
  ),
  afer_n AS (
    SELECT a.obra_id, count(*) AS n FROM public.obra_afericoes a WHERE a.obra_id IN (SELECT id FROM b) GROUP BY a.obra_id
  ),
  subs AS (
    SELECT m.obra_id,
           count(*) FILTER (WHERE m.ativo) AS n,
           sum(m.executado) FILTER (WHERE m.ativo AND m.estado = 'validado' AND m.valor_contrato > 0)
             / NULLIF(sum(m.valor_contrato) FILTER (WHERE m.ativo AND m.estado = 'validado' AND m.valor_contrato > 0), 0) * 100 AS prog
      FROM public._subs_metricas(p_obra_id, NULL) m GROUP BY m.obra_id
  ),
  oc AS (
    SELECT x.obra_id,
           count(*) FILTER (WHERE NOT x.resolvido) AS abertas,
           count(*) FILTER (WHERE NOT x.resolvido AND x.gravidade = 'alta') AS altas
      FROM public.sub_ocorrencias x
      JOIN public.subempreiteiros s ON s.id = x.subempreiteiro_id AND s.ativo
     WHERE x.obra_id IN (SELECT id FROM b) GROUP BY x.obra_id
  ),
  rel AS (
    SELECT r.obra_id, count(*) FILTER (WHERE r.estado = 'submetido') AS n,
           max(r.data) FILTER (WHERE r.estado = 'submetido') AS ultimo
      FROM public.obra_relatorios_diarios r WHERE r.obra_id IN (SELECT id FROM b) GROUP BY r.obra_id
  ),
  fotos AS (
    SELECT t.obra_id, count(*) AS n FROM public.obra_fotos_todas t WHERE t.obra_id IN (SELECT id FROM b) GROUP BY t.obra_id
  ),
  mat AS (
    SELECT m.obra_id, sum(m.valor) AS valor FROM public.armazem_materiais_por_obra(p_obra_id) m GROUP BY m.obra_id
  ),
  viat AS (
    SELECT v.obra_atual_id AS obra_id, count(*) AS n
      FROM public.comb_veiculos v WHERE v.ativo AND v.estado_operacional = 'EM_USO' AND v.obra_atual_id IS NOT NULL
     GROUP BY v.obra_atual_id
  ),
  ferr AS (
    SELECT e.obra_id, count(*) AS n FROM public.emprestimos_ferramentas e
     WHERE e.estado = 'ativo' AND e.obra_id IS NOT NULL GROUP BY e.obra_id
  ),
  eq AS (
    SELECT e.obra_id, count(*) AS n FROM public.obra_equipa e WHERE e.ate IS NULL GROUP BY e.obra_id
  ),
  c AS (
    SELECT b.*, h.d AS hoje,
           CASE WHEN fases.n > 0 THEN round(fases.p, 2)
                WHEN afer.progresso_pct IS NOT NULL THEN afer.progresso_pct
                WHEN subs.prog IS NOT NULL THEN round(least(subs.prog, 100), 2) END AS prog,
           CASE WHEN fases.n > 0 THEN 'fases'
                WHEN afer.progresso_pct IS NOT NULL THEN 'afericao'
                WHEN subs.prog IS NOT NULL THEN 'subempreitadas' ELSE 'nenhuma' END AS fonte,
           CASE WHEN b.data_inicio IS NULL OR b.data_prevista_fim IS NULL THEN NULL
                WHEN b.data_prevista_fim <= b.data_inicio THEN CASE WHEN h.d >= b.data_prevista_fim THEN 100 ELSE 0 END
                ELSE round(greatest(0, least(100, (h.d - b.data_inicio)::numeric * 100 / (b.data_prevista_fim - b.data_inicio))), 2) END AS esperado,
           round(COALESCE((public.custos_consolidados_por_obra(b.id) ->> 'total')::numeric, 0), 2) AS custo,
           COALESCE(oc.abertas, 0)::int AS oc_abertas, COALESCE(oc.altas, 0)::int AS oc_altas,
           COALESCE(rel.n, 0)::int AS rel_n, rel.ultimo,
           CASE WHEN rel.ultimo IS NOT NULL THEN h.d - rel.ultimo
                WHEN b.data_inicio IS NOT NULL AND b.data_inicio <= h.d THEN h.d - b.data_inicio END AS sem_rel,
           COALESCE(eq.n, 0)::int AS eq_n, COALESCE(viat.n, 0)::int AS viat_n, COALESCE(ferr.n, 0)::int AS ferr_n,
           COALESCE(subs.n, 0)::int AS subs_n, round(COALESCE(mat.valor, 0), 2) AS mat_valor,
           COALESCE(fotos.n, 0)::int AS fotos_n, COALESCE(afer_n.n, 0)::int AS afer_n
      FROM b
      CROSS JOIN hoje h
      LEFT JOIN fases  ON fases.obra_id  = b.id
      LEFT JOIN afer   ON afer.obra_id   = b.id
      LEFT JOIN afer_n ON afer_n.obra_id = b.id
      LEFT JOIN subs   ON subs.obra_id   = b.id
      LEFT JOIN oc     ON oc.obra_id     = b.id
      LEFT JOIN rel    ON rel.obra_id    = b.id
      LEFT JOIN fotos  ON fotos.obra_id  = b.id
      LEFT JOIN mat    ON mat.obra_id    = b.id
      LEFT JOIN viat   ON viat.obra_id   = b.id
      LEFT JOIN ferr   ON ferr.obra_id   = b.id
      LEFT JOIN eq     ON eq.obra_id     = b.id
  )
  SELECT c.id, c.nome, c.cliente, c.localizacao, c.morada, c.latitude, c.longitude,
         c.estado, c.data_inicio, c.data_prevista_fim, c.data_fim_real,
         c.prog, c.fonte, c.esperado,
         CASE WHEN c.estado <> 'ativa' THEN 'ok' WHEN cardinality(x.crit) > 0 THEN 'critico' WHEN cardinality(x.aten) > 0 THEN 'atencao' ELSE 'ok' END,
         CASE WHEN c.estado <> 'ativa' THEN ARRAY[]::text[] ELSE x.crit || x.aten END,
         c.orcamento, c.custo,
         c.eq_n, c.viat_n, c.ferr_n, c.subs_n, c.mat_valor,
         c.oc_abertas, c.rel_n, c.fotos_n, c.afer_n,
         c.ultimo, c.sem_rel,
         c.responsavel_id, (SELECT nome FROM public.colaboradores WHERE id = c.responsavel_id),
         c.engenheiro_id,  (SELECT nome FROM public.colaboradores WHERE id = c.engenheiro_id),
         c.tipo_obra, c.descricao, c.observacoes
    FROM c
    CROSS JOIN LATERAL (
      SELECT array_remove(ARRAY[
               CASE WHEN c.data_prevista_fim < c.hoje
                    THEN 'Prazo ultrapassado há ' || (c.hoje - c.data_prevista_fim) || CASE WHEN c.hoje - c.data_prevista_fim = 1 THEN ' dia' ELSE ' dias' END END,
               CASE WHEN c.esperado IS NOT NULL AND c.prog IS NOT NULL AND c.esperado - c.prog >= 20
                    THEN 'Atraso de ' || round(c.esperado - c.prog)::int || ' pontos face ao esperado' END,
               CASE WHEN c.oc_altas > 0
                    THEN c.oc_altas || CASE WHEN c.oc_altas = 1 THEN ' ocorrência grave por resolver' ELSE ' ocorrências graves por resolver' END END
             ]::text[], NULL) AS crit,
             array_remove(ARRAY[
               CASE WHEN c.esperado IS NOT NULL AND c.prog IS NOT NULL AND c.esperado - c.prog >= 8 AND c.esperado - c.prog < 20
                    THEN 'Atraso de ' || round(c.esperado - c.prog)::int || ' pontos face ao esperado' END,
               CASE WHEN c.data_inicio IS NOT NULL AND c.data_inicio <= c.hoje AND c.sem_rel >= 3
                    THEN CASE WHEN c.ultimo IS NULL THEN 'Ainda sem relatórios diários submetidos'
                              ELSE 'Sem relatório diário há ' || c.sem_rel || ' dias' END END,
               CASE WHEN c.orcamento IS NOT NULL AND c.orcamento > 0 AND c.custo >= 0.9 * c.orcamento
                    THEN 'Custo a ' || round(c.custo / c.orcamento * 100)::int || ' % do orçamento' END,
               CASE WHEN c.oc_abertas - c.oc_altas > 0
                    THEN (c.oc_abertas - c.oc_altas) || CASE WHEN c.oc_abertas - c.oc_altas = 1 THEN ' ocorrência por resolver' ELSE ' ocorrências por resolver' END END
             ]::text[], NULL) AS aten
    ) x
$$;

CREATE OR REPLACE FUNCTION public.obras_painel()
RETURNS SETOF public.obra_resumo
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public._obra_resumos(NULL) r
   ORDER BY CASE r.estado WHEN 'ativa' THEN 0 WHEN 'planeada' THEN 1 WHEN 'suspensa' THEN 2 ELSE 3 END, r.nome
$$;

CREATE OR REPLACE FUNCTION public.obra_visao(p_obra_id uuid)
RETURNS public.obra_resumo
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.obra_resumo;
BEGIN
  SELECT * INTO r FROM public._obra_resumos(p_obra_id);
  IF r.obra_id IS NULL THEN
    RAISE EXCEPTION 'Obra não encontrada';
  END IF;
  RETURN r;
END;
$$;

-- ── 18. Cruzamentos (só leitura; respeitam a RLS de quem consulta) ──────────
CREATE OR REPLACE FUNCTION public.obra_frota(p_obra_id uuid)
RETURNS TABLE (
  veiculo_id uuid, nome text, identificacao text, tipo text, marca text, modelo text, estado_operacional text,
  condutor_nome text, desde date, km_atual numeric, ehmaquina boolean, atual boolean,
  entregue_em timestamptz, devolvido_em timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT v.id, v.nome, v.identificacao, v.tipo, v.marca, v.modelo, v.estado_operacional,
         c.nome, e.data, public.km_atual_veiculo(v.id),
         (v.tipo = 'maquina' OR v.unidade_contador = 'horas'),
         (d.id IS NULL AND v.estado_operacional = 'EM_USO' AND v.obra_atual_id = e.obra_id),
         e.criado_em, d.criado_em
    FROM public.veiculo_entregas e
    JOIN public.comb_veiculos v ON v.id = e.veiculo_id
    JOIN public.colaboradores c ON c.id = e.colaborador_id
    LEFT JOIN public.veiculo_entregas d ON d.entrega_ref = e.id
   WHERE e.tipo = 'ENTREGA' AND e.obra_id = p_obra_id AND public.pode_ver_obra(p_obra_id)
  UNION ALL
  -- em uso na obra sem registo de entrega (anterior ao módulo de entregas)
  SELECT v.id, v.nome, v.identificacao, v.tipo, v.marca, v.modelo, v.estado_operacional,
         c.nome, at.desde, public.km_atual_veiculo(v.id),
         (v.tipo = 'maquina' OR v.unidade_contador = 'horas'), true, NULL::timestamptz, NULL::timestamptz
    FROM public.comb_veiculos v
    LEFT JOIN public.veiculo_atribuicoes at ON at.veiculo_id = v.id AND at.ate IS NULL
    LEFT JOIN public.colaboradores c ON c.id = at.colaborador_id
   WHERE v.obra_atual_id = p_obra_id AND v.estado_operacional = 'EM_USO' AND public.pode_ver_obra(p_obra_id)
     AND NOT EXISTS (SELECT 1 FROM public.veiculo_entregas e
                      WHERE e.veiculo_id = v.id AND e.tipo = 'ENTREGA' AND e.obra_id = p_obra_id
                        AND NOT EXISTS (SELECT 1 FROM public.veiculo_entregas d WHERE d.entrega_ref = e.id))
  ORDER BY 12 DESC, 13 DESC NULLS LAST
$$;

CREATE OR REPLACE FUNCTION public.obra_ferramentas(p_obra_id uuid)
RETURNS TABLE (
  emprestimo_id uuid, ferramenta_id uuid, nome text, numero_serie text, foto_path text, colaborador_nome text,
  data_saida timestamptz, data_devolucao timestamptz, ativo boolean, dias_fora integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT e.id, f.id, f.nome, f.numero_serie, f.foto_path, e.funcionario_nome,
         e.data_emprestimo, e.data_devolucao, (e.estado = 'ativo'),
         ((COALESCE(e.data_devolucao, now()) AT TIME ZONE 'Europe/Lisbon')::date - (e.data_emprestimo AT TIME ZONE 'Europe/Lisbon')::date)
    FROM public.emprestimos_ferramentas e
    JOIN public.ferramentas f ON f.id = e.ferramenta_id
   WHERE e.obra_id = p_obra_id AND public.pode_ver_obra(p_obra_id)
   ORDER BY (e.estado = 'ativo') DESC, e.data_emprestimo DESC
$$;

CREATE OR REPLACE FUNCTION public.obra_materiais(p_obra_id uuid)
RETURNS TABLE (
  produto_id uuid, nome text, unidade text, enviado numeric, devolvido numeric, liquido numeric, valor numeric,
  ultimo_movimento date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT m.produto_id, m.produto_nome, m.unidade, m.enviado, m.devolvido, m.liquido, m.valor,
         (m.ultimo_movimento AT TIME ZONE 'Europe/Lisbon')::date
    FROM public.armazem_materiais_por_obra(p_obra_id) m
   WHERE public.pode_ver_obra(p_obra_id)
   ORDER BY m.valor DESC NULLS LAST, m.produto_nome
$$;

-- ── 19. Armazenamento ────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('obras', 'obras', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('obras-contratos', 'obras-contratos', false, 20971520,
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
ON CONFLICT (id) DO NOTHING;

-- Fotos: <obra>/<galeria|relatorios|afericoes|subempreitadas|autos>/<ts>-<rand>.<ext>
CREATE OR REPLACE FUNCTION public.foto_obra_valida(p_nome text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_nome ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(galeria|relatorios|afericoes|subempreitadas|autos)/[0-9]{1,16}-[a-z0-9]{1,12}\.(jpg|jpeg|png|webp|heic|heif)$'
      THEN EXISTS (SELECT 1 FROM public.obras WHERE id = split_part(p_nome, '/', 1)::uuid)
           AND public.pode_relatar_obra(split_part(p_nome, '/', 1)::uuid)
    ELSE false
  END
$$;

-- Contratos: <subempreiteiro>/contrato-<ts>.<ext>
CREATE OR REPLACE FUNCTION public.contrato_obra_valido(p_nome text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_nome ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/contrato-[0-9]{1,16}\.(pdf|jpg|jpeg|png|webp|heic|heif)$'
      THEN EXISTS (SELECT 1 FROM public.subempreiteiros WHERE id = split_part(p_nome, '/', 1)::uuid)
           AND public.pode_escrever('subempreitadas')
    ELSE false
  END
$$;

DROP POLICY IF EXISTS "obras_upload_fotos" ON storage.objects;
CREATE POLICY "obras_upload_fotos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'obras' AND public.foto_obra_valida(name));

DROP POLICY IF EXISTS "obras_contratos_select" ON storage.objects;
CREATE POLICY "obras_contratos_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'obras-contratos' AND public.pode_ler_obras());

DROP POLICY IF EXISTS "obras_contratos_insert" ON storage.objects;
CREATE POLICY "obras_contratos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'obras-contratos' AND public.contrato_obra_valido(name));

DROP POLICY IF EXISTS "obras_contratos_delete" ON storage.objects;
CREATE POLICY "obras_contratos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'obras-contratos' AND public.pode_escrever('subempreitadas'));

-- ── 20. GRANT / REVOKE das funções ──────────────────────────────────────────
-- Por omissão o Postgres dá EXECUTE a PUBLIC (e a plataforma a anon): fecha-se tudo e abre-se
-- só a authenticated; as funções internas ficam sem EXECUTE para os papéis da API.
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.proname
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname = ANY (ARRAY[
         'pode_gerir_obras', 'pode_medir_obras', 'pode_ler_obras', 'pode_relatar_obra', 'pode_ver_obra', '_autor_designado',
         '_hoje_pt', '_clima_ok', '_fotos_forma_ok',
         'obra_adicionar_fotos', 'obra_apagar_foto', 'obra_guardar', 'obra_alocar_colaborador', 'obra_remover_colaborador',
         'obra_equipa_lista', 'obra_guardar_fase', 'obra_apagar_fase', 'obra_registar_afericao', 'obra_definir_autores',
         'obra_autores_lista', 'obra_guardar_relatorio', 'obra_submeter_relatorio', 'obra_reabrir_relatorio',
         'obra_relatorios_lista', 'obra_relatorio_detalhe', 'sub_atualizar_ficha', 'sub_anexar_contrato',
         'sub_remover_contrato', 'sub_registar_ocorrencia', 'sub_resolver_ocorrencia', 'auto_guardar_evidencias',
         'sub_painel', 'subs_resumo', 'obra_eventos_lista', 'obras_painel', 'obra_visao',
         'obra_frota', 'obra_ferramentas', 'obra_materiais', 'foto_obra_valida', 'contrato_obra_valido'])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;

  FOR f IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname = ANY (ARRAY['_obra_evento', '_obra_fotos_validar', '_subs_metricas', '_obra_resumos',
                                  '_trg_evento_sub', '_trg_evento_auto'])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
END $$;
