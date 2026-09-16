-- supabase/migrations/20260916180000_fase4_epis_formacoes.sql
-- Fase 4 — EPIs e Formações (requer F0 Colaboradores + F1 Alertas)

-- ── Tipos de EPI ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tipos_epi (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  designacao    text NOT NULL,
  validade_dias int,       -- null = sem validade periódica
  obrigatorio   boolean    DEFAULT true
);

-- ── Atribuições de EPI ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.atribuicoes_epi (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  uuid NOT NULL REFERENCES colaboradores(id),
  tipo_epi_id     uuid NOT NULL REFERENCES tipos_epi(id),
  data_entrega    date NOT NULL,
  data_validade   date,        -- calculada via trigger: data_entrega + validade_dias
  devolvido       boolean      DEFAULT false,
  data_devolucao  date,
  regra_alerta_id uuid         REFERENCES regras_alerta(id)  -- preenchido via trigger
);

CREATE INDEX IF NOT EXISTS idx_atrib_epi_colab ON atribuicoes_epi(colaborador_id);

-- Calcula data_validade e cria regra_alerta quando atribuicao tem validade
CREATE OR REPLACE FUNCTION fn_epi_antes_inserir()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_dias      int;
  v_regra_id  uuid;
BEGIN
  -- Calcular data_validade a partir do tipo de EPI
  SELECT validade_dias INTO v_dias FROM tipos_epi WHERE id = NEW.tipo_epi_id;
  IF v_dias IS NOT NULL THEN
    NEW.data_validade := NEW.data_entrega + (v_dias || ' days')::interval;
  END IF;

  -- Criar regra de alerta automática para EPIs com validade
  IF NEW.data_validade IS NOT NULL THEN
    INSERT INTO regras_alerta (
      tipo, entidade_alvo, entidade_id, campo_ref,
      limiar_atencao, limiar_urgente, destinatarios
    ) VALUES (
      'EPI_VALIDADE', 'colaborador', NEW.id, 'data_validade',
      30, 7, ARRAY['admin', 'gestor']
    ) RETURNING id INTO v_regra_id;
    NEW.regra_alerta_id := v_regra_id;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_epi_antes_inserir ON atribuicoes_epi;
CREATE TRIGGER trg_epi_antes_inserir
  BEFORE INSERT ON atribuicoes_epi
  FOR EACH ROW EXECUTE FUNCTION fn_epi_antes_inserir();

-- Desativa regra_alerta e resolve alertas quando EPI é devolvido
CREATE OR REPLACE FUNCTION fn_epi_depois_atualizar()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.devolvido = true AND OLD.devolvido = false AND NEW.regra_alerta_id IS NOT NULL THEN
    UPDATE regras_alerta SET ativa = false WHERE id = NEW.regra_alerta_id;
    UPDATE alertas SET estado = 'RESOLVIDO', resolvido_em = now()
     WHERE regra_id = NEW.regra_alerta_id AND estado IN ('ATIVO', 'RECONHECIDO');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_epi_depois_atualizar ON atribuicoes_epi;
CREATE TRIGGER trg_epi_depois_atualizar
  AFTER UPDATE ON atribuicoes_epi
  FOR EACH ROW EXECUTE FUNCTION fn_epi_depois_atualizar();

-- ── Tipos de Formação ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tipos_formacao (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  designacao    text NOT NULL,
  validade_anos int,       -- null = vitalício (não gera alerta)
  obrigatoria   boolean    DEFAULT false
);

-- ── Formações por colaborador ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.formacoes_colaborador (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  uuid NOT NULL REFERENCES colaboradores(id),
  tipo_id         uuid NOT NULL REFERENCES tipos_formacao(id),
  data_conclusao  date NOT NULL,
  data_validade   date,        -- calculada via trigger
  certificado_key text,        -- bucket 'certificados' (RLS: authenticated lê)
  entidade        text,        -- entidade formadora
  regra_alerta_id uuid         REFERENCES regras_alerta(id)
);

CREATE INDEX IF NOT EXISTS idx_form_colab ON formacoes_colaborador(colaborador_id);

-- Calcula data_validade e cria regra_alerta para formações com prazo
CREATE OR REPLACE FUNCTION fn_formacao_antes_inserir()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_anos      int;
  v_regra_id  uuid;
