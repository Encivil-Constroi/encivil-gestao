# Plano de Implementação v3.0 — ERP Completo ENCIVIL

**Versão:** 3.0  
**Data:** 2026-07-30  
**Decisão arquitectural:** ADR-009 — manter React PWA + Supabase  
**Duração estimada:** 22 semanas, entrega incremental em produção

---

## Como usar este documento (para agentes de IA)

1. Escolher a fase de menor número que ainda não está `[CONCLUÍDA]`
2. Ler a secção completa dessa fase antes de escrever uma linha de código
3. Seguir os padrões obrigatórios do `CLAUDE.md` (useAsync, useMutation, SELECT constante, sem N+1)
4. Criar a migration SQL antes de qualquer código React
5. Regenerar tipos após cada migration: `npx supabase gen types typescript --local > src/integrations/supabase/types.ts`
6. Cumprir todos os critérios de conclusão antes de marcar a fase como concluída

---

## Dependências entre fases

```
F0 (Colaboradores)
  └── F1 (Alertas)          ← pode arrancar em paralelo com F0 se colaboradores não forem destino de alertas ainda
  └── F2 (Horários)         ← requer F0
      └── F3 (Picagem MVP)  ← requer F0 + F2
          └── F5 (Geofence) ← requer F3
  └── F4 (EPIs/Formações)   ← requer F0 + F1
  └── F6 (Faturas)          ← requer F0 (fornecedores já existem em subempreiteiros)
      └── F7 (Custeio)      ← requer F2 + F6
          └── F8 (Livro de Obra) ← requer F7
  └── F9 (Frota: manutenção/checklists) ← requer F0 + F1
```

---

## Fase 0 — Módulo de Colaboradores `[CONCLUÍDA]`

**Semanas:** 1–2  
**Prioridade:** Bloqueante — nenhuma fase HR funciona sem esta

### Por que primeiro

Todas as tabelas de RH (horários, picagens, faltas, EPIs, formações) referenciam `colaboradores.id`. Sem esta tabela, nada avança.

### Migration

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_fase0_colaboradores.sql

CREATE TABLE public.colaboradores (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nome             text    NOT NULL,
  numero_mecan     text    UNIQUE NOT NULL,  -- número mecanográfico interno
  nif              text,
  cargo            text    NOT NULL,
  obra_id          uuid    REFERENCES obras(id),   -- obra principal (nullable)
  user_id          uuid    REFERENCES auth.users(id),  -- nullable: só se tiver login
  ativo            boolean DEFAULT true,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer autenticado
CREATE POLICY "colab_select" ON colaboradores
  FOR SELECT TO authenticated USING (true);

-- Escrita: admin e gestor
CREATE POLICY "colab_write" ON colaboradores
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') IN ('admin', 'gestor'));

GRANT SELECT, INSERT, UPDATE ON TABLE public.colaboradores TO authenticated;
```

### Ficheiros a criar

```
src/features/colaboradores/
  services/colaboradoresService.ts   ← listar, buscar, criar, atualizar, arquivar
  hooks/useColaboradores.ts          ← useAsync
  hooks/useGuardarColaborador.ts     ← dual useMutation (criar + atualizar)
  hooks/useArquivarColaborador.ts    ← void useMutation padrão
  components/ColaboradoresPage.tsx
  components/ColaboradorDrawer.tsx   ← criação/edição lateral
  index.ts
```

### Regras de negócio

- `numero_mecan` é a chave de negócio — usar em pesquisas e listagens
- Arquivar = `ativo = false`, nunca DELETE
- `user_id` é nullable; só preencher quando o colaborador tiver conta de login no sistema
- Operador só lê; gestor e admin criam/editam

### Critérios de conclusão

- [ ] Migration aplicada com `supabase db push` e tipos regenerados
- [ ] `npm run typecheck` — 0 erros
- [ ] Testes: `listarColaboradores`, `arquivarColaborador` (soft-delete preservado)
- [ ] RLS testado: operador não consegue INSERT

---

## Fase 1 — Motor de Alertas e Manutenção Preventiva `[CONCLUÍDA]`

**Semanas:** 3–4  
**Prioridade:** Alto valor imediato — usa dados de combustível já existentes

### Por que segundo

O módulo de combustível já captura km e horas de máquinas. Esta fase transforma esses dados em alertas sem depender de F0 para os tipos de viatura/máquina.

### Migration

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_fase1_alertas.sql

CREATE TABLE public.regras_alerta (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo           text NOT NULL,
  -- 'REVISAO_KM' | 'REVISAO_HORAS' | 'SEGURO' | 'IPO' | 'CARTA_CONDUCAO'
  -- 'SUPLEMENTAR' | 'VALIDADE_DOC' | 'EPI_VALIDADE' | 'FORMACAO_VALIDADE'
  entidade_alvo  text NOT NULL,   -- 'viatura' | 'maquina' | 'colaborador' | 'subempreiteiro'
  entidade_id    uuid,            -- null = aplica a todos da entidade_alvo
  campo_ref      text NOT NULL,   -- coluna ou contador de referência
  limiar_atencao numeric,         -- valor a partir do qual criar alerta ATENCAO
  limiar_urgente numeric,         -- valor a partir do qual criar alerta URGENTE
  destinatarios  text[],          -- ['admin', 'gestor']
  ativa          boolean DEFAULT true
);

CREATE TABLE public.alertas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regra_id      uuid NOT NULL REFERENCES regras_alerta(id),
  entidade_id   uuid NOT NULL,
  estado        text NOT NULL DEFAULT 'ATIVO',  -- 'ATIVO' | 'RECONHECIDO' | 'RESOLVIDO'
  severidade    text NOT NULL,                   -- 'ATENCAO' | 'URGENTE'
  criado_em     timestamptz DEFAULT now(),
  reconhecido_por uuid REFERENCES auth.users(id),
  reconhecido_em  timestamptz,
  resolvido_por uuid REFERENCES auth.users(id),
  resolvido_em  timestamptz
);

ALTER TABLE public.regras_alerta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alertas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "regras_select" ON regras_alerta FOR SELECT TO authenticated USING (true);
CREATE POLICY "regras_write"  ON regras_alerta FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') IN ('admin', 'gestor'));

CREATE POLICY "alertas_select" ON alertas FOR SELECT TO authenticated USING (true);
CREATE POLICY "alertas_write"  ON alertas  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') IN ('admin', 'gestor'));

GRANT SELECT, INSERT, UPDATE ON TABLE public.regras_alerta TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.alertas TO authenticated;

-- RPC de avaliação diária
CREATE OR REPLACE FUNCTION public.avaliar_regras_alerta()
RETURNS void LANGUAGE plpgsql AS $$
-- Para cada regra ativa:
--   1. Calcular valor atual (km/horas/data de vencimento/etc.)
--   2. Comparar com limiar_urgente e limiar_atencao
--   3. INSERT em alertas se não existir alerta ATIVO para (regra_id, entidade_id)
--   4. UPDATE estado='RESOLVIDO' em alertas ATIVO que já não cumprem a condição
BEGIN
  -- Implementação a expandir por tipo de regra
  NULL;
END; $$;

GRANT EXECUTE ON FUNCTION public.avaliar_regras_alerta() TO authenticated;

-- Job diário às 06:00 UTC (07:00 Lisboa inverno, 08:00 verão)
SELECT cron.schedule(
  'avaliar-alertas-diarios',
  '0 6 * * *',
  $$SELECT public.avaliar_regras_alerta()$$
);
```

### Ficheiros a criar

```
src/features/alertas/
  services/alertasService.ts
  hooks/useAlertas.ts
  hooks/useReconhecerAlerta.ts    ← void useMutation padrão
  hooks/useRegrasAlerta.ts
  components/AlertasPage.tsx
  components/RegrasAlertaPage.tsx ← admin only
  components/AlertasWidget.tsx    ← widget para o dashboard
  index.ts
```

### Regras de negócio críticas

- Suplementar: limiar deve vir da `regras_alerta` — **nunca hardcoded** (CCT construção civil varia: 175h PME, 150h médias/grandes)
- Idempotência obrigatória: executar `avaliar_regras_alerta()` duas vezes não duplica alertas
- Alerta resolvido automaticamente quando condição deixa de ser verdadeira
- Widget no dashboard substitui o painel de alertas de stock (ou coexiste com ele)

### Tipos de alertas a configurar por defeito (seed data)

| tipo | campo_ref | limiar_atencao | limiar_urgente |
|---|---|---|---|
| REVISAO_KM | km_atual - km_ultima_revisao | 8000 | 10000 |
| REVISAO_HORAS | horas_acumuladas - horas_ultima_revisao | 180 | 200 |
| SEGURO | data_fim_seguro - today | 30 dias | 7 dias |
| IPO | data_proxima_ipo - today | 45 dias | 14 dias |
| SUPLEMENTAR | horas_supl_acumuladas / limite_anual | 80% | 100% |

### Critérios de conclusão

- [ ] Migration + types regenerados
- [ ] `avaliar_regras_alerta()` é idempotente (teste: executar 2× → sem duplicados)
- [ ] Alerta resolvido automaticamente quando condição cessa
- [ ] Widget visível no dashboard existente
- [ ] Testes: idempotência, resolução automática, limiar atencao vs urgente

---

## Fase 2 — Horário de Trabalho, Faltas e Conformidade Laboral `[CONCLUÍDA]`

**Semanas:** 5–8  
**Depende de:** F0  
**Atenção:** Contém dados sensíveis (RGPD art. 9.º) e regras legais (Código do Trabalho PT)

### Migration

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_fase2_horarios.sql

CREATE TABLE public.horarios (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  designacao        text    NOT NULL,
  periodo_diario_h  numeric NOT NULL,
  periodo_semanal_h numeric NOT NULL,
  intervalo_min     int,
  intervalo_inicio  time,
  intervalo_fim     time,
  dias_semana       int[] NOT NULL,  -- [1,2,3,4,5] = Seg-Sex
  hora_entrada      time NOT NULL,
  hora_saida        time NOT NULL,
  tolerancia_entrada_min int DEFAULT 5,  -- renomeado vs spec original (mais preciso)
  ativo             boolean DEFAULT true,
  valido_de         date,
  valido_ate        date
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
  tipo       text NOT NULL,  -- 'FERIADO' | 'PONTE' | 'EXCEÇÃO_EMPRESA'
  designacao text NOT NULL,
  ambito     text NOT NULL   -- 'nacional' | 'municipal' | 'empresa'
);

-- custo/hora por colaborador com período de vigência
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
  desvio                  numeric,  -- efetivas - previstas
  horas_supl_propostas    numeric,  -- max(desvio, 0) — proposto pelo sistema
  horas_supl_validadas    numeric,  -- preenchido pelo gestor, nunca automático
  validado_por            uuid REFERENCES auth.users(id),
  validado_em             timestamptz,
  PRIMARY KEY (colaborador_id, data)
);

