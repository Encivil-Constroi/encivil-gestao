-- ================================================================
-- Fase 2 — Horários de Trabalho, Faltas e Conformidade Laboral
--
-- Depende de: F0 (colaboradores)
-- Atenção: dados sensíveis (RGPD art. 9.º) nas faltas com comprovativo médico
--
-- Regras críticas imutáveis:
--   • horas_supl_validadas NUNCA é preenchida automaticamente — só pelo gestor
--   • prazo_prova_ate calculado por trigger (CT art. 254.º: data_inicio + 15 dias)
--   • custo_hora_colaborador: leitura/escrita só admin (dado salarial)
--   • Políticas usam public.auth_role() (SECURITY DEFINER), não auth.jwt() ->> 'role'
-- ================================================================

-- ── 1. Tipos de horário ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.horarios (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  designacao            text        NOT NULL,
  periodo_diario_h      numeric     NOT NULL,          -- horas de trabalho por dia
  periodo_semanal_h     numeric     NOT NULL,          -- horas de trabalho por semana
  intervalo_min         int,                           -- duração do intervalo (minutos)
  intervalo_inicio      time,
  intervalo_fim         time,
  dias_semana           int[]       NOT NULL,          -- [1..7]: 1=Seg, 7=Dom
  hora_entrada          time        NOT NULL,
  hora_saida            time        NOT NULL,
  tolerancia_entrada_min int        NOT NULL DEFAULT 5,
  ativo                 boolean     NOT NULL DEFAULT true,
  valido_de             date,
  valido_ate            date,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.horarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "horarios_sel"   ON public.horarios;
DROP POLICY IF EXISTS "horarios_write" ON public.horarios;
CREATE POLICY "horarios_sel"   ON public.horarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "horarios_write" ON public.horarios FOR ALL    TO authenticated
  USING (public.auth_role() IN ('admin', 'gestor'))
  WITH CHECK (public.auth_role() IN ('admin', 'gestor'));

GRANT SELECT, INSERT, UPDATE ON TABLE public.horarios TO authenticated;

-- ── 2. Atribuição de horário a colaborador ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.horario_colaborador (
  colaborador_id  uuid        NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  horario_id      uuid        NOT NULL REFERENCES public.horarios(id),
  valido_de       date        NOT NULL,
  valido_ate      date,
  PRIMARY KEY (colaborador_id, valido_de)
);

ALTER TABLE public.horario_colaborador ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hc_sel"   ON public.horario_colaborador;
DROP POLICY IF EXISTS "hc_write" ON public.horario_colaborador;
CREATE POLICY "hc_sel"   ON public.horario_colaborador FOR SELECT TO authenticated USING (true);
CREATE POLICY "hc_write" ON public.horario_colaborador FOR ALL    TO authenticated
  USING (public.auth_role() IN ('admin', 'gestor'))
  WITH CHECK (public.auth_role() IN ('admin', 'gestor'));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.horario_colaborador TO authenticated;

CREATE INDEX IF NOT EXISTS hc_colaborador_idx ON public.horario_colaborador (colaborador_id);

-- ── 3. Feriados e excepções ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.feriados_excecoes (
  data       date        PRIMARY KEY,
  tipo       text        NOT NULL CHECK (tipo IN ('FERIADO', 'PONTE', 'EXCECAO_EMPRESA')),
  designacao text        NOT NULL,
  ambito     text        NOT NULL CHECK (ambito IN ('nacional', 'municipal', 'empresa'))
);

ALTER TABLE public.feriados_excecoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feriados_sel"   ON public.feriados_excecoes;
DROP POLICY IF EXISTS "feriados_write" ON public.feriados_excecoes;
CREATE POLICY "feriados_sel"   ON public.feriados_excecoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "feriados_write" ON public.feriados_excecoes FOR ALL    TO authenticated
  USING (public.auth_role() IN ('admin', 'gestor'))
  WITH CHECK (public.auth_role() IN ('admin', 'gestor'));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.feriados_excecoes TO authenticated;

-- ── 4. Custo/hora por colaborador (dado salarial — só admin) ───────────────
CREATE TABLE IF NOT EXISTS public.custo_hora_colaborador (
  colaborador_id  uuid        NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  custo_normal    numeric     NOT NULL CHECK (custo_normal >= 0),
  custo_supl      numeric     NOT NULL CHECK (custo_supl >= 0),
  valido_de       date        NOT NULL,
  valido_ate      date,
  PRIMARY KEY (colaborador_id, valido_de)
);

ALTER TABLE public.custo_hora_colaborador ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "custo_hora_admin" ON public.custo_hora_colaborador;
CREATE POLICY "custo_hora_admin" ON public.custo_hora_colaborador FOR ALL TO authenticated
  USING (public.auth_role() = 'admin')
  WITH CHECK (public.auth_role() = 'admin');

GRANT SELECT, INSERT, UPDATE ON TABLE public.custo_hora_colaborador TO authenticated;

-- ── 5. Resumo de assiduidade por dia ──────────────────────────────────────
-- Preenchido pelo RPC calcular_resumo_dia (cron às 22:30 UTC).
-- horas_supl_validadas: NUNCA automático, sempre pelo gestor.
CREATE TABLE IF NOT EXISTS public.resumo_assiduidade_dia (
  colaborador_id          uuid        NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  data                    date        NOT NULL,
  obra_id                 uuid        REFERENCES public.obras(id),
  horas_previstas         numeric,
  horas_efetivas          numeric,
  desvio                  numeric,              -- efetivas - previstas
  horas_supl_propostas    numeric,              -- max(desvio, 0) — proposto pelo sistema
  horas_supl_validadas    numeric,              -- ← NUNCA automático; gestor valida
  validado_por            uuid        REFERENCES auth.users(id),
  validado_em             timestamptz,
  PRIMARY KEY (colaborador_id, data)
);

ALTER TABLE public.resumo_assiduidade_dia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assiduidade_sel"   ON public.resumo_assiduidade_dia;
DROP POLICY IF EXISTS "assiduidade_write" ON public.resumo_assiduidade_dia;
CREATE POLICY "assiduidade_sel"   ON public.resumo_assiduidade_dia FOR SELECT TO authenticated USING (true);
CREATE POLICY "assiduidade_write" ON public.resumo_assiduidade_dia FOR ALL    TO authenticated
  USING (public.auth_role() IN ('admin', 'gestor'))
  WITH CHECK (public.auth_role() IN ('admin', 'gestor'));

GRANT SELECT, INSERT, UPDATE ON TABLE public.resumo_assiduidade_dia TO authenticated;

CREATE INDEX IF NOT EXISTS rad_colaborador_data_idx ON public.resumo_assiduidade_dia (colaborador_id, data DESC);

-- ── 6. Tipos de falta ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tipos_falta (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  designacao   text        NOT NULL,
  justificada  boolean,    -- null = depende de prova; true = sempre just.; false = sempre injust.
  descontavel  boolean     NOT NULL DEFAULT true,
  ativo        boolean     NOT NULL DEFAULT true
);

ALTER TABLE public.tipos_falta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tipos_falta_sel"   ON public.tipos_falta;
DROP POLICY IF EXISTS "tipos_falta_write" ON public.tipos_falta;
CREATE POLICY "tipos_falta_sel"   ON public.tipos_falta FOR SELECT TO authenticated USING (true);
CREATE POLICY "tipos_falta_write" ON public.tipos_falta FOR ALL    TO authenticated
  USING (public.auth_role() IN ('admin', 'gestor'))
  WITH CHECK (public.auth_role() IN ('admin', 'gestor'));

GRANT SELECT, INSERT, UPDATE ON TABLE public.tipos_falta TO authenticated;

-- Seed: tipos de falta mais comuns (só insert se tabela vazia)
INSERT INTO public.tipos_falta (designacao, justificada, descontavel)
SELECT * FROM (VALUES
  ('Doença (com baixa médica)',       true,  false),
  ('Doença (sem baixa)',              null,  true),
  ('Falta injustificada',             false, true),
  ('Assistência a familiar',          true,  false),
  ('Consulta médica',                 true,  false),
  ('Licença de paternidade/maternidade', true, false),
  ('Acidente de trabalho',            true,  false),
  ('Luto',                            true,  false)
) AS v(designacao, justificada, descontavel)
WHERE NOT EXISTS (SELECT 1 FROM public.tipos_falta LIMIT 1);

-- ── 7. Faltas ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.faltas (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id      uuid        NOT NULL REFERENCES public.colaboradores(id) ON DELETE RESTRICT,
  data_inicio         date        NOT NULL,
  data_fim            date        NOT NULL,
  periodo             text        CHECK (periodo IN ('DIA', 'MANHA', 'TARDE', 'HORAS')),
  tipo_falta_id       uuid        REFERENCES public.tipos_falta(id),
  estado              text        NOT NULL DEFAULT 'COMUNICADA'
                                  CHECK (estado IN ('COMUNICADA', 'COM_COMPROVATIVO', 'JUSTIFICADA', 'INJUSTIFICADA')),
  justificacao_texto  text,
  comprovativo_key    text,       -- bucket 'comprovativos-medicos' (RGPD art. 9.º)
  dado_saude          boolean     NOT NULL DEFAULT false,
  previsivel          boolean     NOT NULL DEFAULT false,
  comunicada_em       timestamptz NOT NULL DEFAULT now(),
  prazo_prova_ate     date,       -- calculado por trigger: data_inicio + 15 (CT art. 254.º)
  decidida_por        uuid        REFERENCES auth.users(id),
  decidida_em         timestamptz,
  CONSTRAINT faltas_datas_check CHECK (data_fim >= data_inicio)
);

ALTER TABLE public.faltas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "faltas_sel"   ON public.faltas;
DROP POLICY IF EXISTS "faltas_write" ON public.faltas;
CREATE POLICY "faltas_sel"   ON public.faltas FOR SELECT TO authenticated USING (true);
CREATE POLICY "faltas_write" ON public.faltas FOR ALL    TO authenticated
  USING (public.auth_role() IN ('admin', 'gestor'))
  WITH CHECK (public.auth_role() IN ('admin', 'gestor'));

GRANT SELECT, INSERT, UPDATE ON TABLE public.faltas TO authenticated;

CREATE INDEX IF NOT EXISTS faltas_colaborador_idx  ON public.faltas (colaborador_id);
CREATE INDEX IF NOT EXISTS faltas_estado_idx       ON public.faltas (estado);
CREATE INDEX IF NOT EXISTS faltas_data_inicio_idx  ON public.faltas (data_inicio DESC);

-- ── 8. Trigger: prazo_prova_ate = data_inicio + 15 dias (CT art. 254.º) ──
CREATE OR REPLACE FUNCTION public.fn_calcular_prazo_prova()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Só definir no INSERT; no UPDATE preservar (operador não pode alterar o prazo)
  IF TG_OP = 'INSERT' THEN
    NEW.prazo_prova_ate := NEW.data_inicio + INTERVAL '15 days';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_prazo_prova ON public.faltas;
CREATE TRIGGER trg_prazo_prova
  BEFORE INSERT ON public.faltas
  FOR EACH ROW EXECUTE FUNCTION public.fn_calcular_prazo_prova();

-- ── 9. RPC stub: calcular resumo de assiduidade de um dia ─────────────────
-- Implementação completa depende de F3 (picagens). Este stub garante que a
-- signature existe para o pg_cron poder ser agendado e os tipos regenerados.
CREATE OR REPLACE FUNCTION public.calcular_resumo_dia(p_data date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Stub — implementação completa em F3 quando picagens estiverem disponíveis.
  -- Quando F3 for implementado, substituir este corpo pela lógica real.
  RAISE NOTICE 'calcular_resumo_dia: % — implementação pendente (requer F3)', p_data;
END; $$;

GRANT EXECUTE ON FUNCTION public.calcular_resumo_dia(date) TO authenticated;

-- ── 10. Agendar cron de resumo (ignorar se pg_cron não estiver activo) ────
DO $outer$
BEGIN
  PERFORM cron.schedule(
    'calcular-resumo-assiduidade',
    '30 22 * * *',  -- 22:30 UTC = 23:30 Lisboa inverno
    $$SELECT public.calcular_resumo_dia(CURRENT_DATE)$$
  );
  RAISE NOTICE 'Job calcular-resumo-assiduidade agendado.';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'pg_cron não disponível. Agendar manualmente se necessário.';
END;
$outer$;

-- ── 11. Seed: feriados nacionais 2026 ─────────────────────────────────────
INSERT INTO public.feriados_excecoes (data, tipo, designacao, ambito)
SELECT data, tipo, designacao, ambito FROM (VALUES
  ('2026-01-01'::date, 'FERIADO', 'Ano Novo',                          'nacional'),
  ('2026-04-03'::date, 'FERIADO', 'Sexta-feira Santa',                  'nacional'),
  ('2026-04-05'::date, 'FERIADO', 'Páscoa',                            'nacional'),
  ('2026-04-25'::date, 'FERIADO', 'Dia da Liberdade',                  'nacional'),
  ('2026-05-01'::date, 'FERIADO', 'Dia do Trabalhador',                'nacional'),
  ('2026-06-10'::date, 'FERIADO', 'Dia de Portugal',                   'nacional'),
  ('2026-06-11'::date, 'FERIADO', 'Corpo de Deus',                     'nacional'),
  ('2026-08-15'::date, 'FERIADO', 'Assunção de Nossa Senhora',         'nacional'),
  ('2026-10-05'::date, 'FERIADO', 'Implantação da República',          'nacional'),
  ('2026-11-01'::date, 'FERIADO', 'Todos os Santos',                   'nacional'),
  ('2026-12-01'::date, 'FERIADO', 'Restauração da Independência',      'nacional'),
  ('2026-12-08'::date, 'FERIADO', 'Imaculada Conceição',               'nacional'),
  ('2026-12-25'::date, 'FERIADO', 'Natal',                             'nacional')
) AS v(data, tipo, designacao, ambito)
ON CONFLICT (data) DO NOTHING;