BEGIN
  SELECT validade_anos INTO v_anos FROM tipos_formacao WHERE id = NEW.tipo_id;

  -- Formação vitalícia (validade_anos IS NULL) → sem data_validade, sem alerta
  IF v_anos IS NOT NULL THEN
    NEW.data_validade := NEW.data_conclusao + (v_anos * 365 || ' days')::interval;

    INSERT INTO regras_alerta (
      tipo, entidade_alvo, entidade_id, campo_ref,
      limiar_atencao, limiar_urgente, destinatarios
    ) VALUES (
      'FORMACAO_VALIDADE', 'colaborador', NEW.id, 'data_validade',
      90, 30, ARRAY['admin', 'gestor']
    ) RETURNING id INTO v_regra_id;
    NEW.regra_alerta_id := v_regra_id;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_formacao_antes_inserir ON formacoes_colaborador;
CREATE TRIGGER trg_formacao_antes_inserir
  BEFORE INSERT ON formacoes_colaborador
  FOR EACH ROW EXECUTE FUNCTION fn_formacao_antes_inserir();

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.tipos_epi             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atribuicoes_epi       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipos_formacao        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formacoes_colaborador ENABLE ROW LEVEL SECURITY;

-- Tipos: leitura para todos, escrita para gestor/admin
DROP POLICY IF EXISTS "tipos_epi_sel"   ON public.tipos_epi;
DROP POLICY IF EXISTS "tipos_epi_write" ON public.tipos_epi;
CREATE POLICY "tipos_epi_sel"   ON tipos_epi FOR SELECT TO authenticated USING (true);
CREATE POLICY "tipos_epi_write" ON tipos_epi FOR ALL    TO authenticated
  USING (public.auth_role() IN ('admin', 'gestor'));

-- Atribuições: leitura para todos, escrita para gestor/admin
DROP POLICY IF EXISTS "atrib_epi_sel"   ON public.atribuicoes_epi;
DROP POLICY IF EXISTS "atrib_epi_write" ON public.atribuicoes_epi;
CREATE POLICY "atrib_epi_sel"   ON atribuicoes_epi FOR SELECT TO authenticated USING (true);
CREATE POLICY "atrib_epi_write" ON atribuicoes_epi FOR ALL    TO authenticated
  USING (public.auth_role() IN ('admin', 'gestor'));

-- Formações (mesmo padrão)
DROP POLICY IF EXISTS "tipos_form_sel"   ON public.tipos_formacao;
DROP POLICY IF EXISTS "tipos_form_write" ON public.tipos_formacao;
CREATE POLICY "tipos_form_sel"   ON tipos_formacao FOR SELECT TO authenticated USING (true);
CREATE POLICY "tipos_form_write" ON tipos_formacao FOR ALL    TO authenticated
  USING (public.auth_role() IN ('admin', 'gestor'));

DROP POLICY IF EXISTS "form_colab_sel"   ON public.formacoes_colaborador;
DROP POLICY IF EXISTS "form_colab_write" ON public.formacoes_colaborador;
CREATE POLICY "form_colab_sel"   ON formacoes_colaborador FOR SELECT TO authenticated USING (true);
CREATE POLICY "form_colab_write" ON formacoes_colaborador FOR ALL    TO authenticated
  USING (public.auth_role() IN ('admin', 'gestor'));

-- ── GRANTs ───────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON TABLE public.tipos_epi             TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.atribuicoes_epi       TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.tipos_formacao        TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.formacoes_colaborador TO authenticated;

-- ── Motor de alertas completo (F1 viaturas + F4 EPIs/Formações) ──────────────
-- NOTA: versão unificada — substitui o stub do F1 e a versão de viaturas do
-- 20260814120000_fix_avaliar_alertas_permission.sql, adicionando EPI_VALIDADE
-- e FORMACAO_VALIDADE. Deve ser a versão final em produção.

CREATE OR REPLACE FUNCTION public.avaliar_regras_alerta()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r          RECORD;
  v          RECORD;
  faltam     numeric;
  sev        text;
  v_data     date;
  v_dias     int;
  criados    int := 0;
