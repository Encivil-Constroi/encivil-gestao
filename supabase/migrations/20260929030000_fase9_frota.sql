-- ================================================================
-- ENCIVIL — Fase 9 (2/2): Frota — manutenção, checklists, responsabilização
--
-- Ver docs/12-plano-v3.md, Fase 9. Resumo:
--   • catálogo de itens que o mecânico gere sozinho (sem migrations para
--     acrescentar itens) + configuração por viatura (cada carrinha pode ser
--     diferente);
--   • histórico de manutenções e de checklists, com o condutor responsável
--     no momento;
--   • alertas por item (regra genérica FROTA_ITEM) que substituem as 4
--     regras antigas de colunas fixas em comb_veiculos — os dados dessas
--     colunas passam para as tabelas novas nesta mesma migration;
--   • quem recebe as notificações de frota é uma lista de pessoas, não um papel.
--
-- Escrita só por RPC (SECURITY DEFINER com verificação de papel), exceto o
-- catálogo, que é CRUD simples protegido por RLS.
--
-- APLICAR: SQL Editor, DEPOIS de 20260929020000_fase9_papel_mecanico.sql.
-- Idempotente (pode ser aplicada mais do que uma vez).
-- ================================================================

-- ── 1. Permissões: módulo 'frota' ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pode_escrever(modulo TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(CASE modulo
    WHEN 'armazem'        THEN public.auth_role() IN ('admin', 'gestor', 'armazem')
    WHEN 'ferramentas'    THEN public.auth_role() IN ('admin', 'gestor', 'armazem')
    WHEN 'combustivel'    THEN public.auth_role() IN ('admin', 'gestor', 'armazem')
    WHEN 'obras'          THEN public.auth_role() IN ('admin', 'gestor')
    WHEN 'subempreitadas' THEN public.auth_role() IN ('admin', 'gestor', 'medicoes')
    WHEN 'frota'          THEN public.auth_role() IN ('admin', 'gestor', 'mecanico')
    ELSE false
  END, false)
$$;

-- ── 2. Catálogo de itens ─────────────────────────────────────────────────────
-- CHECKLIST  = verificação visual, sem prazo (aparece no formulário de checklist)
-- MANUTENCAO = tem prazo em km e/ou meses (gera alertas, aparece em "registar manutenção")
CREATE TABLE IF NOT EXISTS public.frota_itens_catalogo (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  chave                  text        NOT NULL UNIQUE,
  rotulo                 text        NOT NULL,
  categoria              text        NOT NULL,
  natureza               text        NOT NULL,
  intervalo_km_padrao    numeric,
  intervalo_meses_padrao integer,
  limiar_atencao_km      numeric     NOT NULL DEFAULT 2000,
  limiar_urgente_km      numeric     NOT NULL DEFAULT 500,
  limiar_atencao_dias    integer     NOT NULL DEFAULT 30,
  limiar_urgente_dias    integer     NOT NULL DEFAULT 7,
  ordem                  integer     NOT NULL DEFAULT 0,
  ativo                  boolean     NOT NULL DEFAULT true,
  criado_por             uuid        REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  criado_em              timestamptz NOT NULL DEFAULT now(),
  atualizado_em          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_frota_item_chave     CHECK (chave ~ '^[a-z0-9_]{2,60}$'),
  CONSTRAINT ck_frota_item_rotulo    CHECK (length(btrim(rotulo)) BETWEEN 2 AND 120),
  CONSTRAINT ck_frota_item_categoria CHECK (categoria IN ('INSPECAO_RAPIDA', 'REVISAO_PERIODICA', 'LONGO_PRAZO', 'OBRIGACAO_LEGAL')),
  CONSTRAINT ck_frota_item_natureza  CHECK (natureza IN ('CHECKLIST', 'MANUTENCAO')),
  -- Itens de checklist não têm prazo
  CONSTRAINT ck_frota_item_intervalos CHECK (
    natureza = 'MANUTENCAO' OR (intervalo_km_padrao IS NULL AND intervalo_meses_padrao IS NULL)),
  CONSTRAINT ck_frota_item_intervalo_km    CHECK (intervalo_km_padrao    IS NULL OR intervalo_km_padrao    > 0),
  CONSTRAINT ck_frota_item_intervalo_meses CHECK (intervalo_meses_padrao IS NULL OR intervalo_meses_padrao > 0),
  CONSTRAINT ck_frota_item_limiares_km   CHECK (limiar_urgente_km   >= 0 AND limiar_urgente_km   <= limiar_atencao_km),
  CONSTRAINT ck_frota_item_limiares_dias CHECK (limiar_urgente_dias >= 0 AND limiar_urgente_dias <= limiar_atencao_dias)
);

CREATE OR REPLACE FUNCTION public._frota_catalogo_atualizado_em()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_frota_catalogo_atualizado_em ON public.frota_itens_catalogo;
CREATE TRIGGER trg_frota_catalogo_atualizado_em
  BEFORE UPDATE ON public.frota_itens_catalogo
  FOR EACH ROW EXECUTE FUNCTION public._frota_catalogo_atualizado_em();

-- ── 3. Configuração por viatura ──────────────────────────────────────────────
-- Uma linha = "este item aplica-se a esta viatura". Sem linha: itens de
-- CHECKLIST aplicam-se por omissão; itens de MANUTENCAO não são acompanhados.
-- ativo = false exclui o item desta viatura (ex.: AdBlue numa carrinha sem SCR).
CREATE TABLE IF NOT EXISTS public.frota_veiculo_itens (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id      uuid        NOT NULL REFERENCES public.comb_veiculos(id),
  item_id         uuid        NOT NULL REFERENCES public.frota_itens_catalogo(id),
  ativo           boolean     NOT NULL DEFAULT true,
  intervalo_km    numeric,    -- NULL = usa o intervalo por omissão do catálogo
  intervalo_meses integer,
  proxima_km      numeric,
  proxima_data    date,
  ultima_km       numeric,
  ultima_data     date,
  atualizado_por  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  atualizado_em   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_frota_veiculo_item UNIQUE (veiculo_id, item_id),
  CONSTRAINT ck_fvi_intervalo_km    CHECK (intervalo_km    IS NULL OR intervalo_km    > 0),
  CONSTRAINT ck_fvi_intervalo_meses CHECK (intervalo_meses IS NULL OR intervalo_meses > 0),
  CONSTRAINT ck_fvi_km              CHECK ((proxima_km IS NULL OR proxima_km >= 0) AND (ultima_km IS NULL OR ultima_km >= 0))
);

CREATE INDEX IF NOT EXISTS idx_fvi_veiculo ON public.frota_veiculo_itens (veiculo_id);

-- ── 4. Condutor responsável por período ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.veiculo_atribuicoes (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id     uuid        NOT NULL REFERENCES public.comb_veiculos(id),
  colaborador_id uuid        NOT NULL REFERENCES public.colaboradores(id),
  desde          date        NOT NULL DEFAULT CURRENT_DATE,
  ate            date,        -- NULL = atribuição atual
  criado_por     uuid        REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  criado_em      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_atribuicao_periodo CHECK (ate IS NULL OR ate >= desde)
);

-- Nunca duas pessoas responsáveis pela mesma viatura ao mesmo tempo
CREATE UNIQUE INDEX IF NOT EXISTS ux_veiculo_atribuicao_aberta
  ON public.veiculo_atribuicoes (veiculo_id) WHERE ate IS NULL;

-- ── 5. Histórico de manutenções ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.veiculo_manutencoes (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id       uuid          NOT NULL REFERENCES public.comb_veiculos(id),
  item_id          uuid          REFERENCES public.frota_itens_catalogo(id),  -- NULL = trabalho avulso
  descricao        text,
  data             date          NOT NULL DEFAULT CURRENT_DATE,
  km_na_altura     numeric,
  custo            numeric(10,2),
  oficina          text,
  observacoes      text,
  atualiza_proxima boolean       NOT NULL DEFAULT true,
  condutor_id      uuid          REFERENCES public.colaboradores(id),  -- responsável pela viatura na altura
  criado_por       uuid          REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  criado_em        timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT ck_manutencao_desc  CHECK (item_id IS NOT NULL OR length(btrim(COALESCE(descricao, ''))) > 0),
  CONSTRAINT ck_manutencao_km    CHECK (km_na_altura IS NULL OR km_na_altura >= 0),
  CONSTRAINT ck_manutencao_custo CHECK (custo IS NULL OR custo >= 0)
);

CREATE INDEX IF NOT EXISTS idx_manutencoes_veiculo ON public.veiculo_manutencoes (veiculo_id, data DESC);

-- ── 6. Checklists ────────────────────────────────────────────────────────────
-- itens = fotografia do catálogo no momento (o catálogo pode mudar depois e o
-- histórico não deve mudar com ele)
CREATE TABLE IF NOT EXISTS public.veiculo_checklists (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id    uuid        NOT NULL REFERENCES public.comb_veiculos(id),
  data          date        NOT NULL DEFAULT CURRENT_DATE,
  km_na_altura  numeric,
  itens         jsonb       NOT NULL,
  estado_geral  text        NOT NULL,
  observacoes   text,
  foto_keys     text[]      NOT NULL DEFAULT '{}',
  condutor_id   uuid        REFERENCES public.colaboradores(id),
  criado_por    uuid        REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  criado_em     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_checklist_estado CHECK (estado_geral IN ('OK', 'ATENCAO', 'MAU')),
  CONSTRAINT ck_checklist_km     CHECK (km_na_altura IS NULL OR km_na_altura >= 0)
);

CREATE INDEX IF NOT EXISTS idx_checklists_veiculo ON public.veiculo_checklists (veiculo_id, data DESC);

-- ── 7. Quem recebe as notificações de frota ──────────────────────────────────
-- Pessoas concretas (o chefe e o mecânico), não um papel inteiro
CREATE TABLE IF NOT EXISTS public.frota_alerta_destinatarios (
  user_id    uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

-- Controlo das notificações já enviadas (1 por alerta, outra se passar a URGENTE)
ALTER TABLE public.alertas
  ADD COLUMN IF NOT EXISTS push_severidade text,
  ADD COLUMN IF NOT EXISTS push_em         timestamptz;

-- ── 8. RLS + GRANTs ──────────────────────────────────────────────────────────
ALTER TABLE public.frota_itens_catalogo       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frota_veiculo_itens        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.veiculo_atribuicoes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.veiculo_manutencoes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.veiculo_checklists         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frota_alerta_destinatarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "frota_catalogo_select" ON public.frota_itens_catalogo;
CREATE POLICY "frota_catalogo_select" ON public.frota_itens_catalogo
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "frota_catalogo_insert" ON public.frota_itens_catalogo;
CREATE POLICY "frota_catalogo_insert" ON public.frota_itens_catalogo
  FOR INSERT TO authenticated WITH CHECK (public.pode_escrever('frota'));
DROP POLICY IF EXISTS "frota_catalogo_update" ON public.frota_itens_catalogo;
CREATE POLICY "frota_catalogo_update" ON public.frota_itens_catalogo
  FOR UPDATE TO authenticated
  USING (public.pode_escrever('frota')) WITH CHECK (public.pode_escrever('frota'));

DROP POLICY IF EXISTS "frota_fvi_select" ON public.frota_veiculo_itens;
CREATE POLICY "frota_fvi_select" ON public.frota_veiculo_itens
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "frota_atribuicoes_select" ON public.veiculo_atribuicoes;
CREATE POLICY "frota_atribuicoes_select" ON public.veiculo_atribuicoes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "frota_manutencoes_select" ON public.veiculo_manutencoes;
CREATE POLICY "frota_manutencoes_select" ON public.veiculo_manutencoes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "frota_checklists_select" ON public.veiculo_checklists;
CREATE POLICY "frota_checklists_select" ON public.veiculo_checklists
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "frota_destinatarios_select" ON public.frota_alerta_destinatarios;
CREATE POLICY "frota_destinatarios_select" ON public.frota_alerta_destinatarios
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "frota_destinatarios_insert" ON public.frota_alerta_destinatarios;
CREATE POLICY "frota_destinatarios_insert" ON public.frota_alerta_destinatarios
  FOR INSERT TO authenticated WITH CHECK (public.auth_role() = 'admin');
DROP POLICY IF EXISTS "frota_destinatarios_delete" ON public.frota_alerta_destinatarios;
CREATE POLICY "frota_destinatarios_delete" ON public.frota_alerta_destinatarios
  FOR DELETE TO authenticated USING (public.auth_role() = 'admin');

-- Só o catálogo e os destinatários têm escrita direta; o resto só por RPC
GRANT SELECT, INSERT, UPDATE ON TABLE public.frota_itens_catalogo       TO authenticated;
GRANT SELECT                 ON TABLE public.frota_veiculo_itens        TO authenticated;
GRANT SELECT                 ON TABLE public.veiculo_atribuicoes        TO authenticated;
GRANT SELECT                 ON TABLE public.veiculo_manutencoes        TO authenticated;
GRANT SELECT                 ON TABLE public.veiculo_checklists         TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.frota_alerta_destinatarios TO authenticated;
REVOKE ALL ON TABLE public.frota_itens_catalogo, public.frota_veiculo_itens, public.veiculo_atribuicoes,
  public.veiculo_manutencoes, public.veiculo_checklists, public.frota_alerta_destinatarios FROM anon;

-- Edge Function send-push-frota (lê alertas e marca-os como notificados)
GRANT SELECT ON TABLE public.frota_itens_catalogo, public.frota_veiculo_itens, public.frota_alerta_destinatarios, public.comb_veiculos, public.regras_alerta, public.push_subscriptions TO service_role;
GRANT SELECT, UPDATE ON TABLE public.alertas TO service_role;
GRANT DELETE ON TABLE public.push_subscriptions TO service_role;
-- send-push (combustível) passa a filtrar por papel: o mecânico não recebe pedidos
GRANT SELECT ON TABLE public.profiles TO service_role;

-- ── 9. Km atual da viatura ───────────────────────────────────────────────────
-- Maior leitura conhecida: abastecimentos, manutenções e checklists
CREATE OR REPLACE FUNCTION public.km_atual_veiculo(p_veiculo_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(
    (SELECT MAX(contador)     FROM public.comb_abastecimentos WHERE veiculo_id = p_veiculo_id),
    (SELECT MAX(km_na_altura) FROM public.veiculo_manutencoes WHERE veiculo_id = p_veiculo_id),
    (SELECT MAX(km_na_altura) FROM public.veiculo_checklists  WHERE veiculo_id = p_veiculo_id)
  )
$$;

REVOKE ALL     ON FUNCTION public.km_atual_veiculo(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.km_atual_veiculo(uuid) TO authenticated;

-- ── 10. Alertas por item ─────────────────────────────────────────────────────
INSERT INTO public.regras_alerta (tipo, entidade_alvo, campo_ref, destinatarios)
SELECT 'FROTA_ITEM', 'frota_item', 'frota_veiculo_itens.proxima_km / proxima_data', ARRAY['admin', 'gestor', 'mecanico']
WHERE NOT EXISTS (SELECT 1 FROM public.regras_alerta WHERE tipo = 'FROTA_ITEM');

-- Avalia um item de uma viatura e cria/atualiza/resolve o alerta. Devolve a
-- severidade (NULL = sem alerta). Uso interno: sem EXECUTE para ninguém.
CREATE OR REPLACE FUNCTION public._avaliar_frota_item(p_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_regra       uuid;
  v_veiculo     uuid;
  v_monitorizar boolean;
  v_prox_km     numeric;
  v_prox_data   date;
  v_at_km       numeric;
  v_urg_km      numeric;
  v_at_dias     integer;
  v_urg_dias    integer;
  v_km          numeric;
  v_faltam_km   numeric;
  v_faltam_dias integer;
  v_sev_km      text;
  v_sev_dias    text;
  v_sev         text;
BEGIN
  SELECT id INTO v_regra FROM public.regras_alerta WHERE tipo = 'FROTA_ITEM' ORDER BY criada_em LIMIT 1;
  IF v_regra IS NULL THEN RETURN NULL; END IF;

  SELECT fvi.veiculo_id, (fvi.ativo AND c.ativo AND v.ativo AND c.natureza = 'MANUTENCAO'),
         fvi.proxima_km, fvi.proxima_data,
         c.limiar_atencao_km, c.limiar_urgente_km, c.limiar_atencao_dias, c.limiar_urgente_dias
    INTO v_veiculo, v_monitorizar, v_prox_km, v_prox_data, v_at_km, v_urg_km, v_at_dias, v_urg_dias
    FROM public.frota_veiculo_itens fvi
    JOIN public.frota_itens_catalogo c ON c.id = fvi.item_id
    JOIN public.comb_veiculos        v ON v.id = fvi.veiculo_id
   WHERE fvi.id = p_id;

  IF NOT FOUND OR NOT v_monitorizar OR (v_prox_km IS NULL AND v_prox_data IS NULL) THEN
    PERFORM public._upsert_alerta(v_regra, p_id, NULL, NULL, NULL);
    RETURN NULL;
  END IF;

  IF v_prox_km IS NOT NULL THEN
    v_km := public.km_atual_veiculo(v_veiculo);
    IF v_km IS NOT NULL THEN
      v_faltam_km := v_prox_km - v_km;
      v_sev_km := CASE WHEN v_faltam_km <= v_urg_km THEN 'URGENTE'
                       WHEN v_faltam_km <= v_at_km  THEN 'ATENCAO' END;
    END IF;
  END IF;

  IF v_prox_data IS NOT NULL THEN
    v_faltam_dias := v_prox_data - CURRENT_DATE;
    v_sev_dias := CASE WHEN v_faltam_dias <= v_urg_dias THEN 'URGENTE'
                       WHEN v_faltam_dias <= v_at_dias  THEN 'ATENCAO' END;
  END IF;

  v_sev := CASE WHEN v_sev_km = 'URGENTE' OR v_sev_dias = 'URGENTE' THEN 'URGENTE'
                WHEN v_sev_km = 'ATENCAO' OR v_sev_dias = 'ATENCAO' THEN 'ATENCAO' END;

  IF v_sev IS NULL THEN
    PERFORM public._upsert_alerta(v_regra, p_id, NULL, NULL, NULL);
  ELSIF v_sev_km IS NOT DISTINCT FROM v_sev THEN
    -- valor_atual = km que faltam (negativo = já passou); valor_limiar = km do prazo
    PERFORM public._upsert_alerta(v_regra, p_id, v_sev, v_faltam_km, v_prox_km);
  ELSE
    -- valor_atual = dias que faltam (negativo = já passou)
    PERFORM public._upsert_alerta(v_regra, p_id, v_sev, v_faltam_dias, NULL);
  END IF;
  RETURN v_sev;
END;
$$;

REVOKE ALL ON FUNCTION public._avaliar_frota_item(uuid) FROM PUBLIC, anon, authenticated;

-- Avaliação completa (ou só de uma viatura). Chamada pelo pg_cron, pela Edge
-- Function send-push-frota (antes de enviar) e pelo botão "Avaliar agora".
CREATE OR REPLACE FUNCTION public.avaliar_frota(p_veiculo_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id    uuid;
  v_total integer := 0;
BEGIN
  -- Sem sessão (pg_cron / papel de serviço): permitido; anon não tem EXECUTE
  IF auth.uid() IS NOT NULL AND NOT public.pode_escrever('frota') THEN
    RAISE EXCEPTION 'Sem permissão para avaliar a frota';
  END IF;

  FOR v_id IN
    SELECT id FROM public.frota_veiculo_itens
     WHERE p_veiculo_id IS NULL OR veiculo_id = p_veiculo_id
  LOOP
    IF public._avaliar_frota_item(v_id) IS NOT NULL THEN
      v_total := v_total + 1;
    END IF;
  END LOOP;
  RETURN v_total;
END;
$$;

REVOKE ALL     ON FUNCTION public.avaliar_frota(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.avaliar_frota(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.avaliar_frota(uuid) TO service_role;

-- Novo abastecimento com contador → reavaliar os prazos em km dessa viatura.
-- Nunca pode partir o combustível: qualquer erro fica só como aviso.
CREATE OR REPLACE FUNCTION public._frota_apos_abastecimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NEW.contador IS NOT NULL THEN
    BEGIN
      FOR v_id IN SELECT id FROM public.frota_veiculo_itens WHERE veiculo_id = NEW.veiculo_id LOOP
        PERFORM public._avaliar_frota_item(v_id);
      END LOOP;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'frota: reavaliação após abastecimento falhou: %', SQLERRM;
    END;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._frota_apos_abastecimento() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_frota_apos_abastecimento ON public.comb_abastecimentos;
CREATE TRIGGER trg_frota_apos_abastecimento
  AFTER INSERT OR UPDATE OF contador ON public.comb_abastecimentos
  FOR EACH ROW EXECUTE FUNCTION public._frota_apos_abastecimento();

-- ── 11. RPCs de escrita ──────────────────────────────────────────────────────

-- Ligar/desligar um item do catálogo a uma viatura e definir os prazos
CREATE OR REPLACE FUNCTION public.configurar_item_veiculo(
  p_veiculo_id      uuid,
  p_item_id         uuid,
  p_ativo           boolean,
  p_intervalo_km    numeric,
  p_intervalo_meses integer,
  p_proxima_km      numeric,
  p_proxima_data    date
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.pode_escrever('frota') THEN
    RAISE EXCEPTION 'Sem permissão para configurar a frota';
  END IF;

  INSERT INTO public.frota_veiculo_itens AS f
    (veiculo_id, item_id, ativo, intervalo_km, intervalo_meses, proxima_km, proxima_data, atualizado_por)
  VALUES
    (p_veiculo_id, p_item_id, COALESCE(p_ativo, true), p_intervalo_km, p_intervalo_meses, p_proxima_km, p_proxima_data, auth.uid())
  ON CONFLICT (veiculo_id, item_id) DO UPDATE SET
    ativo           = EXCLUDED.ativo,
    intervalo_km    = EXCLUDED.intervalo_km,
    intervalo_meses = EXCLUDED.intervalo_meses,
    proxima_km      = EXCLUDED.proxima_km,
    proxima_data    = EXCLUDED.proxima_data,
    atualizado_por  = EXCLUDED.atualizado_por,
    atualizado_em   = now()
  RETURNING f.id INTO v_id;

  PERFORM public._avaliar_frota_item(v_id);
  RETURN v_id;
END;
$$;

-- Registar uma manutenção. Se atualiza_proxima e houver item do catálogo,
-- o próximo prazo avança a partir do intervalo (da viatura ou do catálogo);
-- p_proxima_data explícita tem prioridade (ex.: seguro renovado até X).
CREATE OR REPLACE FUNCTION public.registar_manutencao(
  p_veiculo_id   uuid,
  p_item_id      uuid,
  p_descricao    text,
  p_data         date,
  p_km           numeric,
  p_custo        numeric,
  p_oficina      text,
  p_observacoes  text,
  p_atualiza     boolean,
  p_proxima_data date DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id        uuid;
  v_fvi       uuid;
  v_int_km    numeric;
  v_int_meses integer;
  v_nova_km   numeric;
  v_nova_data date;
BEGIN
  IF NOT public.pode_escrever('frota') THEN
    RAISE EXCEPTION 'Sem permissão para registar manutenções';
  END IF;
  IF p_data IS NULL OR p_data > CURRENT_DATE THEN
    RAISE EXCEPTION 'A data da manutenção não pode ser futura';
  END IF;

  IF COALESCE(p_atualiza, true) AND p_item_id IS NOT NULL THEN
    SELECT COALESCE(fvi.intervalo_km, c.intervalo_km_padrao), COALESCE(fvi.intervalo_meses, c.intervalo_meses_padrao)
      INTO v_int_km, v_int_meses
      FROM public.frota_itens_catalogo c
      LEFT JOIN public.frota_veiculo_itens fvi ON fvi.item_id = c.id AND fvi.veiculo_id = p_veiculo_id
     WHERE c.id = p_item_id;

    IF v_int_km IS NOT NULL AND p_km IS NULL THEN
      RAISE EXCEPTION 'Indique os km da viatura: este item tem prazo em km';
    END IF;
  END IF;

  INSERT INTO public.veiculo_manutencoes
    (veiculo_id, item_id, descricao, data, km_na_altura, custo, oficina, observacoes, atualiza_proxima, condutor_id)
  VALUES (
    p_veiculo_id, p_item_id, NULLIF(btrim(p_descricao), ''), p_data, p_km, p_custo,
    NULLIF(btrim(p_oficina), ''), NULLIF(btrim(p_observacoes), ''), COALESCE(p_atualiza, true),
    (SELECT colaborador_id FROM public.veiculo_atribuicoes WHERE veiculo_id = p_veiculo_id AND ate IS NULL)
  )
  RETURNING id INTO v_id;

  IF COALESCE(p_atualiza, true) AND p_item_id IS NOT NULL THEN
    v_nova_km   := CASE WHEN v_int_km IS NOT NULL THEN p_km + v_int_km END;
    v_nova_data := COALESCE(p_proxima_data,
                     CASE WHEN v_int_meses IS NOT NULL THEN (p_data + make_interval(months => v_int_meses))::date END);

    INSERT INTO public.frota_veiculo_itens AS f
      (veiculo_id, item_id, ativo, ultima_km, ultima_data, proxima_km, proxima_data, atualizado_por)
    VALUES (p_veiculo_id, p_item_id, true, p_km, p_data, v_nova_km, v_nova_data, auth.uid())
    ON CONFLICT (veiculo_id, item_id) DO UPDATE SET
      ativo          = true,
      ultima_km      = EXCLUDED.ultima_km,
      ultima_data    = EXCLUDED.ultima_data,
      -- sem intervalo não há como calcular: o prazo anterior mantém-se
      proxima_km     = COALESCE(EXCLUDED.proxima_km, f.proxima_km),
      proxima_data   = COALESCE(EXCLUDED.proxima_data, f.proxima_data),
      atualizado_por = EXCLUDED.atualizado_por,
      atualizado_em  = now()
    -- registar uma manutenção antiga depois de uma mais recente não recua o prazo
    WHERE f.ultima_data IS NULL OR f.ultima_data <= EXCLUDED.ultima_data
    RETURNING f.id INTO v_fvi;

    IF v_fvi IS NOT NULL THEN
      PERFORM public._avaliar_frota_item(v_fvi);
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

-- Registar um checklist. O texto e a categoria de cada item vêm do catálogo
-- (não do cliente); o estado geral é o pior item.
CREATE OR REPLACE FUNCTION public.registar_checklist(
  p_veiculo_id  uuid,
  p_data        date,
  p_km          numeric,
  p_itens       jsonb,
  p_observacoes text,
  p_foto_keys   text[] DEFAULT '{}'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id         uuid;
  v_enviados   integer;
  v_validos    integer;
  v_distintos  integer;
  v_snapshot   jsonb;
  v_geral      text;
  v_foto       text;
BEGIN
  IF NOT public.pode_escrever('frota') THEN
    RAISE EXCEPTION 'Sem permissão para registar checklists';
  END IF;
  IF p_data IS NULL OR p_data > CURRENT_DATE THEN
    RAISE EXCEPTION 'A data do checklist não pode ser futura';
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'O checklist precisa de pelo menos um item';
  END IF;

  v_enviados := jsonb_array_length(p_itens);

  WITH enviados AS (
    SELECT e, ord
      FROM jsonb_array_elements(p_itens) WITH ORDINALITY AS t(e, ord)
  ), juntos AS (
    SELECT c.id, c.chave, c.rotulo, c.categoria, e->>'estado' AS estado,
           NULLIF(btrim(e->>'observacao'), '') AS observacao, ord
      FROM enviados
      JOIN public.frota_itens_catalogo c
        ON c.id::text = e->>'item_id'
     WHERE e->>'estado' IN ('OK', 'ATENCAO', 'MAU')
  )
  SELECT count(*), count(DISTINCT id),
         jsonb_agg(jsonb_build_object(
           'item_id', id, 'chave', chave, 'rotulo', rotulo, 'categoria', categoria,
           'estado', estado, 'observacao', observacao) ORDER BY ord),
         CASE WHEN bool_or(estado = 'MAU') THEN 'MAU'
              WHEN bool_or(estado = 'ATENCAO') THEN 'ATENCAO'
              ELSE 'OK' END
    INTO v_validos, v_distintos, v_snapshot, v_geral
    FROM juntos;

  IF v_validos <> v_enviados THEN
    RAISE EXCEPTION 'Checklist com item desconhecido ou estado inválido';
  END IF;
  IF v_distintos <> v_validos THEN
    RAISE EXCEPTION 'Checklist com o mesmo item repetido';
  END IF;

  -- Fotos: só da pasta desta viatura no bucket frota-checklists
  FOREACH v_foto IN ARRAY COALESCE(p_foto_keys, '{}') LOOP
    IF v_foto !~ ('^' || p_veiculo_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|heic|heif)$') THEN
      RAISE EXCEPTION 'Foto inválida para esta viatura';
    END IF;
  END LOOP;

  INSERT INTO public.veiculo_checklists
    (veiculo_id, data, km_na_altura, itens, estado_geral, observacoes, foto_keys, condutor_id)
  VALUES (
    p_veiculo_id, p_data, p_km, v_snapshot, v_geral, NULLIF(btrim(p_observacoes), ''),
    COALESCE(p_foto_keys, '{}'),
    (SELECT colaborador_id FROM public.veiculo_atribuicoes WHERE veiculo_id = p_veiculo_id AND ate IS NULL)
  )
  RETURNING id INTO v_id;

  -- km do checklist pode ser a leitura mais recente da viatura
  IF p_km IS NOT NULL THEN
    PERFORM public._avaliar_frota_item(f.id) FROM public.frota_veiculo_itens f WHERE f.veiculo_id = p_veiculo_id;
  END IF;

  RETURN v_id;
END;
$$;

-- Passar a viatura a outro condutor (fecha a atribuição anterior na mesma
-- transação). p_colaborador_id NULL = viatura devolvida, sem condutor.
CREATE OR REPLACE FUNCTION public.atribuir_condutor(
  p_veiculo_id     uuid,
  p_colaborador_id uuid,
  p_desde          date DEFAULT CURRENT_DATE
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_atual_id    uuid;
  v_atual_colab uuid;
  v_id          uuid;
BEGIN
  IF NOT public.pode_escrever('frota') THEN
    RAISE EXCEPTION 'Sem permissão para atribuir viaturas';
  END IF;
  IF p_desde IS NULL OR p_desde > CURRENT_DATE THEN
    RAISE EXCEPTION 'A data da atribuição não pode ser futura';
  END IF;

  -- Serializa atribuições concorrentes da mesma viatura
  PERFORM 1 FROM public.comb_veiculos WHERE id = p_veiculo_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Viatura não encontrada';
  END IF;

  SELECT id, colaborador_id INTO v_atual_id, v_atual_colab
    FROM public.veiculo_atribuicoes
   WHERE veiculo_id = p_veiculo_id AND ate IS NULL;

  IF v_atual_id IS NOT NULL AND v_atual_colab IS NOT DISTINCT FROM p_colaborador_id THEN
    RETURN v_atual_id;
  END IF;

  IF v_atual_id IS NOT NULL THEN
    UPDATE public.veiculo_atribuicoes SET ate = p_desde WHERE id = v_atual_id;
  END IF;

  IF p_colaborador_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.veiculo_atribuicoes (veiculo_id, colaborador_id, desde)
  VALUES (p_veiculo_id, p_colaborador_id, p_desde)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.configurar_item_veiculo(uuid, uuid, boolean, numeric, integer, numeric, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registar_manutencao(uuid, uuid, text, date, numeric, numeric, text, text, boolean, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registar_checklist(uuid, date, numeric, jsonb, text, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.atribuir_condutor(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.configurar_item_veiculo(uuid, uuid, boolean, numeric, integer, numeric, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registar_manutencao(uuid, uuid, text, date, numeric, numeric, text, text, boolean, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registar_checklist(uuid, date, numeric, jsonb, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atribuir_condutor(uuid, uuid, date) TO authenticated;

-- Lista da frota numa só consulta (sem um pedido por viatura)
CREATE OR REPLACE FUNCTION public.frota_resumo_viaturas()
RETURNS TABLE (
  id uuid, codigo text, nome text, identificacao text, tipo text, unidade_contador text,
  km_atual numeric, condutor_id uuid, condutor_nome text,
  alertas_urgentes integer, alertas_atencao integer,
  ultimo_checklist_data date, ultimo_checklist_estado text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT v.id, v.codigo, v.nome, v.identificacao, v.tipo, v.unidade_contador,
         public.km_atual_veiculo(v.id),
         at.colaborador_id, c.nome,
         COALESCE(al.urgentes, 0), COALESCE(al.atencao, 0),
         ck.data, ck.estado_geral
    FROM public.comb_veiculos v
    LEFT JOIN public.veiculo_atribuicoes at ON at.veiculo_id = v.id AND at.ate IS NULL
    LEFT JOIN public.colaboradores c ON c.id = at.colaborador_id
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE a.severidade = 'URGENTE')::int AS urgentes,
             count(*) FILTER (WHERE a.severidade = 'ATENCAO')::int AS atencao
        FROM public.alertas a
        JOIN public.regras_alerta r       ON r.id = a.regra_id AND r.tipo = 'FROTA_ITEM'
        JOIN public.frota_veiculo_itens f ON f.id = a.entidade_id
       WHERE f.veiculo_id = v.id AND a.estado IN ('ATIVO', 'RECONHECIDO')
    ) al ON true
    LEFT JOIN LATERAL (
      SELECT data, estado_geral FROM public.veiculo_checklists
       WHERE veiculo_id = v.id ORDER BY data DESC, criado_em DESC LIMIT 1
    ) ck ON true
   WHERE v.ativo
   ORDER BY v.nome
$$;

REVOKE ALL     ON FUNCTION public.frota_resumo_viaturas() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.frota_resumo_viaturas() TO authenticated;

-- ── 12. Fotos dos checklists ─────────────────────────────────────────────────
-- Mesmo modelo do combustivel-taloes: leitura pelo URL público, sem listagem;
-- upload só por quem escreve na frota, para a pasta de uma viatura existente.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('frota-checklists', 'frota-checklists', true, 10485760,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.foto_frota_valida(p_nome text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.pode_escrever('frota')
     AND p_nome ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|heic|heif)$'
     AND EXISTS (SELECT 1 FROM public.comb_veiculos v WHERE v.id::text = split_part(p_nome, '/', 1))
$$;

REVOKE ALL     ON FUNCTION public.foto_frota_valida(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.foto_frota_valida(text) TO authenticated;

DROP POLICY IF EXISTS "frota_upload_checklist" ON storage.objects;
CREATE POLICY "frota_upload_checklist" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'frota-checklists' AND public.foto_frota_valida(name));

-- ── 13. Nome legível dos alertas de frota na página de Alertas ──────────────
CREATE OR REPLACE VIEW public.alertas_detalhados AS
SELECT
  a.id,
  a.regra_id,
  a.entidade_id,
  a.estado,
  a.severidade,
  a.valor_atual,
  a.valor_limiar,
  a.criado_em,
  a.atualizado_em,
  a.reconhecido_por,
  a.reconhecido_em,
  a.resolvido_por,
  a.resolvido_em,
  r.tipo         AS regra_tipo,
  r.entidade_alvo,
  r.campo_ref,
  r.limiar_atencao,
  r.limiar_urgente,
  CASE r.entidade_alvo
    WHEN 'viatura'     THEN v.nome
    WHEN 'colaborador' THEN c.nome
    WHEN 'frota_item'  THEN fv.nome
    ELSE NULL
  END AS entidade_nome,
  CASE r.entidade_alvo
    WHEN 'viatura'     THEN v.identificacao
    WHEN 'frota_item'  THEN fc.rotulo
    ELSE NULL
  END AS entidade_detalhe
FROM public.alertas a
JOIN public.regras_alerta r ON r.id = a.regra_id
LEFT JOIN public.comb_veiculos v
  ON v.id = a.entidade_id AND r.entidade_alvo = 'viatura'
LEFT JOIN public.colaboradores c
  ON c.id = a.entidade_id AND r.entidade_alvo = 'colaborador'
LEFT JOIN public.frota_veiculo_itens fi
  ON fi.id = a.entidade_id AND r.entidade_alvo = 'frota_item'
LEFT JOIN public.comb_veiculos fv ON fv.id = fi.veiculo_id
LEFT JOIN public.frota_itens_catalogo fc ON fc.id = fi.item_id;

GRANT SELECT ON public.alertas_detalhados TO authenticated;
GRANT SELECT ON public.alertas_detalhados TO service_role;

-- ── 14. Catálogo inicial (lista do mecânico — editável depois na app) ────────
INSERT INTO public.frota_itens_catalogo
  (chave, rotulo, categoria, natureza, intervalo_km_padrao, intervalo_meses_padrao,
   limiar_atencao_dias, limiar_urgente_dias, ordem)
VALUES
  -- Nível 1 — inspeção rápida (semanal / antes de sair)
  ('oleo_motor_nivel',      'Nível de óleo do motor',                               'INSPECAO_RAPIDA', 'CHECKLIST', NULL, NULL, 30, 7, 10),
  ('liquido_refrigeracao',  'Líquido de refrigeração',                              'INSPECAO_RAPIDA', 'CHECKLIST', NULL, NULL, 30, 7, 20),
  ('liquido_travoes_nivel', 'Líquido de travões (nível)',                           'INSPECAO_RAPIDA', 'CHECKLIST', NULL, NULL, 30, 7, 30),
  ('liquido_lava_vidros',   'Líquido do lava-vidros',                               'INSPECAO_RAPIDA', 'CHECKLIST', NULL, NULL, 30, 7, 40),
  ('pneus_visual',          'Pneus: pressão e estado visual (cortes, bolhas, desgaste)', 'INSPECAO_RAPIDA', 'CHECKLIST', NULL, NULL, 30, 7, 50),
  ('luzes',                 'Luzes: médios, máximos, piscas, travão, marcha-atrás, nevoeiro', 'INSPECAO_RAPIDA', 'CHECKLIST', NULL, NULL, 30, 7, 60),
  ('limpa_para_brisas',     'Limpa-para-brisas e escovas',                          'INSPECAO_RAPIDA', 'CHECKLIST', NULL, NULL, 30, 7, 70),
  ('buzina',                'Buzina',                                               'INSPECAO_RAPIDA', 'CHECKLIST', NULL, NULL, 30, 7, 80),
  ('avisos_painel',         'Avisos no painel (motor, ABS, airbag, pressão pneus)', 'INSPECAO_RAPIDA', 'CHECKLIST', NULL, NULL, 30, 7, 90),
  ('fugas_visiveis',        'Fugas visíveis por baixo do veículo',                  'INSPECAO_RAPIDA', 'CHECKLIST', NULL, NULL, 30, 7, 100),
  ('documentos_a_bordo',    'Documentos a bordo (DUA, seguro, carta de condução)',  'INSPECAO_RAPIDA', 'CHECKLIST', NULL, NULL, 30, 7, 110),
  ('limpeza_interior',      'Limpeza do interior',                                  'INSPECAO_RAPIDA', 'CHECKLIST', NULL, NULL, 30, 7, 120),
  ('limpeza_exterior',      'Limpeza do exterior',                                  'INSPECAO_RAPIDA', 'CHECKLIST', NULL, NULL, 30, 7, 130),
  ('danos_carrocaria',      'Danos novos na carroçaria (riscos, amolgadelas)',      'INSPECAO_RAPIDA', 'CHECKLIST', NULL, NULL, 30, 7, 140),
  ('triangulo_colete',      'Triângulo e colete refletor a bordo',                  'INSPECAO_RAPIDA', 'CHECKLIST', NULL, NULL, 30, 7, 150),
  ('adblue_nivel',          'AdBlue: nível (se tiver SCR)',                         'INSPECAO_RAPIDA', 'CHECKLIST', NULL, NULL, 30, 7, 160),

  -- Nível 2 — revisão periódica (oficina, por km/tempo)
  ('revisao_geral',         'Revisão geral (oficina)',                              'REVISAO_PERIODICA', 'MANUTENCAO', 15000, 12, 30, 7, 200),
  ('oleo_motor_filtro',     'Óleo do motor + filtro de óleo',                       'REVISAO_PERIODICA', 'MANUTENCAO', 15000, 12, 30, 7, 210),
  ('filtro_ar',             'Filtro de ar',                                         'REVISAO_PERIODICA', 'MANUTENCAO', 30000, 24, 30, 7, 220),
  ('filtro_combustivel',    'Filtro de combustível',                                'REVISAO_PERIODICA', 'MANUTENCAO', 30000, 24, 30, 7, 230),
  ('filtro_habitaculo',     'Filtro de habitáculo',                                 'REVISAO_PERIODICA', 'MANUTENCAO', 15000, 12, 30, 7, 240),
  ('travoes_pastilhas_discos', 'Travões: pastilhas e discos (medir desgaste)',     'REVISAO_PERIODICA', 'MANUTENCAO', 15000, 12, 30, 7, 250),
  ('travoes_tambores',      'Travões: tambores/sapatas (eixo traseiro)',            'REVISAO_PERIODICA', 'MANUTENCAO', 30000, 24, 30, 7, 260),
  ('liquido_travoes_troca', 'Líquido de travões (substituir)',                      'REVISAO_PERIODICA', 'MANUTENCAO', NULL,  24, 30, 7, 270),
  ('liquido_refrigeracao_troca', 'Líquido de refrigeração (verificar/substituir)',  'REVISAO_PERIODICA', 'MANUTENCAO', NULL,  24, 30, 7, 280),
  ('pneus_revisao',         'Pneus: profundidade do piso, alinhamento, rotação',    'REVISAO_PERIODICA', 'MANUTENCAO', 15000, 12, 30, 7, 290),
  ('amortecedores',         'Amortecedores e suspensão (folgas e fugas)',           'REVISAO_PERIODICA', 'MANUTENCAO', 30000, 24, 30, 7, 300),
  ('direcao',               'Direção: rótulas, terminais, caixa',                   'REVISAO_PERIODICA', 'MANUTENCAO', 30000, 24, 30, 7, 310),
  ('bateria',               'Bateria: carga e terminais',                           'REVISAO_PERIODICA', 'MANUTENCAO', NULL,  12, 30, 7, 320),
  ('correias_acessorios',   'Correias de acessórios',                               'REVISAO_PERIODICA', 'MANUTENCAO', 30000, 24, 30, 7, 330),
  ('escape',                'Escape: fugas e fixações',                             'REVISAO_PERIODICA', 'MANUTENCAO', 30000, 24, 30, 7, 340),
  ('caixa_diferencial_nivel', 'Caixa de velocidades / diferencial: nível e fugas',  'REVISAO_PERIODICA', 'MANUTENCAO', 30000, 24, 30, 7, 350),
  ('chassis',               'Cintas, pára-choques e chassis: ferrugem e danos',     'REVISAO_PERIODICA', 'MANUTENCAO', NULL,  12, 30, 7, 360),

  -- Nível 3 — longo prazo
  ('correia_distribuicao',  'Correia de distribuição (ou corrente)',                'LONGO_PRAZO', 'MANUTENCAO', 150000, 84, 60, 14, 400),
  ('oleo_caixa_velocidades', 'Óleo da caixa de velocidades',                        'LONGO_PRAZO', 'MANUTENCAO', 60000,  48, 60, 14, 410),
  ('velas',                 'Velas / pré-aquecimento',                              'LONGO_PRAZO', 'MANUTENCAO', 60000,  48, 60, 14, 420),
  ('fap_egr',               'Filtro de partículas (FAP/DPF) e válvula EGR',         'LONGO_PRAZO', 'MANUTENCAO', 120000, NULL, 60, 14, 430),
  ('adblue_sistema',        'AdBlue: qualidade e sistema SCR',                      'LONGO_PRAZO', 'MANUTENCAO', NULL,   24, 60, 14, 440),
  ('ar_condicionado',       'Ar condicionado (recarga/desinfeção)',                 'LONGO_PRAZO', 'MANUTENCAO', NULL,   24, 60, 14, 450),

  -- Obrigações legais (alertas por data)
  ('ipo',                   'Inspeção Periódica Obrigatória (IPO)',                 'OBRIGACAO_LEGAL', 'MANUTENCAO', NULL, 12, 45, 14, 500),
  ('seguro',                'Seguro (validade)',                                    'OBRIGACAO_LEGAL', 'MANUTENCAO', NULL, 12, 30, 7,  510),
  ('iuc',                   'Selo / IUC',                                           'OBRIGACAO_LEGAL', 'MANUTENCAO', NULL, 12, 30, 7,  520),
  ('cartao_transportador',  'Cartão de transportador / licença',                    'OBRIGACAO_LEGAL', 'MANUTENCAO', NULL, NULL, 60, 14, 530),
  ('tacografo',             'Tacógrafo: calibração/inspeção',                       'OBRIGACAO_LEGAL', 'MANUTENCAO', NULL, 24, 60, 14, 540),
  ('extintor',              'Extintor (validade)',                                  'OBRIGACAO_LEGAL', 'MANUTENCAO', NULL, 12, 30, 7,  550)
ON CONFLICT (chave) DO NOTHING;

-- ── 15. Dados existentes: colunas fixas de comb_veiculos → frota ────────────
-- revisão → revisao_geral, seguro → seguro, IPO → ipo. As colunas antigas não
-- são apagadas; deixam de ser editadas pela app (a ficha da viatura aponta
-- para a Frota).
INSERT INTO public.frota_veiculo_itens (veiculo_id, item_id, intervalo_km, intervalo_meses, proxima_km, proxima_data)
SELECT v.id, c.id, v.intervalo_revisao_km, v.intervalo_revisao_meses, v.proxima_revisao_km, v.proxima_revisao_data
  FROM public.comb_veiculos v
  JOIN public.frota_itens_catalogo c ON c.chave = 'revisao_geral'
 WHERE v.proxima_revisao_km IS NOT NULL OR v.proxima_revisao_data IS NOT NULL
    OR v.intervalo_revisao_km IS NOT NULL OR v.intervalo_revisao_meses IS NOT NULL
ON CONFLICT (veiculo_id, item_id) DO NOTHING;

INSERT INTO public.frota_veiculo_itens (veiculo_id, item_id, proxima_data)
SELECT v.id, c.id, v.data_fim_seguro
  FROM public.comb_veiculos v
  JOIN public.frota_itens_catalogo c ON c.chave = 'seguro'
 WHERE v.data_fim_seguro IS NOT NULL
ON CONFLICT (veiculo_id, item_id) DO NOTHING;

INSERT INTO public.frota_veiculo_itens (veiculo_id, item_id, proxima_data)
SELECT v.id, c.id, v.data_proxima_ipo
  FROM public.comb_veiculos v
  JOIN public.frota_itens_catalogo c ON c.chave = 'ipo'
 WHERE v.data_proxima_ipo IS NOT NULL
ON CONFLICT (veiculo_id, item_id) DO NOTHING;

-- As 4 regras antigas passariam a gerar alertas em duplicado
UPDATE public.alertas SET estado = 'RESOLVIDO', resolvido_em = now()
 WHERE estado = 'ATIVO'
   AND regra_id IN (SELECT id FROM public.regras_alerta
                     WHERE tipo IN ('REVISAO_KM', 'REVISAO_DATA', 'SEGURO', 'IPO'));
UPDATE public.regras_alerta SET ativa = false
 WHERE tipo IN ('REVISAO_KM', 'REVISAO_DATA', 'SEGURO', 'IPO');

SELECT public.avaliar_frota();

-- ── 16. Avaliação diária (datas avançam sem ninguém mexer) ──────────────────
DO $outer$
BEGIN
  PERFORM cron.schedule('avaliar-frota-diario', '5 6 * * *', 'SELECT public.avaliar_frota()');
EXCEPTION WHEN others THEN
  RAISE NOTICE 'pg_cron indisponível — a Edge Function send-push-frota também avalia antes de enviar.';
END;
$outer$;