CREATE TABLE public.tipos_falta (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  designacao   text NOT NULL,
  justificada  boolean,   -- null = depende de prova; true = sempre just.; false = sempre injust.
  descontavel  boolean DEFAULT true
);

CREATE TABLE public.faltas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id    uuid NOT NULL REFERENCES colaboradores(id),
  data_inicio       date NOT NULL,
  data_fim          date NOT NULL,
  periodo           text,  -- 'DIA' | 'MANHA' | 'TARDE' | 'HORAS'
  tipo_falta_id     uuid REFERENCES tipos_falta(id),
  estado            text NOT NULL DEFAULT 'COMUNICADA',
  -- COMUNICADA → COM_COMPROVATIVO → JUSTIFICADA | INJUSTIFICADA
  justificacao_texto text,
  comprovativo_key  text,   -- bucket 'comprovativos-medicos' — RGPD art. 9.º
  dado_saude        boolean DEFAULT false,
  previsivel        boolean DEFAULT false,  -- ausência prevista (férias, baixa programada)
  comunicada_em     timestamptz DEFAULT now(),
  prazo_prova_ate   date,   -- calculado via trigger: data_inicio + 15 (CT art. 254.º)
  decidida_por      uuid REFERENCES auth.users(id),
  decidida_em       timestamptz
);

-- Trigger: calcular prazo_prova_ate automaticamente
CREATE OR REPLACE FUNCTION fn_calcular_prazo_prova()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.prazo_prova_ate := NEW.data_inicio + INTERVAL '15 days';
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_prazo_prova
  BEFORE INSERT ON faltas
  FOR EACH ROW EXECUTE FUNCTION fn_calcular_prazo_prova();

-- RLS
ALTER TABLE public.horarios           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horario_colaborador ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feriados_excecoes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custo_hora_colaborador ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resumo_assiduidade_dia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipos_falta        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faltas             ENABLE ROW LEVEL SECURITY;

-- Políticas: leitura para todos os autenticados, escrita restrita
CREATE POLICY "horarios_sel" ON horarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "horarios_write" ON horarios FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') IN ('admin', 'gestor'));

CREATE POLICY "faltas_sel" ON faltas FOR SELECT TO authenticated USING (true);
CREATE POLICY "faltas_write" ON faltas FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') IN ('admin', 'gestor'));

-- custo/hora: só admin lê e escreve (dado salarial)
CREATE POLICY "custo_hora_admin" ON custo_hora_colaborador FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin');

GRANT SELECT, INSERT, UPDATE ON TABLE public.horarios TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.horario_colaborador TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.feriados_excecoes TO authenticated;
GRANT SELECT ON TABLE public.custo_hora_colaborador TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.custo_hora_colaborador TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.resumo_assiduidade_dia TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.tipos_falta TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.faltas TO authenticated;

-- Bucket para comprovativos médicos (criar via Supabase Dashboard ou seed)
-- Nome: 'comprovativos-medicos'
-- RLS: só admin acede — dado de saúde RGPD art. 9.º
-- Bucket para certificados normais: 'certificados' — authenticated lê

-- RPC diária de cálculo de resumo
CREATE OR REPLACE FUNCTION public.calcular_resumo_dia(p_data date)
RETURNS void LANGUAGE plpgsql AS $$
-- 1. Para cada colaborador ativo com horário vigente em p_data:
--    a. Verificar se p_data é dia útil (não é feriado nem fora de dias_semana)
--    b. horas_previstas = periodo_diario_h do horário (ou 0 se dia não útil)
--    c. horas_efetivas = soma de durações entre pares ENTRADA/SAÍDA das picagens validadas
--    d. desvio = horas_efetivas - horas_previstas
--    e. horas_supl_propostas = max(desvio, 0)
--    f. horas_supl_validadas = NULL (preenchido pelo gestor — nunca automático)
-- 2. UPSERT em resumo_assiduidade_dia
BEGIN
  NULL; -- implementação completa a desenvolver
END; $$;

GRANT EXECUTE ON FUNCTION public.calcular_resumo_dia(date) TO authenticated;

SELECT cron.schedule(
  'calcular-resumo-assiduidade',
  '30 22 * * *',  -- 22:30 UTC = 23:30 Lisboa inverno, após fim do dia de trabalho
  $$SELECT public.calcular_resumo_dia(CURRENT_DATE)$$
);
```

### Ficheiros a criar

```
src/features/horarios/
  services/horariosService.ts
  services/faltasService.ts
  services/assiduidadeService.ts
  hooks/useHorarios.ts
  hooks/useAssiduidadeMes.ts         ← useAsync(colaborador_id, mes)
  hooks/useGuardarHorario.ts
  hooks/useRegistarFalta.ts
  hooks/useValidarSupplementar.ts    ← gestor valida horas supl propostas
  components/HorariosPage.tsx        ← admin: CRUD de tipos de horário
  components/AtribuicaoHorarioPage.tsx ← atribuir horário a colaborador
  components/AssiduidadePage.tsx     ← calendário mensal por colaborador
  components/FaltasPage.tsx          ← lista + fluxo de estado
  components/ValidarSupplementarPage.tsx
  index.ts
```

### Regras de negócio críticas (NUNCA ignorar)

- `horas_supl_validadas` NUNCA é preenchida automaticamente — sempre pelo gestor
- O limite de suplementar (175h PME / 150h outras) vem da `regras_alerta` (F1) — nunca hardcoded
- Comprovativo médico vai para o bucket `comprovativos-medicos` (RLS admin-only)
- `prazo_prova_ate` é calculado pelo trigger, nunca pelo cliente
- Tolerância de entrada (default 5 min) não gera desvio nem horas suplementares
- Feriado no `feriados_excecoes` → `horas_previstas = 0` para esse dia

### Critérios de conclusão

- [ ] Migration aplicada, tipos regenerados
- [ ] `npm run typecheck` — 0 erros
- [ ] Teste: suplementar nunca auto-validado (campo `horas_supl_validadas` NULL após calcular_resumo_dia)
- [ ] Teste: feriado → horas_previstas = 0
- [ ] Teste: tolerância de 5 min não conta como desvio
- [ ] Teste: `prazo_prova_ate` = data_inicio + 15 dias (incluindo meses com 28/30/31 dias)
- [ ] Teste: operador não acede ao bucket `comprovativos-medicos` (deve receber 403)
- [ ] Regra de alerta para prazo de prova criada automaticamente ao inserir falta

---

## Fase 3 — Picagem de Presenças MVP (sem geofence) `[ ]`

**Semanas:** 9–10  
**Depende de:** F0, F2  
**Nota:** Geofence é adicionada na F5. Aqui o resultado é sempre `PENDENTE_VALIDACAO`.

### Migration

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_fase3_picagens.sql

CREATE TABLE public.picagens (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id        uuid NOT NULL REFERENCES colaboradores(id),
  obra_id               uuid NOT NULL REFERENCES obras(id),
  tipo                  text NOT NULL,
  -- 'ENTRADA' | 'SAIDA' | 'PAUSA_INI' | 'PAUSA_FIM'
  timestamp_dispositivo timestamptz NOT NULL,
  timestamp_servidor    timestamptz DEFAULT now(),
  desvio_relogio_s      int,  -- timestamp_servidor - timestamp_dispositivo em segundos
  resultado             text NOT NULL DEFAULT 'PENDENTE_VALIDACAO',
  -- MVP: sempre PENDENTE_VALIDACAO
  -- F5 adiciona: 'AUTORIZADA' | 'RECUSADA'
  origem                text NOT NULL DEFAULT 'ONLINE',
  -- 'ONLINE' | 'OFFLINE' | 'RETROATIVA'
  hora_original_proposta timestamptz,  -- quando gestor corrige hora
  hora_final_validada   timestamptz,
  justificacao          text,
  validada_por          uuid REFERENCES auth.users(id),
  validada_em           timestamptz
  -- colunas PostGIS (posicao, precisao_m, distancia_geofence_m, mock_location_detetada)
  -- serão adicionadas na Fase 5 via ALTER TABLE
);

ALTER TABLE public.picagens ENABLE ROW LEVEL SECURITY;

-- Colaborador vê as suas próprias picagens; gestor/admin vê todas
CREATE POLICY "picagens_own" ON picagens FOR SELECT TO authenticated
  USING (
    colaborador_id IN (
      SELECT id FROM colaboradores WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'role') IN ('admin', 'gestor')
  );

CREATE POLICY "picagens_insert" ON picagens FOR INSERT TO authenticated
  WITH CHECK (true);  -- colaborador insere a sua própria; RPC valida colaborador_id

CREATE POLICY "picagens_update" ON picagens FOR UPDATE TO authenticated
  USING ((auth.jwt() ->> 'role') IN ('admin', 'gestor'));

GRANT SELECT, INSERT ON TABLE public.picagens TO authenticated;
GRANT UPDATE ON TABLE public.picagens TO authenticated;
```

### Ficheiros a criar

```
src/features/picagens/
  services/picagensService.ts
  hooks/usePicar.ts                   ← useMutation que escreve + offline queue
  hooks/usePicagensDia.ts             ← useAsync (colaborador, data)
  hooks/useValidarPicagens.ts         ← gestor valida em lote
  hooks/usePicagensOfflineQueue.ts    ← adaptar padrão de useOfflineQueue existente
  components/PicagemPage.tsx          ← ecrã mobile-first principal
  components/ValidacaoPicagensPage.tsx ← vista gestor: por obra/dia
  index.ts
```

### Requisitos UI obrigatórios (ecrã de picagem)