BEGIN
  -- pg_cron / service key → auth.uid() IS NULL → permitir sempre
  IF auth.uid() IS NOT NULL AND public.auth_role() NOT IN ('admin', 'gestor') THEN
    RAISE EXCEPTION 'Sem permissão para avaliar regras de alerta';
  END IF;

  FOR r IN SELECT * FROM public.regras_alerta WHERE ativa = true LOOP

    -- ── REVISAO_KM ────────────────────────────────────────────────────────────
    IF r.tipo = 'REVISAO_KM' THEN
      FOR v IN
        SELECT cv.id, cv.proxima_revisao_km, MAX(ca.contador) AS km_atual
          FROM public.comb_veiculos cv
          LEFT JOIN public.comb_abastecimentos ca
            ON ca.veiculo_id = cv.id AND ca.contador IS NOT NULL
         WHERE cv.ativo = true
           AND cv.proxima_revisao_km IS NOT NULL
           AND (r.entidade_id IS NULL OR cv.id = r.entidade_id)
         GROUP BY cv.id, cv.proxima_revisao_km
      LOOP
        IF v.km_atual IS NULL THEN CONTINUE; END IF;
        faltam := v.proxima_revisao_km - v.km_atual;
        IF   r.limiar_urgente IS NOT NULL AND faltam <= r.limiar_urgente THEN sev := 'URGENTE';
        ELSIF r.limiar_atencao IS NOT NULL AND faltam <= r.limiar_atencao THEN sev := 'ATENCAO';
        ELSE sev := NULL;
        END IF;
        PERFORM public._upsert_alerta(r.id, v.id, sev, v.km_atual, v.proxima_revisao_km);
        IF sev IS NOT NULL THEN criados := criados + 1; END IF;
      END LOOP;

    -- ── REVISAO_DATA ──────────────────────────────────────────────────────────
    ELSIF r.tipo = 'REVISAO_DATA' THEN
      FOR v IN
        SELECT id, proxima_revisao_data
          FROM public.comb_veiculos
         WHERE ativo = true AND proxima_revisao_data IS NOT NULL
           AND (r.entidade_id IS NULL OR id = r.entidade_id)
      LOOP
        faltam := v.proxima_revisao_data - CURRENT_DATE;
        IF   r.limiar_urgente IS NOT NULL AND faltam <= r.limiar_urgente THEN sev := 'URGENTE';
        ELSIF r.limiar_atencao IS NOT NULL AND faltam <= r.limiar_atencao THEN sev := 'ATENCAO';
        ELSE sev := NULL;
        END IF;
        PERFORM public._upsert_alerta(r.id, v.id, sev, faltam, r.limiar_atencao);
        IF sev IS NOT NULL THEN criados := criados + 1; END IF;
      END LOOP;

    -- ── SEGURO ────────────────────────────────────────────────────────────────
    ELSIF r.tipo = 'SEGURO' THEN
      FOR v IN
        SELECT id, data_fim_seguro
          FROM public.comb_veiculos
         WHERE ativo = true AND data_fim_seguro IS NOT NULL
           AND (r.entidade_id IS NULL OR id = r.entidade_id)
      LOOP
        faltam := v.data_fim_seguro - CURRENT_DATE;
        IF   r.limiar_urgente IS NOT NULL AND faltam <= r.limiar_urgente THEN sev := 'URGENTE';
        ELSIF r.limiar_atencao IS NOT NULL AND faltam <= r.limiar_atencao THEN sev := 'ATENCAO';
        ELSE sev := NULL;
        END IF;
        PERFORM public._upsert_alerta(r.id, v.id, sev, faltam, r.limiar_atencao);
        IF sev IS NOT NULL THEN criados := criados + 1; END IF;
      END LOOP;

    -- ── IPO ───────────────────────────────────────────────────────────────────
    ELSIF r.tipo = 'IPO' THEN
      FOR v IN
        SELECT id, data_proxima_ipo
          FROM public.comb_veiculos
         WHERE ativo = true AND data_proxima_ipo IS NOT NULL
           AND (r.entidade_id IS NULL OR id = r.entidade_id)
      LOOP
        faltam := v.data_proxima_ipo - CURRENT_DATE;
        IF   r.limiar_urgente IS NOT NULL AND faltam <= r.limiar_urgente THEN sev := 'URGENTE';
        ELSIF r.limiar_atencao IS NOT NULL AND faltam <= r.limiar_atencao THEN sev := 'ATENCAO';
        ELSE sev := NULL;
        END IF;
        PERFORM public._upsert_alerta(r.id, v.id, sev, faltam, r.limiar_atencao);
        IF sev IS NOT NULL THEN criados := criados + 1; END IF;
      END LOOP;

    -- ── EPI_VALIDADE ──────────────────────────────────────────────────────────
    ELSIF r.tipo = 'EPI_VALIDADE' THEN
      SELECT data_validade INTO v_data
        FROM public.atribuicoes_epi
       WHERE id = r.entidade_id AND devolvido = false;

      IF NOT FOUND OR v_data IS NULL THEN
        PERFORM public._upsert_alerta(r.id, r.entidade_id, NULL, NULL, NULL);
        CONTINUE;
      END IF;

      v_dias := (v_data - CURRENT_DATE)::int;
      IF v_dias < 0 OR v_dias <= COALESCE(r.limiar_urgente, 7) THEN sev := 'URGENTE';
      ELSIF v_dias <= COALESCE(r.limiar_atencao, 30) THEN sev := 'ATENCAO';
      ELSE sev := NULL;
      END IF;

      PERFORM public._upsert_alerta(r.id, r.entidade_id, sev, v_dias, COALESCE(r.limiar_urgente, 7));
      IF sev IS NOT NULL THEN criados := criados + 1; END IF;

    -- ── FORMACAO_VALIDADE ─────────────────────────────────────────────────────
    ELSIF r.tipo = 'FORMACAO_VALIDADE' THEN
      SELECT data_validade INTO v_data
        FROM public.formacoes_colaborador
       WHERE id = r.entidade_id;

      IF NOT FOUND OR v_data IS NULL THEN
        PERFORM public._upsert_alerta(r.id, r.entidade_id, NULL, NULL, NULL);
        CONTINUE;
      END IF;

      v_dias := (v_data - CURRENT_DATE)::int;
      IF v_dias < 0 OR v_dias <= COALESCE(r.limiar_urgente, 30) THEN sev := 'URGENTE';
      ELSIF v_dias <= COALESCE(r.limiar_atencao, 90) THEN sev := 'ATENCAO';
      ELSE sev := NULL;
      END IF;

      PERFORM public._upsert_alerta(r.id, r.entidade_id, sev, v_dias, COALESCE(r.limiar_urgente, 30));
      IF sev IS NOT NULL THEN criados := criados + 1; END IF;

    END IF;
  END LOOP;

  RETURN criados;
