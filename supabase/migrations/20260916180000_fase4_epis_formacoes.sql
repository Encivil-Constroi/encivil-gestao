-- supabase/migrations/20260916180000_fase4_epis_formacoes.sql
-- Fase 4 — EPIs e Formações (requer F0 Colaboradores + F1 Alertas)

-- ── Tipos de EPI ──────────────────────────────────────────────────────────────

CREATE TABLE public.tipos_epi (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  designacao    text NOT NULL,
  validade_dias int,       -- null = sem validade periódica
  obrigatorio   boolean    DEFAULT true
);

-- ── Atribuições de EPI ───────────────────────────────────────────────────────

CREATE TABLE public.atribuicoes_epi (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  uuid NOT NULL REFERENCES colaboradores(id),
  tipo_epi_id     uuid NOT NULL REFERENCES tipos_epi(id),
  data_entrega    date NOT NULL,
  data_validade   date,        -- calculada via trigger: data_entrega + validade_dias
  devolvido       boolean      DEFAULT false,
  data_devolucao  date,
  regra_alerta_id uuid         REFERENCES regras_alerta(id)  -- preenchido via trigger
);

CREATE INDEX idx_atrib_epi_colab ON atribuicoes_epi(colaborador_id);

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

CREATE TRIGGER trg_epi_depois_atualizar
  AFTER UPDATE ON atribuicoes_epi
  FOR EACH ROW EXECUTE FUNCTION fn_epi_depois_atualizar();

-- ── Tipos de Formação ────────────────────────────────────────────────────────

CREATE TABLE public.tipos_formacao (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  designacao    text NOT NULL,
  validade_anos int,       -- null = vitalício (não gera alerta)
  obrigatoria   boolean    DEFAULT false
);

-- ── Formações por colaborador ────────────────────────────────────────────────

CREATE TABLE public.formacoes_colaborador (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  uuid NOT NULL REFERENCES colaboradores(id),
  tipo_id         uuid NOT NULL REFERENCES tipos_formacao(id),
  data_conclusao  date NOT NULL,
  data_validade   date,        -- calculada via trigger
  certificado_key text,        -- bucket 'certificados' (RLS: authenticated lê)
  entidade        text,        -- entidade formadora
  regra_alerta_id uuid         REFERENCES regras_alerta(id)
);

CREATE INDEX idx_form_colab ON formacoes_colaborador(colaborador_id);

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

CREATE TRIGGER trg_formacao_antes_inserir
  BEFORE INSERT ON formacoes_colaborador
  FOR EACH ROW EXECUTE FUNCTION fn_formacao_antes_inserir();

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.tipos_epi             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atribuicoes_epi       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipos_formacao        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formacoes_colaborador ENABLE ROW LEVEL SECURITY;

-- Tipos: leitura para todos, escrita para gestor/admin
CREATE POLICY "tipos_epi_sel"   ON tipos_epi FOR SELECT TO authenticated USING (true);
CREATE POLICY "tipos_epi_write" ON tipos_epi FOR ALL    TO authenticated
  USING ((auth.jwt() ->> 'role') IN ('admin', 'gestor'));

-- Atribuições: leitura para todos, escrita para gestor/admin
CREATE POLICY "atrib_epi_sel"   ON atribuicoes_epi FOR SELECT TO authenticated USING (true);
CREATE POLICY "atrib_epi_write" ON atribuicoes_epi FOR ALL    TO authenticated
  USING ((auth.jwt() ->> 'role') IN ('admin', 'gestor'));

-- Formações (mesmo padrão)
CREATE POLICY "tipos_form_sel"   ON tipos_formacao FOR SELECT TO authenticated USING (true);
CREATE POLICY "tipos_form_write" ON tipos_formacao FOR ALL    TO authenticated
  USING ((auth.jwt() ->> 'role') IN ('admin', 'gestor'));

CREATE POLICY "form_colab_sel"   ON formacoes_colaborador FOR SELECT TO authenticated USING (true);
CREATE POLICY "form_colab_write" ON formacoes_colaborador FOR ALL    TO authenticated
  USING ((auth.jwt() ->> 'role') IN ('admin', 'gestor'));

-- ── GRANTs ───────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON TABLE public.tipos_epi             TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.atribuicoes_epi       TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.tipos_formacao        TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.formacoes_colaborador TO authenticated;

-- ── Extensão do motor de alertas (F1) para EPI_VALIDADE e FORMACAO_VALIDADE ──
-- NOTA: CREATE OR REPLACE é seguro — a implementação anterior era um stub (NULL).