- Touch targets mínimos **60×60 px** — operadores usam luvas em estaleiro
- Botão de ENTRADA / SAÍDA em destaque — uma ação primária por ecrã
- Obra selecionada persiste no localStorage entre sessões
- Indicador offline visível quando `navigator.onLine === false`
- Feedback visual imediato (optimistic UI) — não esperar pelo servidor
- Histórico do dia do colaborador visível abaixo do botão principal

### Offline queue

- Quando `navigator.onLine === false`: enqueue com `origem = 'OFFLINE'`
- Sync automático ao reconectar (event listener `online`)
- `desvio_relogio_s` calculado no sync: `timestamp_servidor - timestamp_dispositivo`
- Usar o mesmo padrão de `useOfflineQueue` em `src/features/movimentos/hooks/`

### Critérios de conclusão

- [ ] Migration + types regenerados
- [ ] Teste: enqueue offline → sync quando online → origem = 'OFFLINE'
- [ ] Teste: desvio de relógio calculado correctamente
- [ ] Teste: gestor consegue corrigir hora (hora_original_proposta preservada)
- [ ] Teste em Chrome Android — touch targets, permissão de localização não pedida (F5)
- [ ] `calcular_resumo_dia` (F2) usa picagens validadas desta tabela

---

## Fase 4 — EPIs e Formações `[ ]`

**Semanas:** 11–12  
**Depende de:** F0, F1

### Migration

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_fase4_epis_formacoes.sql

CREATE TABLE public.tipos_epi (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  designacao    text NOT NULL,
  validade_dias int,     -- null = sem validade periódica
  obrigatorio   boolean DEFAULT true
);

CREATE TABLE public.atribuicoes_epi (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  uuid NOT NULL REFERENCES colaboradores(id),
  tipo_epi_id     uuid NOT NULL REFERENCES tipos_epi(id),
  data_entrega    date NOT NULL,
  data_validade   date,   -- calculada: data_entrega + tipos_epi.validade_dias
  devolvido       boolean DEFAULT false,
  data_devolucao  date
);

CREATE TABLE public.tipos_formacao (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  designacao    text NOT NULL,
  validade_anos int,     -- null = vitalício (não gera alerta)
  obrigatoria   boolean DEFAULT false
);

CREATE TABLE public.formacoes_colaborador (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  uuid NOT NULL REFERENCES colaboradores(id),
  tipo_id         uuid NOT NULL REFERENCES tipos_formacao(id),
  data_conclusao  date NOT NULL,
  data_validade   date,  -- calculada: data_conclusao + (validade_anos * 365)
  certificado_key text,  -- bucket 'certificados' (RLS: authenticated lê, admin/gestor escreve)
  entidade        text   -- entidade formadora
);

ALTER TABLE public.tipos_epi             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atribuicoes_epi       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipos_formacao        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formacoes_colaborador ENABLE ROW LEVEL SECURITY;

-- Políticas: leitura para todos; escrita para admin/gestor
CREATE POLICY "epi_sel"   ON tipos_epi       FOR SELECT TO authenticated USING (true);
CREATE POLICY "epi_write" ON tipos_epi       FOR ALL    TO authenticated USING ((auth.jwt() ->> 'role') IN ('admin','gestor'));
CREATE POLICY "atrib_sel" ON atribuicoes_epi FOR SELECT TO authenticated USING (true);
CREATE POLICY "atrib_write" ON atribuicoes_epi FOR ALL TO authenticated USING ((auth.jwt() ->> 'role') IN ('admin','gestor'));
CREATE POLICY "form_sel"  ON tipos_formacao  FOR SELECT TO authenticated USING (true);
CREATE POLICY "form_write" ON tipos_formacao FOR ALL    TO authenticated USING ((auth.jwt() ->> 'role') IN ('admin','gestor'));
CREATE POLICY "form_colab_sel" ON formacoes_colaborador FOR SELECT TO authenticated USING (true);
CREATE POLICY "form_colab_write" ON formacoes_colaborador FOR ALL TO authenticated USING ((auth.jwt() ->> 'role') IN ('admin','gestor'));

GRANT SELECT, INSERT, UPDATE ON TABLE public.tipos_epi TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.atribuicoes_epi TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.tipos_formacao TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.formacoes_colaborador TO authenticated;
```

### Ficheiros a criar

```
src/features/epis/
  services/episService.ts
  services/formacoesService.ts
  hooks/useEpisColaborador.ts
  hooks/useFormacoesColaborador.ts
  hooks/useAtribuirEpi.ts
  hooks/useRegistarFormacao.ts
  components/EpisPage.tsx              ← lista EPIs por colaborador
  components/FormacoesPage.tsx
  components/FichaSegurancaPage.tsx    ← vista consolidada EPI + formação por colaborador
  index.ts
```

### Integração com Motor de Alertas (F1)

- Ao criar `atribuicoes_epi` com `data_validade`: criar automaticamente regra de alerta tipo `EPI_VALIDADE`
- Ao devolver EPI (`devolvido = true`): cancelar regra de alerta associada
- Ao criar `formacoes_colaborador` com `data_validade`: criar regra tipo `FORMACAO_VALIDADE`
- Formação vitalícia (`validade_anos = null`) não cria alerta

### Critérios de conclusão

- [ ] Migration + types regenerados
- [ ] Teste: EPI com validade → regra de alerta criada automaticamente
- [ ] Teste: EPI devolvido → regra de alerta cancelada
- [ ] Teste: formação vitalícia → sem regra de alerta
- [ ] Bucket `certificados`: authenticated lê, admin/gestor escreve, operador não escreve

---

## Fase 5 — Picagem com Validação por Geofence (PostGIS) `[ ]`

**Semanas:** 13–14  
**Depende de:** F3

### Migration

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_fase5_geofence.sql

-- PostGIS está disponível no Supabase — apenas activar
CREATE EXTENSION IF NOT EXISTS postgis;

-- Adicionar geofence às obras
ALTER TABLE public.obras
  ADD COLUMN geofence_tipo     text,   -- 'RAIO' | 'POLIGONO'
  ADD COLUMN geofence_centro   geography(Point, 4326),
  ADD COLUMN geofence_raio_m   int,
  ADD COLUMN geofence_poligono geography(Polygon, 4326);

-- Adicionar localização às picagens (upgrade incremental)
ALTER TABLE public.picagens
  ADD COLUMN posicao               geography(Point, 4326),
  ADD COLUMN precisao_m            int,
  ADD COLUMN distancia_geofence_m  int,
  ADD COLUMN mock_location_detetada boolean DEFAULT false;
-- Nota: mock_location_detetada é sempre false na PWA (sem API nativa)
-- Mantido para compatibilidade futura com Flutter se adoptado

-- Índices espaciais
CREATE INDEX ON obras    USING gist(geofence_centro);
CREATE INDEX ON obras    USING gist(geofence_poligono);
CREATE INDEX ON picagens USING gist(posicao);

-- RPC atómica de registo com validação geofence
CREATE OR REPLACE FUNCTION public.registar_picagem_geofence(
  p_colaborador_id  uuid,
  p_obra_id         uuid,
  p_tipo            text,
  p_lat             float8,
  p_lon             float8,
  p_precisao_m      int,
  p_timestamp_disp  timestamptz DEFAULT now()
) RETURNS json LANGUAGE plpgsql AS $$
DECLARE
  obra       obras%rowtype;
  pt         geography;
  distancia  float8;
  resultado  text;
  nova_id    uuid;
BEGIN
  SELECT * INTO obra FROM obras WHERE id = p_obra_id;
  pt := ST_MakePoint(p_lon, p_lat)::geography;

  IF obra.geofence_tipo = 'RAIO' AND obra.geofence_centro IS NOT NULL THEN
    distancia := ST_Distance(pt, obra.geofence_centro);
    resultado := CASE WHEN distancia <= obra.geofence_raio_m
      THEN 'AUTORIZADA' ELSE 'PENDENTE_VALIDACAO' END;
  ELSIF obra.geofence_tipo = 'POLIGONO' AND obra.geofence_poligono IS NOT NULL THEN
    resultado := CASE WHEN ST_Within(pt, obra.geofence_poligono)
      THEN 'AUTORIZADA' ELSE 'PENDENTE_VALIDACAO' END;
    distancia := ST_Distance(pt, obra.geofence_poligono);
  ELSE
    resultado := 'PENDENTE_VALIDACAO';
    distancia := NULL;
  END IF;

  -- Precisão fraca → sempre pendente mesmo dentro do geofence
  IF p_precisao_m > 50 THEN resultado := 'PENDENTE_VALIDACAO'; END IF;

  INSERT INTO picagens (
    colaborador_id, obra_id, tipo,
    timestamp_dispositivo, posicao, precisao_m,
    distancia_geofence_m, resultado, origem
  ) VALUES (
    p_colaborador_id, p_obra_id, p_tipo,
    p_timestamp_disp, pt, p_precisao_m,
    distancia::int, resultado, 'ONLINE'
  ) RETURNING id INTO nova_id;

  RETURN json_build_object(
    'id', nova_id,
    'resultado', resultado,
    'distancia_m', distancia::int
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.registar_picagem_geofence(uuid,uuid,text,float8,float8,int,timestamptz) TO authenticated;
```

### Alterações nos ficheiros existentes (F3)

- `usePicar.ts`: detectar se obra tem geofence configurada; se sim, pedir `navigator.geolocation.getCurrentPosition` e chamar `registar_picagem_geofence` RPC; se não, manter fluxo MVP
- `PicagemPage.tsx`: mostrar distância ao geofence se disponível; aviso de GPS fraco se precisão > 50 m; não pedir permissão de localização no load da app — só ao picar

### Configuração de geofence nas obras

- Adicionar campo de configuração de geofence ao formulário/drawer de obras existente
- UI: mapa com marcador arrastável para centro + slider de raio (tipo RAIO)
- Biblioteca de mapas: usar Leaflet (leve, sem API key) com tiles OpenStreetMap

### Critérios de conclusão

- [ ] Migration + types regenerados
- [ ] Teste: ponto dentro do raio → `AUTORIZADA`
- [ ] Teste: ponto fora do raio → `PENDENTE_VALIDACAO`
- [ ] Teste: precisão > 50 m → `PENDENTE_VALIDACAO` mesmo dentro do raio
- [ ] Teste: obra sem geofence → `PENDENTE_VALIDACAO` (nunca erro)
- [ ] Teste: GPS não autorizado → fallback para fluxo MVP sem geofence (não bloqueia picagem)

