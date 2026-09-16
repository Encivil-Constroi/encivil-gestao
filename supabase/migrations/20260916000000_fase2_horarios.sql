-- Fase 2 — Horário de Trabalho, Faltas e Conformidade Laboral
-- Aplicar manualmente no Supabase Dashboard (SQL Editor)
-- Após aplicar: npx supabase gen types typescript --project-id <id> > src/integrations/supabase/types.ts

-- ─────────────────────────────────────────────────────────────────────────────
-- Tabelas
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.horarios (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  designacao            text    NOT NULL,
  periodo_diario_h      numeric NOT NULL,
  periodo_semanal_h     numeric NOT NULL,
  intervalo_min         int,
  intervalo_inicio      time,
  intervalo_fim         time,
  dias_semana           int[] NOT NULL,  -- [1,2,3,4,5] = Seg-Sex
  hora_entrada          time NOT NULL,
  hora_saida            time NOT NULL,
  tolerancia_entrada_min int DEFAULT 5,
  ativo                 boolean DEFAULT true,
  valido_de             date,
  valido_ate            date
);

CREATE TABLE public.horario_colaborador (
  colaborador_id  uuid NOT NULL REFERENCES colaboradores(id),
  horario_id      uuid NOT NULL REFERENCES horarios(id),
  valido_de       date NOT NULL,
  valido_ate      date,
  PRIMARY KEY (colaborador_id, valido_de)
);

CREATE TABLE public.feriados_excecoes (
  data       date PRIMARY KEY,
  tipo       text NOT NULL CHECK (tipo IN ('FERIADO','PONTE','EXCECAO_EMPRESA')),
  designacao text NOT NULL,
  ambito     text NOT NULL CHECK (ambito IN ('nacional','municipal','empresa'))
);

-- Custo/hora por colaborador — dado salarial, só admin lê/escreve
CREATE TABLE public.custo_hora_colaborador (
  colaborador_id  uuid NOT NULL REFERENCES colaboradores(id),
  custo_normal    numeric NOT NULL,
  custo_supl      numeric NOT NULL,
  valido_de       date NOT NULL,
  valido_ate      date,
  PRIMARY KEY (colaborador_id, valido_de)
);

CREATE TABLE public.resumo_assiduidade_dia (
  colaborador_id          uuid NOT NULL REFERENCES colaboradores(id),
  data                    date NOT NULL,
  obra_id                 uuid REFERENCES obras(id),
  horas_previstas         numeric,
  horas_efetivas          numeric,
  desvio                  numeric,           -- efetivas - previstas
  horas_supl_propostas    numeric,           -- max(desvio,0) — proposto pelo sistema
  horas_supl_validadas    numeric,           -- gestor preenche — NUNCA automático
  validado_por            uuid REFERENCES auth.users(id),
  validado_em             timestamptz,
  PRIMARY KEY (colaborador_id, data)
);

CREATE TABLE public.tipos_falta (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  designacao   text NOT NULL,
  justificada  boolean,      -- null = depende de prova
  descontavel  boolean DEFAULT true
);