END; $$;

GRANT EXECUTE ON FUNCTION public.avaliar_regras_alerta() TO authenticated;

-- ── Seed: Tipos de EPI comuns em construção civil ────────────────────────────

INSERT INTO public.tipos_epi (designacao, validade_dias, obrigatorio) VALUES
  ('Capacete de Segurança',    1825, true),
  ('Colete Refletor',           730, true),
  ('Luvas de Proteção',         365, true),
  ('Botas de Segurança',        730, true),
  ('Óculos de Proteção',       1095, true),
  ('Protetor Auditivo',         365, false),
  ('Arnês de Segurança',       1095, false),
  ('Máscara Respiratória',      365, false),
  ('Fato de Proteção',          365, false),
  ('Cinto de Segurança',       1095, false)
ON CONFLICT DO NOTHING;

-- ── Seed: Tipos de Formação obrigatórias/comuns ──────────────────────────────

INSERT INTO public.tipos_formacao (designacao, validade_anos, obrigatoria) VALUES
  ('Segurança em Altura',                2, true),
  ('Trabalhos em Espaços Confinados',    3, true),
  ('Primeiros Socorros',                 3, true),
  ('Prevenção e Combate a Incêndios',    2, true),
  ('Operador de Grua Torre',             5, false),
  ('Operador de Plataforma Elevatória',  5, false),
  ('Condução Defensiva',                 4, false),
  ('SHST — Segurança no Trabalho',       3, true),
  ('Manipulação de Produtos Químicos',   2, false),
  ('Trabalho em Estaleiro',              3, true)
ON CONFLICT DO NOTHING;

-- ── Bucket 'certificados' ─────────────────────────────────────────────────────
-- Criar via Supabase Dashboard Storage → New bucket → nome: "certificados" (public: false)
-- RLS: INSERT/UPDATE para admin e gestor; SELECT para authenticated
-- Não é possível criar buckets via SQL migration — nota para aplicação manual.