---

## Fase 6 — Ingestão e Classificação de Faturas de Fornecedor `[ ]`

**Semanas:** 15–18  
**Depende de:** F0 (fornecedores já existem em `subempreiteiros`)

### Arquitectura de extração

Upload manual de PDF → Edge Function → Claude Vision API → sugestões de linha → ecrã de classificação → confirmação → aprendizagem incremental.

**Segurança crítica:** A chave `ANTHROPIC_API_KEY` fica APENAS na Edge Function Supabase via `supabase secrets set ANTHROPIC_API_KEY=...`. NUNCA em VITE_ env vars nem no cliente React.

### Migration

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_fase6_faturas.sql

CREATE TABLE public.faturas_fornecedor (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id  uuid REFERENCES subempreiteiros(id),
  numero         text,
  atcud          text,
  data           date,
  total          numeric,
  total_iva      numeric,
  estado         text NOT NULL DEFAULT 'RECEBIDA',
  -- 'RECEBIDA' → 'EXTRAIDA' → 'CLASSIFICADA' → 'LANCADA'
  template_usado_id uuid,
  anexo_key      text,   -- bucket 'faturas-fornecedor'
  extraido_em    timestamptz,
  criado_por     uuid REFERENCES auth.users(id),
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE public.linhas_fatura (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fatura_id        uuid NOT NULL REFERENCES faturas_fornecedor(id),
  ordem            int,
  descricao        text NOT NULL,
  descricao_norm   text,   -- lowercase sem acentos — usado para matching de regras
  quantidade       numeric,
  unidade          text,
  preco_unitario   numeric,
  total_linha      numeric,
  taxa_iva         numeric,
  destino          text,
  -- 'OBRA' | 'ARMAZEM' | 'CONSUMO_DIRETO' | null (não classificada)
  obra_id          uuid REFERENCES obras(id),
  artigo_id        uuid REFERENCES produtos(id),
  classificada_por uuid REFERENCES auth.users(id),
  classificada_em  timestamptz
);

CREATE TABLE public.regras_classificacao (
  fornecedor_id    uuid NOT NULL REFERENCES subempreiteiros(id),
  descricao_norm   text NOT NULL,
  destino          text NOT NULL,
  artigo_id        uuid REFERENCES produtos(id),
  confianca        numeric NOT NULL DEFAULT 0.5,  -- 0-1
  ocorrencias      int NOT NULL DEFAULT 1,
  PRIMARY KEY (fornecedor_id, descricao_norm)
);

ALTER TABLE public.faturas_fornecedor  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linhas_fatura       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regras_classificacao ENABLE ROW LEVEL SECURITY;

-- Apenas admin e gestor gerem faturas
CREATE POLICY "fat_sel"  ON faturas_fornecedor FOR SELECT TO authenticated USING ((auth.jwt() ->> 'role') IN ('admin','gestor'));
CREATE POLICY "fat_all"  ON faturas_fornecedor FOR ALL    TO authenticated USING ((auth.jwt() ->> 'role') IN ('admin','gestor'));
CREATE POLICY "lin_sel"  ON linhas_fatura      FOR SELECT TO authenticated USING ((auth.jwt() ->> 'role') IN ('admin','gestor'));
CREATE POLICY "lin_all"  ON linhas_fatura      FOR ALL    TO authenticated USING ((auth.jwt() ->> 'role') IN ('admin','gestor'));
CREATE POLICY "reg_all"  ON regras_classificacao FOR ALL  TO authenticated USING ((auth.jwt() ->> 'role') IN ('admin','gestor'));

GRANT SELECT, INSERT, UPDATE ON TABLE public.faturas_fornecedor  TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.linhas_fatura        TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.regras_classificacao TO authenticated;
```

### Edge Function

```
supabase/functions/extrair-fatura/index.ts
```

Lógica:
1. Recebe `fatura_id`
2. Lê PDF do bucket `faturas-fornecedor` como base64
3. Chama `anthropic.messages.create` com `claude-sonnet-4-6` e conteúdo do PDF em base64
4. Prompt pede JSON estruturado: `{ numero, data, linhas: [{ ordem, descricao, quantidade, preco_unitario, taxa_iva }] }`
5. Valida JSON recebido (schema simples)
6. Normaliza `descricao` (lowercase, remover acentos) → `descricao_norm`
7. Para cada linha, verifica `regras_classificacao` do fornecedor — pré-preenche `destino` e `artigo_id` se `confianca > 0.8`
8. INSERT em `linhas_fatura`
9. UPDATE `faturas_fornecedor.estado = 'EXTRAIDA'`

### Ficheiros a criar

```
src/features/faturas/
  services/faturasService.ts
  hooks/useFaturas.ts
  hooks/useUploadFatura.ts         ← upload PDF + trigger Edge Function
  hooks/useClassificarFatura.ts    ← confirmar classificação de linhas
  components/FaturasPage.tsx       ← lista de faturas por estado
  components/ClassificarFaturaPage.tsx ← split view: PDF + linhas
  index.ts

supabase/functions/extrair-fatura/
  index.ts
```

### Fluxo de confirmação (aprendizagem incremental)

Ao confirmar classificação de uma linha:
- Se já existe regra para `(fornecedor_id, descricao_norm)`: incrementar `ocorrencias`, recalcular `confianca`
- Se não existe: INSERT com `ocorrencias = 1`, `confianca = 0.5`
- Destino `ARMAZEM`: criar movimento de entrada em `movimentos_stock` automaticamente
- Destino `OBRA`: lançar custo em custos da obra

### Critérios de conclusão

- [ ] Migration + types regenerados
- [ ] Edge Function: `ANTHROPIC_API_KEY` não aparece em logs, só no secret
- [ ] Teste: normalização de texto (acentos, maiúsculas) para matching de regras
- [ ] Teste: confiança incrementada após confirmação
- [ ] Teste: destino `ARMAZEM` cria movimento de entrada no stock
- [ ] Teste: Edge Function sem secret → 500 com mensagem clara (não expõe detalhes internos)

---

## Fase 7 — Custeio Consolidado por Obra `[ ]`

**Semanas:** 19–20  
**Depende de:** F2 (mão de obra), F6 (faturas)

### Extensão da RPC existente

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_fase7_custeio.sql

-- Adicionar campos de orçamento às obras
ALTER TABLE public.obras
  ADD COLUMN orcamento_materiais    numeric,
  ADD COLUMN orcamento_mao_obra     numeric,
  ADD COLUMN orcamento_combustivel  numeric,
  ADD COLUMN orcamento_fornecedores numeric;

-- Nova RPC substituindo/complementando custos_materiais_por_obra
CREATE OR REPLACE FUNCTION public.custos_consolidados_por_obra(
  p_obra_id   uuid,
  p_data_ini  date,
  p_data_fim  date
) RETURNS json LANGUAGE plpgsql AS $$
DECLARE
  v_materiais    numeric;
  v_combustivel  numeric;
  v_mao_obra     numeric;
  v_fornecedores numeric;
BEGIN
  -- Materiais: movimentos de saída com obra_id
  SELECT COALESCE(SUM(m.quantidade * p.custo_unitario), 0)
    INTO v_materiais
    FROM movimentos_stock m JOIN produtos p ON p.id = m.produto_id
   WHERE m.obra_id = p_obra_id AND m.tipo = 'saida'
     AND m.created_at::date BETWEEN p_data_ini AND p_data_fim;

  -- Combustível: abastecimentos com obra_id
  SELECT COALESCE(SUM(custo_total), 0)
    INTO v_combustivel
    FROM combustivel_abastecimentos
   WHERE obra_id = p_obra_id
     AND data BETWEEN p_data_ini AND p_data_fim;

  -- Mão de obra: horas efetivas × custo/hora vigente
  SELECT COALESCE(SUM(r.horas_efetivas * c.custo_normal), 0)
    INTO v_mao_obra
    FROM resumo_assiduidade_dia r
    JOIN LATERAL (
      SELECT custo_normal FROM custo_hora_colaborador
       WHERE colaborador_id = r.colaborador_id
         AND valido_de <= r.data
         AND (valido_ate IS NULL OR valido_ate >= r.data)
       ORDER BY valido_de DESC LIMIT 1
    ) c ON true
   WHERE r.obra_id = p_obra_id
     AND r.data BETWEEN p_data_ini AND p_data_fim;

  -- Faturas de fornecedor com destino = OBRA
  SELECT COALESCE(SUM(total_linha), 0)
    INTO v_fornecedores
    FROM linhas_fatura l
    JOIN faturas_fornecedor f ON f.id = l.fatura_id
   WHERE l.obra_id = p_obra_id
     AND l.destino = 'OBRA'
     AND f.data BETWEEN p_data_ini AND p_data_fim;

  RETURN json_build_object(
    'materiais',    v_materiais,
    'combustivel',  v_combustivel,
    'mao_de_obra',  v_mao_obra,
    'fornecedores', v_fornecedores,
    'total',        v_materiais + v_combustivel + v_mao_obra + v_fornecedores
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.custos_consolidados_por_obra(uuid,date,date) TO authenticated;
```

### Ficheiros a criar/modificar

```
src/features/custos/
  services/custosService.ts            ← modificar: usar nova RPC
  components/CustosObraPage.tsx        ← modificar: breakdown + orçamento vs real
  components/DashboardRentabilidade.tsx ← novo: gráfico por categoria (Canvas API)
```

### Critérios de conclusão

- [ ] Migration + types regenerados
- [ ] Teste: período sem movimentos retorna zeros (não null nem erro)
- [ ] Teste: custo mão de obra usa `custo_hora` vigente na data (valido_de/ate)
- [ ] Export CSV funciona com novos campos via `exportCsv` existente

---

## Fase 8 — Livro de Obra Digital e Guias de Transporte `[ ]`

**Semanas:** 21–22  
**Depende de:** F7

### Migration

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_fase8_livro_obra.sql

CREATE TABLE public.registos_obra (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id     uuid NOT NULL REFERENCES obras(id),
  data        date NOT NULL,
  categoria   text NOT NULL,
  -- 'OCORRENCIA' | 'VISITA' | 'CONDICOES_METEO' | 'PESSOAL' | 'EQUIPAMENTO'
  descricao   text NOT NULL,
  foto_keys   text[] DEFAULT '{}',  -- bucket 'fotos-obra'
  autor_id    uuid NOT NULL REFERENCES auth.users(id),
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE public.guias_transporte (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero        text UNIQUE NOT NULL,  -- gerado pela RPC (sequencial por obra)
  obra_id       uuid REFERENCES obras(id),
  viatura_id    uuid,
  motorista_id  uuid REFERENCES colaboradores(id),
  origem        text,
  destino       text,
  data_carga    date,
  estado        text NOT NULL DEFAULT 'EMITIDA',  -- 'EMITIDA' | 'ENTREGUE' | 'ANULADA'
  linhas        jsonb DEFAULT '[]'::jsonb,   -- [{ descricao, quantidade, unidade }]
  created_at    timestamptz DEFAULT now()
);

-- Numeração sequencial por obra (sem race condition — advisory lock)
CREATE OR REPLACE FUNCTION public.criar_guia_transporte(
  p_obra_id     uuid,
  p_motorista   uuid,
  p_origem      text,
  p_destino     text,
  p_data_carga  date,
  p_linhas      jsonb
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_numero text;
  v_seq    int;
  v_id     uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('guia_' || p_obra_id::text));
  SELECT COALESCE(MAX(CAST(split_part(numero, '-', 2) AS int)), 0) + 1
    INTO v_seq FROM guias_transporte WHERE obra_id = p_obra_id;
  v_numero := 'GT-' || LPAD(v_seq::text, 4, '0');

  INSERT INTO guias_transporte (numero, obra_id, motorista_id, origem, destino, data_carga, linhas)
  VALUES (v_numero, p_obra_id, p_motorista, p_origem, p_destino, p_data_carga, p_linhas)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

ALTER TABLE public.registos_obra    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guias_transporte ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reg_obra_sel"  ON registos_obra    FOR SELECT TO authenticated USING (true);
CREATE POLICY "reg_obra_ins"  ON registos_obra    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "reg_obra_upd"  ON registos_obra    FOR UPDATE TO authenticated
  USING ((auth.jwt() ->> 'role') IN ('admin','gestor') OR autor_id = auth.uid());
CREATE POLICY "guias_all"     ON guias_transporte FOR ALL    TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE ON TABLE public.registos_obra    TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.guias_transporte TO authenticated;
GRANT EXECUTE ON FUNCTION public.criar_guia_transporte(uuid,uuid,text,text,date,jsonb) TO authenticated;
```

### Ficheiros a criar

```
src/features/livro-obra/
  services/livroObraService.ts
  services/guiasTransporteService.ts
  hooks/useLivroObra.ts
  hooks/useRegistarOcorrencia.ts
  hooks/useCriarGuia.ts
  components/LivroObraPage.tsx       ← timeline diária, filtro por categoria
  components/GuiasTransportePage.tsx ← lista + emissão
  components/GuiaPrintView.tsx       ← vista de impressão (CSS @media print)
  index.ts
```

### Critérios de conclusão

- [ ] Migration + types regenerados
- [ ] Teste: numeração de guia sequencial e única por obra (advisory lock)
- [ ] Teste: registo sem foto é válido (`foto_keys = []`)
- [ ] Export PDF do livro de obra via `window.print()` com CSS @media print
- [ ] QR code na guia (reutilizar componente QR existente do módulo de combustível)

---

## Fase 9 — Frota: Manutenção, Checklists e Responsabilização `[IMPLEMENTADA — por publicar]`

**Origem:** pedido do Carlos (mecânico responsável pelos ligeiros), 2026-09-29.

### Estado da implementação (2026-09-29)

Implementada e testada; o desenho abaixo continua válido, com estas diferenças
encontradas ao implementar:

- **Notificações com texto** (`send-push-frota`): o service worker mostrava sempre
  "Novo pedido de abastecimento" para qualquer push — uma push de frota sem
  conteúdo apareceria com o texto errado. A função envia o texto cifrado conforme a
  RFC 8291 (testado byte a byte contra o exemplo da norma); push sem conteúdo
  continua a ser o combustível, como antes.
- **`send-push` (combustível) filtrado por papel**: mandava para todas as
  subscrições; como o mecânico passa a subscrever, passaria a receber pedidos de
  combustível. Agora só admin/gestor — exatamente quem já os recebia.
- Envio diário por agendamento no Dashboard (Integrations → Cron → Edge Function)
  com o cabeçalho `x-frota-secret`; a função avalia a frota antes de enviar.
- Abastecimento com contador reavalia na hora os prazos em km dessa viatura
  (trigger protegido: um erro da frota nunca impede um abastecimento).
- As 4 regras antigas (REVISAO_KM/DATA, SEGURO, IPO) ficam desligadas e os dados
  das colunas de `comb_veiculos` passam para a frota; o formulário da viatura
  aponta para a Frota em vez de editar essas colunas.
- Catálogo sem apagar (só desativar) — o histórico nunca perde a referência.
- Escolha de quem recebe as notificações: só admin (a lista de utilizadores só é
  legível pelo admin — `profiles_select_own_or_admin`).
- Mecânico: o site mostra-lhe só a Frota (menu, navegação móvel e redireção no
  `MainLayout`); a leitura dos outros módulos no Postgres continua aberta a
  qualquer autenticado, como para o papel `leitura` — escrever, só na frota.
- `frota_resumo_viaturas()`: lista da frota numa só consulta.

Verificação: 79 testes de banco num Postgres real (papéis reais: anónimo,
mecânico, armazém, leitura, gestor, admin, papel de serviço) + 16/16 mutações no SQL;
6 testes Deno da `send-push-frota` (incl. o exemplo da RFC 8291 byte a byte e a
decifragem do lado do recetor); 75 testes do site (lógica, páginas de checklist e
manutenção, isolamento do mecânico, menu, notificação do service worker, prazos);
18/18 mutações no site e na função. Suíte completa 637/637 (Node local e Node 24).

### Publicação (ordem que nunca deixa nada partido)

1. SQL Editor: `20260929020000_fase9_papel_mecanico.sql`, **depois**
   `20260929030000_fase9_frota.sql`.
2. Edge Functions (Dashboard): `send-push` (filtro por papel),
   `admin-utilizadores` (aceita o papel mecânico) e a nova `send-push-frota`.
3. Segredo `FROTA_PUSH_SECRET` (valor aleatório) nos Secrets das Edge Functions.
4. Agendamento: Integrations → Cron → novo job → Edge Function `send-push-frota`,
   método POST, todos os dias às 08:00, cabeçalho `x-frota-secret: <o segredo>`.
5. Site (push para `main`).
6. Criar o utilizador do Carlos com o papel **Mecânico**; em Frota → Notificações
   escolher quem recebe (chefe + Carlos); cada um aceita as notificações no telemóvel.
**Depende de:** F1 (motor de alertas) e F0 (colaboradores) — já concluídas, reaproveitadas quase por inteiro.

### Por que este desenho (revisto em 2026-09-29 — ver histórico da conversa)

A primeira versão deste plano assumia uma lista fixa de itens (revisão, seguro,
IPO — os 4 tipos que a F1 já trata com colunas fixas em `comb_veiculos`). O
Carlos trouxe uma lista muito mais completa (inspeção rápida semanal, revisão
periódica por km/tempo, itens de longo prazo como a correia de distribuição, e
as obrigações legais portuguesas — IPO, seguro, IUC/selo, tacógrafo,
extintor...) e pediu explicitamente **autonomia total para personalizar**,
porque cada carrinha pode ter itens diferentes (nem todas têm AdBlue, nem
todas estão sujeitas a tacógrafo).

Uma coluna fixa em `comb_veiculos` por item (como a F1 fez para revisão/
seguro/IPO) não escala para isto — dezenas de colunas, e continuaria a
precisar de mim (migration) sempre que o Carlos quisesse acompanhar mais um
item. Em vez disso: **um catálogo de itens que o Carlos gere sozinho**, e uma
tabela de configuração por viatura que diz quais itens se aplicam a cada
carrinha e com que prazo. Nenhum item novo precisa de código ou migration —
só um registo no catálogo.

Os 4 campos que já existem em `comb_veiculos` (próxima revisão km/data,
seguro, IPO) continuam a existir e a funcionar exatamente como hoje — esta
fase não os apaga, só deixa de ser a única forma de acompanhar manutenção
(ver "Migração dos dados existentes" abaixo).

Módulo novo `src/features/frota/`, isolado dos módulos existentes — não
edita `combustivel/`, só lê `comb_veiculos` através do seu próprio service. O
único ponto de contacto com código existente é um link novo a partir de
`VeiculoFormPage` para a ficha (1 linha).

### Decisões tomadas (2026-09-29)

- **Acesso do Carlos:** papel novo `mecanico`, isolado — não herda acesso a
  armazém/ferramentas/stock.
- **Ficha da viatura:** botão "Imprimir" (`window.print()`), mesmo padrão de
  `GuiaPrintView`/`ToolLoanTermPrint` — sem biblioteca de PDF nova.
- **Checklist e manutenção: totalmente personalizável pelo Carlos**, por
  catálogo + configuração por viatura (ver abaixo) — não uma lista fixa.
- **Alertas só por push, exclusivo à app** — sem e-mail (Resend não está
  configurado). Só chegam a quem estiver na lista de destinatários de frota
  (não a todos os subscritos, como hoje acontece no combustível).
- **Registar manutenção atualiza a próxima revisão desse item
  automaticamente**, a partir do intervalo configurado (km e/ou meses).

### Modelo de dados — catálogo configurável

```
frota_itens_catalogo          ← o Carlos cria/edita/desativa itens aqui, sem código
  (chave, rótulo, categoria, natureza, unidade, intervalos e limiares por omissão)
        │
        │ 1 item do catálogo pode aplicar-se a 0..N viaturas
        ▼
frota_veiculo_itens            ← "este item aplica-se a esta viatura, com este prazo"
  (veiculo_id, item_id, ativo, intervalo/limiares próprios ou herdados do catálogo,
   próxima km/data, última km/data)
        │
        ├─→ alertas (motor genérico, 1 regra só: tipo 'FROTA_ITEM')
        └─→ veiculo_manutencoes (histórico do que já foi feito nesse item)
```

Itens de **natureza `CHECKLIST`** (ex.: nível de óleo, luzes, pneus — inspeção
visual, sem prazo) aparecem no formulário de checklist, agrupados por
categoria. Itens de **natureza `MANUTENCAO`** (ex.: troca de óleo, correia de
distribuição, seguro — têm prazo em km/meses) geram alertas e aparecem no
formulário de "registar manutenção".

### Migration

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_fase9_frota.sql

-- 1. Papel novo — isolado, sem acesso a outros módulos
ALTER TYPE public.role_utilizador ADD VALUE IF NOT EXISTS 'mecanico';

-- 2. Módulo 'frota' na função central de permissões (substitui a função
--    inteira — GRANT/CREATE OR REPLACE, não há ALTER incremental em funções)
CREATE OR REPLACE FUNCTION public.pode_escrever(modulo TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
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

-- 3. Catálogo de itens — o Carlos gere isto pela UI, sem precisar de mim
CREATE TABLE public.frota_itens_catalogo (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave          text NOT NULL UNIQUE,   -- slug estável, ex. 'oleo_motor', 'correia_distribuicao'
  rotulo         text NOT NULL,
  categoria      text NOT NULL,
  -- 'INSPECAO_RAPIDA' | 'REVISAO_PERIODICA' | 'LONGO_PRAZO' | 'OBRIGACAO_LEGAL'
  natureza       text NOT NULL,
  -- 'CHECKLIST' (verificação visual, sem prazo) | 'MANUTENCAO' (tem prazo, gera alerta)
  unidade        text,  -- 'KM' | 'MESES' | 'AMBOS' | NULL (itens só de checklist)
  intervalo_km_padrao    numeric,
  intervalo_meses_padrao numeric,
  limiar_atencao_km      numeric,
  limiar_urgente_km      numeric,
  limiar_atencao_dias    numeric,
  limiar_urgente_dias    numeric,
  ordem          int NOT NULL DEFAULT 0,
  ativo          boolean NOT NULL DEFAULT true,
  criado_por     uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  criado_em      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_item_categoria CHECK (categoria IN ('INSPECAO_RAPIDA','REVISAO_PERIODICA','LONGO_PRAZO','OBRIGACAO_LEGAL')),
  CONSTRAINT ck_item_natureza  CHECK (natureza IN ('CHECKLIST','MANUTENCAO')),
  CONSTRAINT ck_item_unidade   CHECK (unidade IS NULL OR unidade IN ('KM','MESES','AMBOS'))
);

-- 4. Configuração por viatura — "este item aplica-se a esta viatura, com este prazo"
CREATE TABLE public.frota_veiculo_itens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id      uuid NOT NULL REFERENCES public.comb_veiculos(id),
  item_id         uuid NOT NULL REFERENCES public.frota_itens_catalogo(id),
  ativo           boolean NOT NULL DEFAULT true,
  intervalo_km    numeric,  -- override; NULL = usa intervalo_km_padrao do catálogo
  intervalo_meses numeric,
  proxima_km      numeric,
  proxima_data    date,
  ultima_km       numeric,
  ultima_data     date,
  atualizado_em   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (veiculo_id, item_id)
);

-- 5. Histórico do que já foi feito (não só o que falta)
CREATE TABLE public.veiculo_manutencoes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id       uuid NOT NULL REFERENCES public.comb_veiculos(id),
  item_id          uuid REFERENCES public.frota_itens_catalogo(id),  -- NULL = manutenção avulsa
  descricao        text,  -- obrigatório se item_id for NULL
  data             date NOT NULL DEFAULT CURRENT_DATE,
  km_na_altura     numeric,
  custo            numeric(10,2),
  oficina          text,
  observacoes      text,
  atualiza_proxima boolean NOT NULL DEFAULT true,
  criado_por       uuid NOT NULL REFERENCES auth.users(id) DEFAULT auth.uid(),
  criado_em        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_manutencao_desc CHECK (item_id IS NOT NULL OR descricao IS NOT NULL)
);

-- 6. Checklist — snapshot dos itens no momento (o catálogo pode mudar depois
--    e o histórico não deve mudar com ele)
CREATE TABLE public.veiculo_checklists (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id    uuid NOT NULL REFERENCES public.comb_veiculos(id),
  data          date NOT NULL DEFAULT CURRENT_DATE,
  km_na_altura  numeric,
  itens         jsonb NOT NULL,
  -- [{ item_id, chave, rotulo, categoria, estado: 'OK'|'ATENCAO'|'MAU', observacao }, ...]
  estado_geral  text NOT NULL,  -- pior item entre os verificados
  foto_keys     text[] NOT NULL DEFAULT '{}',  -- bucket 'frota-checklists'
  criado_por    uuid NOT NULL REFERENCES auth.users(id) DEFAULT auth.uid(),
  criado_em     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_checklist_estado CHECK (estado_geral IN ('OK', 'ATENCAO', 'MAU'))
);

-- 7. Condutor responsável por período — histórico, não um campo simples
--    ("cada carrinha fica com 1 pessoa" mas pode mudar ao longo do tempo)
CREATE TABLE public.veiculo_atribuicoes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id     uuid NOT NULL REFERENCES public.comb_veiculos(id),
  colaborador_id uuid NOT NULL REFERENCES public.colaboradores(id),
  desde          date NOT NULL DEFAULT CURRENT_DATE,
  ate            date,  -- NULL = atribuição atual
  criado_por     uuid NOT NULL REFERENCES auth.users(id) DEFAULT auth.uid(),
  criado_em      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ux_veiculo_atribuicao_aberta
  ON public.veiculo_atribuicoes (veiculo_id) WHERE ate IS NULL;

-- 8. Quem recebe push de alertas de frota — pessoas específicas (chefe +
--    Carlos), não um papel inteiro (pode haver outros admins/gestores)
CREATE TABLE public.frota_alerta_destinatarios (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id),
  criado_em   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.frota_itens_catalogo       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frota_veiculo_itens        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.veiculo_manutencoes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.veiculo_checklists         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.veiculo_atribuicoes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frota_alerta_destinatarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "frota_catalogo_select" ON public.frota_itens_catalogo FOR SELECT TO authenticated USING (true);
CREATE POLICY "frota_catalogo_write"  ON public.frota_itens_catalogo FOR ALL TO authenticated
  USING (public.pode_escrever('frota'));

CREATE POLICY "frota_veiculo_itens_select" ON public.frota_veiculo_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY "frota_veiculo_itens_write"  ON public.frota_veiculo_itens FOR ALL TO authenticated
  USING (public.pode_escrever('frota'));

CREATE POLICY "manutencoes_select" ON public.veiculo_manutencoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "manutencoes_write"  ON public.veiculo_manutencoes FOR INSERT TO authenticated
  WITH CHECK (public.pode_escrever('frota'));

CREATE POLICY "checklists_select" ON public.veiculo_checklists FOR SELECT TO authenticated USING (true);
CREATE POLICY "checklists_write"  ON public.veiculo_checklists FOR INSERT TO authenticated
  WITH CHECK (public.pode_escrever('frota'));

CREATE POLICY "atribuicoes_select" ON public.veiculo_atribuicoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "atribuicoes_write"  ON public.veiculo_atribuicoes FOR ALL TO authenticated
  USING (public.pode_escrever('frota'));

CREATE POLICY "frota_destinatarios_select" ON public.frota_alerta_destinatarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "frota_destinatarios_write"  ON public.frota_alerta_destinatarios FOR ALL TO authenticated
  USING (public.auth_role() IN ('admin', 'gestor'));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.frota_itens_catalogo       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.frota_veiculo_itens        TO authenticated;
GRANT SELECT, INSERT                 ON TABLE public.veiculo_manutencoes        TO authenticated;
GRANT SELECT, INSERT                 ON TABLE public.veiculo_checklists         TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON TABLE public.veiculo_atribuicoes        TO authenticated;
GRANT SELECT, INSERT, DELETE         ON TABLE public.frota_alerta_destinatarios TO authenticated;
GRANT EXECUTE ON FUNCTION public.pode_escrever(TEXT) TO authenticated;

-- 9. RPC: registar manutenção de um item e avançar o próximo prazo, atomicamente
CREATE OR REPLACE FUNCTION public.registar_manutencao(
  p_veiculo_id uuid, p_item_id uuid, p_descricao text, p_data date, p_km numeric,
  p_custo numeric, p_oficina text, p_observacoes text, p_atualiza boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_item RECORD; v_intervalo_km numeric; v_intervalo_meses numeric;
BEGIN
  IF NOT public.pode_escrever('frota') THEN
    RAISE EXCEPTION 'Sem permissão para registar manutenção';
  END IF;

  INSERT INTO public.veiculo_manutencoes
    (veiculo_id, item_id, descricao, data, km_na_altura, custo, oficina, observacoes, atualiza_proxima)
  VALUES (p_veiculo_id, p_item_id, p_descricao, p_data, p_km, p_custo, p_oficina, p_observacoes, p_atualiza)
  RETURNING id INTO v_id;

  IF p_atualiza AND p_item_id IS NOT NULL THEN
    SELECT c.intervalo_km_padrao, c.intervalo_meses_padrao
      INTO v_intervalo_km, v_intervalo_meses
    FROM public.frota_itens_catalogo c WHERE c.id = p_item_id;

    INSERT INTO public.frota_veiculo_itens (veiculo_id, item_id, ultima_km, ultima_data, proxima_km, proxima_data)
    VALUES (
      p_veiculo_id, p_item_id, p_km, p_data,
      CASE WHEN v_intervalo_km    IS NOT NULL AND p_km IS NOT NULL THEN p_km + v_intervalo_km ELSE NULL END,
      CASE WHEN v_intervalo_meses IS NOT NULL THEN p_data + (v_intervalo_meses || ' months')::interval ELSE NULL END
    )
    ON CONFLICT (veiculo_id, item_id) DO UPDATE SET
      ultima_km     = EXCLUDED.ultima_km,
      ultima_data   = EXCLUDED.ultima_data,
      -- só avança o prazo se este veículo não tiver um intervalo próprio definido
      proxima_km    = COALESCE(
                         CASE WHEN public.frota_veiculo_itens.intervalo_km IS NOT NULL AND p_km IS NOT NULL
                              THEN p_km + public.frota_veiculo_itens.intervalo_km END,
                         EXCLUDED.proxima_km),
      proxima_data  = COALESCE(
                         CASE WHEN public.frota_veiculo_itens.intervalo_meses IS NOT NULL
                              THEN p_data + (public.frota_veiculo_itens.intervalo_meses || ' months')::interval END,
                         EXCLUDED.proxima_data),
      atualizado_em = now();
  END IF;

  RETURN v_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.registar_manutencao(uuid,uuid,text,date,numeric,numeric,text,text,boolean) TO authenticated;

-- 10. Motor de alertas — nova regra genérica 'FROTA_ITEM', um branch em
--     avaliar_regras_alerta() que percorre frota_veiculo_itens (não colunas
--     fixas). Os 4 alertas antigos (REVISAO_KM/DATA, SEGURO, IPO) continuam a
--     funcionar como hoje até serem migrados (ver secção seguinte).
INSERT INTO public.regras_alerta (tipo, entidade_alvo, campo_ref, destinatarios)
VALUES ('FROTA_ITEM', 'frota_item', 'frota_veiculo_itens.proxima_km / proxima_data', ARRAY['admin','gestor','mecanico'])
ON CONFLICT DO NOTHING;

-- Acrescentar a avaliar_regras_alerta() (CREATE OR REPLACE, ver migration da
-- F1 para o corpo completo a preservar) um bloco novo:
--
-- ELSIF r.tipo = 'FROTA_ITEM' THEN
--   FOR v IN
--     SELECT fvi.id, fvi.proxima_km, fvi.proxima_data,
--            COALESCE(fvi.intervalo_km, c.intervalo_km_padrao)       AS intervalo_km,
--            COALESCE(c.limiar_atencao_km,   2000) AS limiar_atencao_km,
--            COALESCE(c.limiar_urgente_km,    500) AS limiar_urgente_km,
--            COALESCE(c.limiar_atencao_dias,   30) AS limiar_atencao_dias,
--            COALESCE(c.limiar_urgente_dias,    7) AS limiar_urgente_dias,
--            cv.contador_atual   -- ver nota abaixo
--     FROM public.frota_veiculo_itens fvi
--     JOIN public.frota_itens_catalogo c ON c.id = fvi.item_id
--     JOIN public.comb_veiculos cv       ON cv.id = fvi.veiculo_id
--     WHERE fvi.ativo AND c.ativo AND c.natureza = 'MANUTENCAO' AND cv.ativo
--   LOOP
--     -- calcular faltam_km (proxima_km - km atual) e/ou faltam_dias
--     -- (proxima_data - CURRENT_DATE); severidade = pior dos dois quando os
--     -- dois existirem; PERFORM _upsert_alerta(regra_frota_item_id, v.id, sev, ...)
--   END LOOP;
--
-- Nota: "km atual" da viatura passa a precisar de ser uma consulta reutilizável
-- (hoje está inline em cada branch da F1: MAX(contador) de comb_abastecimentos)
-- — vale a pena extrair para uma função auxiliar `km_atual_veiculo(uuid)` nesta
-- migration, usada tanto pelo branch novo como, opcionalmente, a refatorar nos
-- branches antigos.

-- 11. Bucket para fotos do checklist — mesmo padrão de combustivel-taloes
--     (política de upload valida o caminho, ver migration 20260929000000)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('frota-checklists', 'frota-checklists', true, 10485760,
        ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif'])
ON CONFLICT DO NOTHING;

-- 12. alertas_detalhados: estender o CASE existente (ver F1) com o caso novo
-- CASE r.entidade_alvo
--   WHEN 'viatura'     THEN v.nome
--   WHEN 'colaborador' THEN c.nome
--   WHEN 'frota_item'  THEN cv2.nome || ' — ' || cat.rotulo
--   ELSE NULL
-- END AS entidade_nome
-- (LEFT JOIN frota_veiculo_itens fi2 ON fi2.id = a.entidade_id AND r.entidade_alvo = 'frota_item'
--  LEFT JOIN comb_veiculos cv2 ON cv2.id = fi2.veiculo_id
--  LEFT JOIN frota_itens_catalogo cat ON cat.id = fi2.item_id)

-- 13. Seed do catálogo — lista trazida pelo Carlos (confirmar antes de aplicar;
--     fica fácil de editar depois de aplicado, isto é só o ponto de partida)
INSERT INTO public.frota_itens_catalogo (chave, rotulo, categoria, natureza, unidade, intervalo_km_padrao, intervalo_meses_padrao) VALUES
  -- Nível 1 — Inspeção rápida (semanal / antes de sair)
  ('oleo_motor_nivel',      'Nível de óleo do motor',                     'INSPECAO_RAPIDA', 'CHECKLIST', NULL, NULL, NULL),
  ('liquido_refrigeracao',  'Líquido de refrigeração',                    'INSPECAO_RAPIDA', 'CHECKLIST', NULL, NULL, NULL),
  ('liquido_travoes_nivel', 'Líquido de travões (nível)',                 'INSPECAO_RAPIDA', 'CHECKLIST', NULL, NULL, NULL),
  ('liquido_lava_vidros',   'Líquido do lava-vidros',                     'INSPECAO_RAPIDA', 'CHECKLIST', NULL, NULL, NULL),
  ('pneus_visual',          'Pressão e estado visual dos pneus',          'INSPECAO_RAPIDA', 'CHECKLIST', NULL, NULL, NULL),
  ('luzes',                 'Luzes (médios, máximos, piscas, travão, marcha-atrás, nevoeiro)', 'INSPECAO_RAPIDA', 'CHECKLIST', NULL, NULL, NULL),
  ('limpa_para_brisas',     'Limpa-para-brisas e escovas',                'INSPECAO_RAPIDA', 'CHECKLIST', NULL, NULL, NULL),
  ('buzina',                'Buzina',                                     'INSPECAO_RAPIDA', 'CHECKLIST', NULL, NULL, NULL),
  ('avisos_painel',         'Avisos no painel (motor, ABS, airbag, pressão pneus)', 'INSPECAO_RAPIDA', 'CHECKLIST', NULL, NULL, NULL),
  ('fugas_visiveis',        'Fugas visíveis por baixo do veículo',        'INSPECAO_RAPIDA', 'CHECKLIST', NULL, NULL, NULL),
  ('documentos_a_bordo',    'Documentos a bordo (DUA, seguro, carta)',    'INSPECAO_RAPIDA', 'CHECKLIST', NULL, NULL, NULL),

  -- Nível 2 — Revisão periódica (oficina, por km/tempo)
  ('oleo_motor_troca',      'Óleo do motor + filtro de óleo',   'REVISAO_PERIODICA', 'MANUTENCAO', 'AMBOS', 15000, 12),
  ('filtro_ar',             'Filtro de ar',                     'REVISAO_PERIODICA', 'MANUTENCAO', 'AMBOS', 15000, 12),
  ('filtro_combustivel',    'Filtro de combustível',            'REVISAO_PERIODICA', 'MANUTENCAO', 'AMBOS', 30000, 24),
  ('filtro_habitaculo',     'Filtro de habitáculo',             'REVISAO_PERIODICA', 'MANUTENCAO', 'AMBOS', 15000, 12),
  ('travoes_pastilhas',     'Travões: pastilhas e discos (medir desgaste)', 'REVISAO_PERIODICA', 'MANUTENCAO', 'AMBOS', 15000, 12),
  ('travoes_tambores',      'Travões: tambores/sapatas traseiras', 'REVISAO_PERIODICA', 'MANUTENCAO', 'AMBOS', 15000, 12),
  ('liquido_travoes_troca', 'Líquido de travões (substituir)',  'REVISAO_PERIODICA', 'MANUTENCAO', 'MESES', NULL, 24),
  ('pneus_manutencao',      'Pneus: desgaste, alinhamento, rotação', 'REVISAO_PERIODICA', 'MANUTENCAO', 'AMBOS', 15000, 12),
  ('amortecedores',         'Amortecedores e suspensão',        'REVISAO_PERIODICA', 'MANUTENCAO', 'AMBOS', 15000, 12),
  ('direcao',                'Direção: rótulas, terminais, caixa', 'REVISAO_PERIODICA', 'MANUTENCAO', 'AMBOS', 15000, 12),
  ('bateria',                'Bateria: carga e terminais',       'REVISAO_PERIODICA', 'MANUTENCAO', 'AMBOS', 15000, 12),
  ('correias_acessorios',    'Correias de acessórios',           'REVISAO_PERIODICA', 'MANUTENCAO', 'AMBOS', 15000, 12),
  ('escape',                 'Escape: fugas e fixações',         'REVISAO_PERIODICA', 'MANUTENCAO', 'AMBOS', 15000, 12),
  ('caixa_velocidades_oleo', 'Óleo da caixa de velocidades/diferencial', 'REVISAO_PERIODICA', 'MANUTENCAO', 'AMBOS', 15000, 12),
  ('chassis_ferrugem',       'Cintas/pára-choques/chassis: ferrugem e danos', 'REVISAO_PERIODICA', 'MANUTENCAO', 'AMBOS', 15000, 12),

  -- Nível 3 — Longo prazo
  ('correia_distribuicao', 'Correia de distribuição (ou corrente)', 'LONGO_PRAZO', 'MANUTENCAO', 'AMBOS', 180000, 84),
  ('oleo_caixa_velocidades', 'Óleo da caixa de velocidades (longo prazo)', 'LONGO_PRAZO', 'MANUTENCAO', 'AMBOS', 60000, 48),
  ('velas',                 'Velas / pré-aquecimento',           'LONGO_PRAZO', 'MANUTENCAO', 'AMBOS', 60000, 48),
  ('fap_egr',                'Filtro de partículas (FAP/DPF) e válvula EGR', 'LONGO_PRAZO', 'MANUTENCAO', 'AMBOS', 120000, NULL),
  ('adblue',                 'AdBlue (nível e qualidade)',        'LONGO_PRAZO', 'CHECKLIST', NULL, NULL, NULL),
  ('ar_condicionado',        'Ar condicionado (recarga/desinfeção)', 'LONGO_PRAZO', 'MANUTENCAO', 'MESES', NULL, 24),

  -- Obrigações legais
  ('ipo',                    'Inspeção Periódica Obrigatória (IPO)', 'OBRIGACAO_LEGAL', 'MANUTENCAO', 'MESES', NULL, 12),
  ('seguro',                 'Seguro (validade)',                 'OBRIGACAO_LEGAL', 'MANUTENCAO', 'MESES', NULL, 12),
  ('iuc_selo',                'Selo/IUC (pago anualmente)',        'OBRIGACAO_LEGAL', 'MANUTENCAO', 'MESES', NULL, 12),
  ('cartao_transportador',    'Cartão de transportador / licença',  'OBRIGACAO_LEGAL', 'MANUTENCAO', 'MESES', NULL, 12),
  ('tacografo',               'Tacógrafo: calibração/inspeção',    'OBRIGACAO_LEGAL', 'MANUTENCAO', 'MESES', NULL, 24),
  ('extintor_validade',       'Extintor (validade)',               'OBRIGACAO_LEGAL', 'MANUTENCAO', 'MESES', NULL, 12),
  ('triangulo_colete',        'Triângulo de sinalização e colete refletor a bordo', 'OBRIGACAO_LEGAL', 'CHECKLIST', NULL, NULL, NULL)
ON CONFLICT (chave) DO NOTHING;
```

Todos os itens entram **desativados por viatura por omissão** (não há linha
em `frota_veiculo_itens` até o Carlos os ligar a uma viatura concreta) — o
catálogo é só o menu de opções; nada gera alerta até ser aplicado a uma
viatura com um prazo. `tacografo`/`cartao_transportador` só fazem sentido em
carrinhas de mercadorias — o Carlos ativa-os só nessas.

### Migração dos dados existentes

Os 4 campos de `comb_veiculos` (`proxima_revisao_km`, `proxima_revisao_data`,
`data_fim_seguro`, `data_proxima_ipo`) preenchidos hoje passam para
`frota_veiculo_itens`, ligados aos itens `oleo_motor_troca`/`ipo`/`seguro` do
catálogo, numa `INSERT ... SELECT` a fazer na mesma migration — nenhum dado
se perde, nenhuma viatura fica sem os alertas que já tinha. As colunas
antigas **não são apagadas** nesta fase (alteração estrutural sem necessidade
imediata); ficam paradas, com uma nota a documentar que o valor vivo passou a
estar em `frota_veiculo_itens`.

### Alertas só por push — sem e-mail, dirigido às pessoas certas

O `send-push` do combustível manda notificação **sem corpo** (texto fixo,
"toca para abrir a app") propositadamente, para não ter de lidar com a
cifragem RFC 8291 do payload — e manda para **todos** os subscritos.

Para a frota preciso de duas coisas diferentes: (1) só a quem está em
`frota_alerta_destinatarios`, não a todos; (2) não preciso do texto detalhado
dentro da notificação — o toque abre a app, que já mostra os alertas reais
(`AlertasPage`, a estender com os alertas de frota). Por isso a proposta é
**reaproveitar o mesmo padrão sem cifragem** (mais simples, menos risco),
numa função nova e isolada:

- Nova Edge Function `send-push-frota` (cópia adaptada de `send-push` — este
  projeto não partilha código entre Edge Functions, cada uma é
  autossuficiente) que só lê `push_subscriptions` cujo `user_id` esteja em
  `frota_alerta_destinatarios`.
- Chamada por `avaliar_regras_alerta()` via `net.http_post()` sempre que um
  alerta `FROTA_ITEM` passar a ATIVO/URGENTE pela primeira vez — mesmo
  mecanismo que já dispara `enviar-resumo-alertas` às 07:00 (`net.http_post`
  agendado por pg_cron), só que despoletado pelo próprio motor de alertas em
  vez de um horário fixo.

Se mais tarde quiserem o texto do alerta dentro da notificação (sem abrir a
app), fica documentado como melhoria futura — implica cifrar o payload
(AES-128-GCM/ECDH por subscrição), trabalho a mais que não é preciso agora.

### Ficheiros a criar

```
src/features/frota/
  services/catalogoService.ts        ← CRUD do catálogo (Carlos gere sozinho)
  services/veiculoItensService.ts    ← aplicar/configurar itens por viatura
  services/manutencoesService.ts
  services/checklistsService.ts
  services/atribuicoesService.ts
  services/frotaDestinatariosService.ts
  hooks/useCatalogo.ts
  hooks/useGuardarItemCatalogo.ts
  hooks/useVeiculoItens.ts           ← itens aplicados a uma viatura + configuração
  hooks/useAtivarItemNaViatura.ts
  hooks/useManutencoes.ts
  hooks/useRegistarManutencao.ts     ← useMutation com retorno (chama a RPC)
  hooks/useChecklists.ts
  hooks/useRegistarChecklist.ts
  hooks/useAtribuicaoAtual.ts
  hooks/useGuardarAtribuicao.ts
  components/CatalogoFrotaPage.tsx   ← admin/gestor/mecânico: gerir o catálogo
  components/ConfigurarVeiculoFrotaPage.tsx ← ligar itens do catálogo a esta viatura + prazos
  components/FichaVeiculoPage.tsx    ← leitura: dados + próximas datas + histórico + imprimir
  components/FichaVeiculoPrintView.tsx ← mesmo padrão de GuiaPrintView (@media print)
  components/RegistarManutencaoPage.tsx
  components/ChecklistFormPage.tsx   ← itens agrupados por categoria (os 4 níveis)
  components/FrotaDestinatariosPage.tsx ← admin/gestor: escolher quem recebe alertas
  index.ts
```

`VeiculoFormPage.tsx` ganha um link "Ver ficha" para `FichaVeiculoPage` — a
única linha tocada fora do módulo novo. Rotas novas, sem `RoleGuard` (segue o
padrão de armazém/ferramentas: `useRole().podeEscrever('frota')` controla os
botões, a RLS é a segurança real):

```
frota/veiculo/:id            → FichaVeiculoPage
frota/veiculo/:id/configurar → ConfigurarVeiculoFrotaPage
frota/catalogo                → CatalogoFrotaPage
frota/destinatarios           → FrotaDestinatariosPage
```

### Regras de negócio críticas

- Um item do catálogo só gera alerta/aparece numa viatura depois de estar em
  `frota_veiculo_itens` para essa viatura — o catálogo por si só não afeta nada
- `atualiza_proxima` é opcional por registo de manutenção — nem toda
  manutenção reinicia o intervalo (ex.: reparação pontual vs. revisão completa)
- Intervalo por viatura tem prioridade sobre o intervalo por omissão do
  catálogo — permite duas carrinhas com o mesmo item mas prazos diferentes
- Só uma atribuição em aberto por viatura (`ux_veiculo_atribuicao_aberta`) —
  atribuir a outra pessoa fecha a anterior na mesma transação
- `estado_geral` do checklist é sempre o pior item, calculado no frontend
  antes de gravar (considerar mover para uma função SQL se for preciso
  confiar nisso sem depender do frontend)
- Fotos do checklist seguem o mesmo padrão de validação de nome de ficheiro
  das fotos de combustível (função SQL que valida o caminho antes do upload)
- Desativar um item no catálogo (`ativo = false`) não apaga o histórico nem
  as configurações por viatura — só deixa de aparecer para escolher em novas
  configurações e para de gerar alertas novos

### Critérios de conclusão

- [ ] Migration + GRANTs + types regenerados
- [ ] Teste (Postgres real, `supabase/tests/`): `mecanico` só escreve em
      `frota`, nada mais; `armazem` não escreve em `frota`
- [ ] Teste: `registar_manutencao` com `atualiza=true` avança corretamente km
      e data (usando o intervalo da viatura se existir, senão o do catálogo);
      com `false` não mexe em `frota_veiculo_itens`
- [ ] Teste: duas atribuições em aberto na mesma viatura é rejeitado (índice único)
- [ ] Teste: motor de alertas gera `FROTA_ITEM` a partir de
      `frota_veiculo_itens`, idempotente (correr 2× não duplica)
- [ ] Teste: item desativado no catálogo não aparece nas opções novas mas o
      histórico e alertas já criados continuam intactos
- [ ] `send-push-frota` só envia a quem está em `frota_alerta_destinatarios`
      (teste: subscrito fora da lista não recebe)
- [ ] Ficha da viatura imprime corretamente (CSS `@media print`, mesmo padrão já testado)
- [ ] Carlos consegue entrar, configurar itens numa viatura, registar
      manutenção e checklist — e **não** consegue ver/mexer em armazém,
      ferramentas ou obras
- [ ] Seed do catálogo aplicado e revisto com o Carlos depois de estar no ar
      (a lista inicial é um ponto de partida, não a palavra final)

---

## Regras transversais (aplicar em todas as fases)

### Padrões de código obrigatórios (ver CLAUDE.md)

- Sem `as any` — usar tipos gerados pelo Supabase
- Hooks de dados: sempre `useAsync` — nunca `useEffect + useState` manual
- Mutations: sempre `useMutation` — nunca try/catch manual em componentes
- Constante `SELECT` no topo de cada service file
- INSERT/UPDATE com `.select(SELECT).single()` encadeado — sem N+1
- Filtros Supabase inlined — nunca helpers genéricos com `as any`

### Migrações

- Nomenclatura: `YYYYMMDDHHMMSS_faseN_nome.sql`
- **Sempre** incluir RLS + GRANTs explícitos (Automatically expose new tables está OFF)
- Colunas NOT NULL em tabelas existentes: SEMPRE com DEFAULT (nunca bloqueia dados existentes)
- Índices na mesma migration (não diferir)
- Regenerar tipos após cada push: `npx supabase gen types typescript --local > src/integrations/supabase/types.ts`

### Segurança

- Secrets (API keys) apenas via `supabase secrets set` para Edge Functions — NUNCA em VITE_
- Dados de saúde (RGPD art. 9.º): bucket `comprovativos-medicos` com RLS `role = 'admin'`
- Input do utilizador: validar via CHECK constraints no schema (não só no cliente)
- Validação de acesso real é RLS + GRANT — RoleGuard no React é UX, não segurança

### Quality gate de cada fase

Antes de marcar `[CONCLUÍDA]`:

1. `npm run typecheck` — 0 erros TypeScript
2. `npm test` — todos os testes passam (incluindo novos desta fase)
3. `npm run build` — bundle sem warnings
4. RLS activado e testado na(s) tabela(s) nova(s)
5. Migration aplicada em Supabase local com `supabase db push`
6. Tipos regenerados e commitados
7. CI/CD GitHub Actions passa (typecheck + build + test)
8. PR criada e aprovada antes de merge para `main`