CREATE TABLE public.faltas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id    uuid NOT NULL REFERENCES colaboradores(id),
  data_inicio       date NOT NULL,
  data_fim          date NOT NULL,
  periodo           text CHECK (periodo IN ('DIA','MANHA','TARDE','HORAS')),
  tipo_falta_id     uuid REFERENCES tipos_falta(id),
  estado            text NOT NULL DEFAULT 'COMUNICADA'
                    CHECK (estado IN ('COMUNICADA','COM_COMPROVATIVO','JUSTIFICADA','INJUSTIFICADA')),
  justificacao_texto text,
  comprovativo_key  text,        -- bucket comprovativos-medicos — RGPD art.9
  dado_saude        boolean DEFAULT false,
  previsivel        boolean DEFAULT false,
  comunicada_em     timestamptz DEFAULT now(),
  prazo_prova_ate   date,        -- calculado pelo trigger (data_inicio + 15 dias — CT art.254)
  decidida_por      uuid REFERENCES auth.users(id),
  decidida_em       timestamptz
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger: prazo_prova_ate = data_inicio + 15 dias (CT art. 254.º)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_calcular_prazo_prova()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.prazo_prova_ate := NEW.data_inicio + INTERVAL '15 days';
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_prazo_prova
  BEFORE INSERT ON public.faltas
  FOR EACH ROW EXECUTE FUNCTION public.fn_calcular_prazo_prova();

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: calcular_resumo_dia — corre diariamente via pg_cron (22:30 UTC)
-- Calcula horas previstas, efetivas e suplementares propostas para cada
-- colaborador ativo com horário vigente. horas_supl_validadas é SEMPRE null —
-- nunca automático, preenchido pelo gestor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.calcular_resumo_dia(p_data date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.resumo_assiduidade_dia (
    colaborador_id, data, horas_previstas, horas_efetivas,
    desvio, horas_supl_propostas, horas_supl_validadas
  )
  SELECT
    c.id,
    p_data,
    -- horas previstas: 0 se feriado ou dia fora do horário
    CASE
      WHEN f.data IS NOT NULL THEN 0
      WHEN NOT (EXTRACT(isodow FROM p_data)::int = ANY(h.dias_semana)) THEN 0
      ELSE h.periodo_diario_h
    END,
    -- horas efetivas: soma de pares ENTRADA/SAIDA validados (F3 preencherá)
    COALESCE(0, 0),
    -- desvio = efetivas - previstas (será recalculado quando F3 existir)
    0 - CASE
      WHEN f.data IS NOT NULL THEN 0
      WHEN NOT (EXTRACT(isodow FROM p_data)::int = ANY(h.dias_semana)) THEN 0
      ELSE h.periodo_diario_h
    END,
    -- horas_supl_propostas = max(desvio, 0)
    GREATEST(
      0 - CASE
        WHEN f.data IS NOT NULL THEN 0
        WHEN NOT (EXTRACT(isodow FROM p_data)::int = ANY(h.dias_semana)) THEN 0
        ELSE h.periodo_diario_h
      END,
      0
    ),
    NULL  -- horas_supl_validadas nunca automático
  FROM public.colaboradores c
  JOIN public.horario_colaborador hc ON hc.colaborador_id = c.id
    AND hc.valido_de <= p_data
    AND (hc.valido_ate IS NULL OR hc.valido_ate >= p_data)
  JOIN public.horarios h ON h.id = hc.horario_id AND h.ativo = true
  LEFT JOIN public.feriados_excecoes f ON f.data = p_data
  WHERE c.ativo = true
  ON CONFLICT (colaborador_id, data) DO UPDATE SET
    horas_previstas      = EXCLUDED.horas_previstas,
    horas_efetivas       = EXCLUDED.horas_efetivas,
    desvio               = EXCLUDED.desvio,
    horas_supl_propostas = EXCLUDED.horas_supl_propostas
    -- horas_supl_validadas e validado_por nunca sobrescrevem o que o gestor preencheu
  ;
END; $$;

GRANT EXECUTE ON FUNCTION public.calcular_resumo_dia(date) TO authenticated;

-- Agendamento diário às 22:30 UTC (após fim de dia de trabalho)
SELECT cron.schedule(
  'calcular-resumo-assiduidade',
  '30 22 * * *',
  $$SELECT public.calcular_resumo_dia(CURRENT_DATE)$$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.horarios                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horario_colaborador     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feriados_excecoes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custo_hora_colaborador  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resumo_assiduidade_dia  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipos_falta             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faltas                  ENABLE ROW LEVEL SECURITY;

-- Horários: leitura para todos; escrita para admin/gestor
CREATE POLICY "horarios_sel"   ON public.horarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "horarios_write" ON public.horarios FOR ALL    TO authenticated
  USING ((auth.jwt() ->> 'role') IN ('admin', 'gestor'));

CREATE POLICY "hcolab_sel"     ON public.horario_colaborador FOR SELECT TO authenticated USING (true);
CREATE POLICY "hcolab_write"   ON public.horario_colaborador FOR ALL    TO authenticated
  USING ((auth.jwt() ->> 'role') IN ('admin', 'gestor'));

CREATE POLICY "feriados_sel"   ON public.feriados_excecoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "feriados_write" ON public.feriados_excecoes FOR ALL    TO authenticated
  USING ((auth.jwt() ->> 'role') IN ('admin', 'gestor'));

-- custo/hora: apenas admin (dado salarial)
CREATE POLICY "custo_hora_admin" ON public.custo_hora_colaborador FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "resumo_sel"   ON public.resumo_assiduidade_dia FOR SELECT TO authenticated USING (true);
CREATE POLICY "resumo_write" ON public.resumo_assiduidade_dia FOR ALL    TO authenticated
  USING ((auth.jwt() ->> 'role') IN ('admin', 'gestor'));

CREATE POLICY "tfalta_sel"   ON public.tipos_falta FOR SELECT TO authenticated USING (true);
CREATE POLICY "tfalta_write" ON public.tipos_falta FOR ALL    TO authenticated
  USING ((auth.jwt() ->> 'role') IN ('admin', 'gestor'));

CREATE POLICY "faltas_sel"   ON public.faltas FOR SELECT TO authenticated USING (true);
CREATE POLICY "faltas_write" ON public.faltas FOR ALL    TO authenticated
  USING ((auth.jwt() ->> 'role') IN ('admin', 'gestor'));

-- ─────────────────────────────────────────────────────────────────────────────
-- GRANTs (Automatically expose new tables está OFF — obrigatório)
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON TABLE public.horarios                TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.horario_colaborador     TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.feriados_excecoes       TO authenticated;
GRANT SELECT ON TABLE public.custo_hora_colaborador                  TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.custo_hora_colaborador          TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.resumo_assiduidade_dia  TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.tipos_falta             TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.faltas                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_calcular_prazo_prova()           TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: tipos de falta base (Código do Trabalho PT)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.tipos_falta (designacao, justificada, descontavel) VALUES
  ('Doença com baixa médica',                  true,  false),
  ('Doença sem baixa médica',                  null,  true),
  ('Assistência a filho menor',                true,  false),
  ('Casamento',                                true,  false),
  ('Falecimento de familiar',                  true,  false),
  ('Consulta médica',                          true,  false),
  ('Acidente de trabalho',                     true,  false),
  ('Greve',                                    true,  true),
  ('Falta injustificada',                      false, true),
  ('Licença sem retribuição',                  true,  true),
  ('Formação profissional obrigatória',        true,  false),
  ('Outro motivo justificado',                 null,  null);

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: feriados nacionais 2026 (Portugal)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.feriados_excecoes (data, tipo, designacao, ambito) VALUES
  ('2026-01-01', 'FERIADO', 'Ano Novo',                         'nacional'),
  ('2026-02-17', 'FERIADO', 'Carnaval',                         'nacional'),
  ('2026-04-03', 'FERIADO', 'Sexta-Feira Santa',                'nacional'),
  ('2026-04-05', 'FERIADO', 'Páscoa',                           'nacional'),
  ('2026-04-25', 'FERIADO', '25 de Abril',                      'nacional'),
  ('2026-05-01', 'FERIADO', 'Dia do Trabalhador',               'nacional'),
  ('2026-06-04', 'FERIADO', 'Corpus Christi',                   'nacional'),
  ('2026-06-10', 'FERIADO', 'Dia de Portugal',                  'nacional'),
  ('2026-08-15', 'FERIADO', 'Assunção de Nossa Senhora',        'nacional'),
  ('2026-10-05', 'FERIADO', 'Implantação da República',         'nacional'),
  ('2026-11-01', 'FERIADO', 'Todos os Santos',                  'nacional'),
  ('2026-12-01', 'FERIADO', 'Restauração da Independência',     'nacional'),
  ('2026-12-08', 'FERIADO', 'Imaculada Conceição',              'nacional'),
  ('2026-12-25', 'FERIADO', 'Natal',                            'nacional');