CREATE OR REPLACE FUNCTION public.avaliar_regras_alerta()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  regra    regras_alerta%rowtype;
  v_data   date;
  v_dias   int;
  v_sev    text;
  v_count  int := 0;
BEGIN
  -- ── EPI_VALIDADE ────────────────────────────────────────────────────────────
  FOR regra IN SELECT * FROM regras_alerta WHERE tipo = 'EPI_VALIDADE' AND ativa LOOP
    SELECT data_validade INTO v_data
      FROM atribuicoes_epi
     WHERE id = regra.entidade_id AND devolvido = false;

    IF NOT FOUND OR v_data IS NULL THEN
      -- EPI devolvido ou sem validade — resolver alerta existente
      UPDATE alertas SET estado = 'RESOLVIDO', resolvido_em = now()
       WHERE regra_id = regra.id AND estado IN ('ATIVO', 'RECONHECIDO');
      CONTINUE;
    END IF;

    v_dias := (v_data - CURRENT_DATE)::int;

    IF v_dias < 0 THEN
      v_sev := 'URGENTE';  -- já expirado
    ELSIF v_dias <= COALESCE(regra.limiar_urgente, 7) THEN
      v_sev := 'URGENTE';
    ELSIF v_dias <= COALESCE(regra.limiar_atencao, 30) THEN
      v_sev := 'ATENCAO';
    ELSE
      UPDATE alertas SET estado = 'RESOLVIDO', resolvido_em = now()
       WHERE regra_id = regra.id AND estado IN ('ATIVO', 'RECONHECIDO');
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM alertas
       WHERE regra_id = regra.id AND estado IN ('ATIVO', 'RECONHECIDO')
    ) THEN
      UPDATE alertas
         SET severidade = v_sev, valor_atual = v_dias, atualizado_em = now()
       WHERE regra_id = regra.id AND estado IN ('ATIVO', 'RECONHECIDO');
    ELSE
      INSERT INTO alertas (regra_id, entidade_id, estado, severidade, valor_atual, valor_limiar)
      VALUES (regra.id, regra.entidade_id, 'ATIVO', v_sev, v_dias,
              COALESCE(regra.limiar_urgente, 7));
    END IF;
    v_count := v_count + 1;
  END LOOP;

  -- ── FORMACAO_VALIDADE ───────────────────────────────────────────────────────
  FOR regra IN SELECT * FROM regras_alerta WHERE tipo = 'FORMACAO_VALIDADE' AND ativa LOOP
    SELECT data_validade INTO v_data
      FROM formacoes_colaborador
     WHERE id = regra.entidade_id;

    IF NOT FOUND OR v_data IS NULL THEN
      UPDATE alertas SET estado = 'RESOLVIDO', resolvido_em = now()
       WHERE regra_id = regra.id AND estado IN ('ATIVO', 'RECONHECIDO');
      CONTINUE;
    END IF;

    v_dias := (v_data - CURRENT_DATE)::int;

    IF v_dias < 0 THEN
      v_sev := 'URGENTE';
    ELSIF v_dias <= COALESCE(regra.limiar_urgente, 30) THEN
      v_sev := 'URGENTE';
    ELSIF v_dias <= COALESCE(regra.limiar_atencao, 90) THEN
      v_sev := 'ATENCAO';
    ELSE
      UPDATE alertas SET estado = 'RESOLVIDO', resolvido_em = now()
       WHERE regra_id = regra.id AND estado IN ('ATIVO', 'RECONHECIDO');
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM alertas
       WHERE regra_id = regra.id AND estado IN ('ATIVO', 'RECONHECIDO')
    ) THEN
      UPDATE alertas
         SET severidade = v_sev, valor_atual = v_dias, atualizado_em = now()
       WHERE regra_id = regra.id AND estado IN ('ATIVO', 'RECONHECIDO');
    ELSE
      INSERT INTO alertas (regra_id, entidade_id, estado, severidade, valor_atual, valor_limiar)
      VALUES (regra.id, regra.entidade_id, 'ATIVO', v_sev, v_dias,
              COALESCE(regra.limiar_urgente, 30));
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
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
  ('Cinto de Segurança',       1095, false);

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
  ('Trabalho em Estaleiro',              3, true);

-- ── Bucket 'certificados' ─────────────────────────────────────────────────────
-- Criar via Supabase Dashboard Storage → New bucket → nome: "certificados" (public: false)
-- RLS: INSERT/UPDATE para admin e gestor; SELECT para authenticated
-- Não é possível criar buckets via SQL migration — nota para aplicação manual.
