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

## Fase 2 — Horário de Trabalho, Faltas e Conformidade Laboral `[ ]`

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
