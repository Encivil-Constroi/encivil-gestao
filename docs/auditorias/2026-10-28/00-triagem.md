# Triagem dos achados — checkup 2026-10-28

Entrada: `A1-bd-seguranca.md`, `A2-edge-infra.md`, `A3-stock-dinheiro.md`, `A4-operacao-pessoas.md`,
`A5-frontend-transversal.md` (68 achados). Cada Crítica/Alta/Média foi reverificada no código e/ou na BD local
`supabase_db_encivil-checkup` (só leitura; simulação de papel com `SET LOCAL ROLE authenticated` + `request.jwt.claims`
em transação com `ROLLBACK`). Regras aplicadas: as da spec `docs/superpowers/specs/2026-10-28-checkup-geral-carga-design.md`
(acesso legítimo, `npm audit` sem major, site novo funciona com a BD antiga).

**Resumo:** 1 Crítica, 12 Altas, 19 Médias e 30 Baixas confirmadas. 0 falsos positivos. 6 duplicados.
Corrigem-se todas as Críticas/Altas/Médias. Das Baixas, corrigem-se só as que caem num lote que já mexe no mesmo
ficheiro/função (11); as outras 19 ficam registadas para o relatório final.

Provas feitas por mim (BD local, como `motorista` aal1):
- `SELECT nome, telemovel, email, notas FROM colaboradores` → devolve as linhas (A1-02).
- `INSERT INTO picagens(... resultado='AUTORIZADA', hora_final_validada, validada_em)` → aceite, `AUTORIZADA` (A1-04).
- `DELETE FROM spatial_ref_sys WHERE srid=4326` como `authenticated` → `DELETE 1` (A1-05); `has_table_privilege('anon',…,'DELETE')=t`.
- `faltas_sel`/`resumo_sel`/`assiduidade_sel` = `USING (true)`; pares duplicados em `resumo_assiduidade_dia`, `horario_colaborador`, `tipos_falta` (A1-01, A1-12).
- `pode_aprovar_combustivel()` não passa por `mfa_em_falta()` e é a guarda de 10 RPCs + policy `pump_sessoes_select_combustivel` (A1-03).
- `_lancar_fatura_impl` sem `FOR UPDATE`; `_classificar_e_aprender_impl` sem estado nem `fatura_id`; `_custos_consolidados_por_obra_impl` só `tipo='saida'` e `created_at::date` (A3-01/02/05/09).
- `calcular_resumo_dia` grava `COALESCE(0,0)` em `horas_efetivas`, sem `obra_id`; `horario_colaborador` só tem PK `(colaborador_id, valido_de)` (A4-04/05).
- `INSERT` de coluna `stock_atual` concedido a `authenticated` em `produtos`; sem trigger de unidade (A1-06/A3-06).
- `alertas_detalhados` junta `colaboradores` por `a.entidade_id` = id da atribuição (A4-08); bucket `certificados` inexistente (A4-13).
- `npm audit --omit=dev` → 1 crítica `dompurify<=3.4.16` via `jspdf@4.2.1`, `fix available via npm audit fix` (A2-02).

---

## 1. Tabela dos 68 achados

| ID | Título curto | Sev. final | Estado | Lote |
|---|---|---|---|---|
| A1-01 | Faltas (incl. saúde) e resumo diário legíveis por todos | Crítica | corrigir | BD-1 |
| A1-02 | Contactos e notas de colaboradores legíveis por todos | Alta | corrigir | BD-1 + FE-1 |
| A1-03 | Aprovador de combustível contorna MFA; `_autor_designado` idem | Alta | corrigir | BD-3 |
| A1-04 | Colaborador insere picagem já AUTORIZADA | Alta | corrigir | BD-2 |
| A1-05 | `spatial_ref_sys` gravável por anon/authenticated | Alta | corrigir | BD-6 (+manual) |
| A1-06 | `armazem` cria artigo com stock sem movimento | Média | duplicado de A3-06 | BD-5 |
| A1-07 | `promover_role`/`contabilidade_mapa_assiduidade` com EXECUTE p/ anon | Baixa | corrigir (REVOKE); simulação no harness: registar | BD-6 |
| A1-08 | Upload ilimitado em `combustivel-taloes` | Baixa | registar | — |
| A1-09 | `handle_new_user` cria conta como `gestor` | Baixa | registar (+manual: confirmar signup off) | — |
| A1-10 | `movimentos_stock` com UPDATE/DELETE/TRUNCATE concedidos | Baixa | corrigir | BD-5 |
| A1-11 | Segredo das Edge Functions em GUC | Baixa | registar (+manual) | — |
| A1-12 | Policies duplicadas em tabelas de RH | Baixa | corrigir | BD-1 |
| A2-01 | `send-push-frota`/`enviar-resumo-alertas` sem `verify_jwt=false` | Alta | corrigir | FE-4 (+manual) |
| A2-02 | `npm audit` CI vermelho (dompurify via jspdf) | Média | corrigir | FE-5 |
| A2-03 | Endpoint de push livre → SSRF cego | Média | corrigir | BD-7 + FE-4 |
| A2-04 | `extrair-fatura` apaga linhas antes da Gemini | Média | corrigir | FE-4 |
| A2-05 | Vulnerabilidades só de dev | Baixa | corrigir (só sem major) | FE-5 |
| A2-06 | pre-commit com cobertura estreita | Baixa | registar | — |
| A2-07 | Email de alertas sem escape HTML | Baixa | corrigir | FE-4 |
| A2-08 | Bucket `faturas-fornecedor` legível por todos | Baixa | registar (dados da empresa, não pessoais) | — |
| A2-09 | Buckets públicos com fotos | Baixa | registar (decisão já assumida) | — |
| A2-10 | Desativar não corta sessão; eventos não auditados | Baixa | registar | — |
| A2-11 | Detalhe interno em erros; push sem idempotência forte | Baixa | registar | — |
| A3-01 | Lançar fatura 2× em paralelo duplica stock | Alta | corrigir | BD-4 + FE-3 |
| A3-02 | Custo de materiais ignora devoluções (2 números) | Alta | corrigir | BD-5 + FE-6 |
| A3-03 | Totais truncados a 1000 linhas (PostgREST) | Média | corrigir | FE-6 (+ORDER BY em BD-5) |
| A3-04 | Lançamento salta linhas ARMAZEM sem artigo; erro invisível | Média | corrigir | BD-4 + FE-3 |
| A3-05 | Fatura LANCADA editável e relançável | Média | corrigir | BD-4 |
| A3-06 | Stock por INSERT direto; unidade mutável após movimentos | Média | corrigir (absorve A1-06) | BD-5 |
| A3-07 | `lancar_fatura` não liga `movimento_id`; qtd NULL vira 1 | Baixa | corrigir parcial (ligação + qtd); subtipo/fornecedor: registar | BD-4 |
| A3-08 | Retenção JS vs SQL difere 1 cêntimo | Baixa | registar | — |
| A3-09 | Custos consolidados cortam dias em UTC | Baixa | corrigir (mesma função de A3-02) | BD-5 |
| A3-10 | INVENTARIO: regra do doc não imposta | Baixa | registar (+decisão do utilizador) | — |
| A3-11 | Libertação de retenção apagável sem rasto | Baixa | registar | — |
| A3-12 | Custo histórico recalculado com custo atual | Baixa | registar | — |
| A3-13 | `custos_materiais_por_obra` executável por anon | Baixa | corrigir | BD-6 |
| A4-01 | Picagem própria já AUTORIZADA | Alta | duplicado de A1-04 | BD-2 |
| A4-02 | Faltas com saúde legíveis por todos | Alta | duplicado de A1-01 | BD-1 |
| A4-03 | Contactos/notas legíveis por todos | Alta | duplicado de A1-02 | BD-1 + FE-1 |
| A4-04 | `horas_efetivas` sempre 0 (mapa contabilidade, custo MO) | Alta | corrigir | BD-2 |
| A4-05 | Horário sobreposto parte o resumo diário de todos | Alta | corrigir | BD-2 |
| A4-06 | Geofence aceita hora retroativa e autoriza | Média | corrigir | BD-2 |
| A4-07 | `armazem`/`gestor` apaga pedidos de abastecimento em qualquer estado | Média | corrigir | BD-3 |
| A4-08 | Alertas EPI/formação sem nome do colaborador | Média | corrigir | BD-7 |
| A4-09 | Listas/relatórios cortados a 1000 linhas | Média | duplicado de A3-03 (ficheiros juntos em FE-6) | FE-6 |
| A4-10 | Push vai para o utilizador anterior no telemóvel partilhado | Média | corrigir | BD-7 + FE-7 |
| A4-11 | Fila de picagens deita fora em erro transitório | Média | corrigir | FE-2 |
| A4-12 | Abastecimentos alteráveis sem rasto | Média | corrigir | BD-3 |
| A4-13 | Bucket `certificados` sem migration; formação grava sem certificado | Média | corrigir | BD-7 + FE-10 (+manual) |
| A4-14 | Frota usa `CURRENT_DATE` UTC | Baixa | registar | — |
| A4-15 | Utilizador muda o nome da sua ficha RH | Baixa | registar | — |
| A4-16 | Guias de transporte sem máquina de estados | Baixa | registar | — |
| A4-17 | Picagem: "hoje" em UTC; turnos noturnos | Baixa | corrigir parcial (dia de Lisboa); turno noturno: registar | FE-2 |
| A4-18 | `contabilidade_mapa_assiduidade` executável por anon | Baixa | duplicado de A1-07 | BD-6 |
| A4-19 | Livro de obra legível por todos | Baixa | registar (dado operacional) | — |
| A5-01 | Picagem de outro colaborador após troca de utilizador | Alta | corrigir | FE-2 |
| A5-02 | Fila de picagens não reconhece falha de rede (objeto) | Alta | corrigir | FE-2 |
| A5-03 | Fila de movimentos apaga em 5xx/429 | Alta | corrigir | FE-2 |
| A5-04 | Mês do histórico de abastecimentos desfasado (UTC) | Média | corrigir | FE-9 |
| A5-05 | Atividade após o prazo renova a sessão | Média | corrigir | FE-7 |
| A5-06 | Deploy recarrega à força e perde formulários | Média | corrigir | FE-8 |
| A5-07 | Fila de picagens: dois separadores duplicam; guarda presa | Média | corrigir | FE-2 |
| A5-08 | `RouteErrorPage` não envia ao Sentry | Média | corrigir | FE-8 |
| A5-09 | `parseSupabaseError` deixa passar técnico/HTML | Baixa | registar | — |
| A5-10 | WhatsApp recentes ficam após logout | Baixa | corrigir (mesmo ficheiro de A5-01) | FE-2 |
| A5-11 | Pesquisa global parte com vírgula/parênteses | Baixa | registar | — |
| A5-12 | MFA voluntário só no cliente; fila legada sem userId | Baixa | registar | — |
| A5-13 | `href` de fotos de abastecimento sem validar esquema | Baixa | corrigir (mesmo ficheiro de A5-04) | FE-9 |

Notas de severidade: nenhuma alteração face aos auditores. A2-01 fica Alta porque, se a produção tiver sido publicada pelo
CLI, o push diário e o email de alertas já falham hoje em silêncio (confirmar — Passos manuais). A4-04 fica Alta: é dinheiro
(subsídio de alimentação, custo de mão de obra) errado sem aviso.

---

## 2. Restrições de dados pessoais — quem mantém acesso e que ecrãs têm de continuar a funcionar

### `faltas` (todas as colunas) e `resumo_assiduidade_dia` — BD-1
- Mantêm leitura: `admin`, `gestor` (todas as linhas) e o próprio colaborador (`colaborador_id IN (SELECT id FROM colaboradores WHERE user_id = auth.uid())`).
- Escrita: inalterada (`*_write` admin/gestor).
- Ecrãs que leem (todos de admin/gestor, continuam iguais): `FaltasPage` e `AssiduidadePage` (rota `/rh`, `RoleGuard gestor`;
  `faltasService.ts`, `assiduidadeService.ts`); `relatorios/PessoasSection` via `src/app/pages/relatorios/dados.ts` (só com
  `podeFinanceiro` = admin/gestor); `src/app/pages/dashboard/dados.ts` `contarFaltasPorDecidir` (só o painel executivo, `admin`).
- Funções `SECURITY DEFINER` que leem e não são afetadas: `calcular_resumo_dia`, `contabilidade_mapa_assiduidade`, `_custos_consolidados_por_obra_impl`.
- Nenhum ecrã de outro papel lê estas tabelas (procurado `from('faltas')` e `from('resumo_assiduidade_dia')` em `src/`).

### `colaboradores.telemovel`, `.email`, `.notas` — BD-1 + FE-1
- Mantêm leitura: `admin`, `gestor` (todas as linhas) e o próprio (linha com `user_id = auth.uid()`), via RPC nova
  `colaboradores_contactos()`. O resto da linha (`id, nome, numero_mecan, cargo, obra_id, user_id, ativo, foto_path, setor, created_at`) continua com SELECT para `authenticated` (listas de escolha, avatares, picagens).
- Ecrãs/código que hoje leem estas colunas e têm de continuar a funcionar:
  - `src/features/colaboradores/services/colaboradoresService.ts` (`SELECT_COLABORADOR` em `listarColaboradores`, `buscarColaborador`,
    `buscarMeuColaborador`, `criarColaborador`, `atualizarColaborador`) → usado por `ColaboradoresPage` (mostra `telemovel`, link tel:),
    `ColaboradorForm` (edita os 3 campos), `EpisPage`, `FormacoesPage`, `FichaSegurancaPage`, `AssiduidadePage`, `AtribuicaoHorarioPage`,
    `FaltasPage` (todas `RoleGuard gestor`), `PicagemPage` (todos os papéis — só usa `id/nome`), `PainelPessoalPage` (`useMeuColaborador`, a própria linha),
    `relatorios/dados.ts` (`listarColaboradores`, conta/nome).
  - `src/features/backup/backupService.ts` (`COLUNAS_COLABORADORES`, backup de admin).
- Não afetados: `frotaService.ts:139,231`, `obrasService.ts:197`, `picagensService.ts:201` (só `id, nome`); `atualizar_meu_perfil` (DEFINER);
  Edge `admin-utilizadores` (cliente com papel de serviço); view `alertas_detalhados` (só `c.nome`).
- **Ordem obrigatória:** publicar o site (FE-1) **antes** da migration BD-1 — o site atual pede `telemovel,email,notas` em todos os
  ecrãs acima e, depois do REVOKE, receberia `42501` em todos (incluindo RH e picagens).

### `picagens` (BD-2) — não é restrição de leitura
- `picagens_sel` mantém-se (próprio + admin/gestor). O INSERT direto continua aberto ao próprio, mas o trigger força os campos de validação.
  `ValidacaoPicagensPage` (gestor) e `registar_picagem_geofence` continuam iguais.

---

## 3. Lotes de correção

### Task 3 — Base de dados (sequenciais; uma migration e um teste PGlite por lote)
Regras comuns: idempotentes (`CREATE OR REPLACE`, `DROP … IF EXISTS`), `GRANT`/`REVOKE` explícitos, `SET search_path = public` em
DEFINER, funções só de leitura `STABLE`, bloco final `-- ROLLBACK`. Cada teste novo tem de falhar com as migrations até à anterior
e passar com a nova. Depois de cada lote: `npx vitest run supabase/tests` completo (um erro SQL parte a suite).

#### BD-1 · RH: privacidade de faltas, assiduidade e contactos — A1-01 (+A4-02), A1-12, A1-02 (+A4-03)
- Ficheiros: `supabase/migrations/20261028120100_checkup_rh_privacidade.sql`, `supabase/tests/checkup-rh-privacidade.test.mjs`.
- Correção:
  1. `faltas_sel` e `resumo_sel` → `USING (public.auth_role() IN ('admin','gestor') OR colaborador_id IN (SELECT id FROM public.colaboradores WHERE user_id = auth.uid()))`.
  2. `DROP POLICY IF EXISTS` dos pares antigos: `assiduidade_sel`, `assiduidade_write` (resumo_assiduidade_dia), `hcolab_sel`, `hcolab_write` (horario_colaborador), `tfalta_sel`, `tfalta_write` (tipos_falta). `horario_colaborador`/`tipos_falta` ficam com `USING (true)` na leitura (não são dados sensíveis).
  3. `REVOKE SELECT (telemovel, email, notas) ON public.colaboradores FROM authenticated` (INSERT/UPDATE dessas colunas mantêm-se — escrita já é só admin/gestor por `colab_write`).
  4. RPC `public.colaboradores_contactos() RETURNS TABLE(id uuid, telemovel text, email text, notas text)`, `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public`: todas as linhas se `auth_role() IN ('admin','gestor')`, senão só `WHERE user_id = auth.uid()`. `REVOKE ALL … FROM PUBLIC, anon; GRANT EXECUTE … TO authenticated`.
- Teste (falha antes): como `motorista` com ficha, `SELECT count(*) FROM faltas WHERE colaborador_id = <outro>` = 0 e da sua = 1; gestor vê ambas;
  `SELECT telemovel FROM colaboradores` como motorista → `42501`; `SELECT id, nome` continua; `colaboradores_contactos()` devolve 1 linha (a própria) ao motorista e todas ao gestor;
  `pg_policies` tem exatamente 1 policy SELECT em `resumo_assiduidade_dia`, `horario_colaborador`, `tipos_falta`.

#### BD-2 · Picagens e assiduidade — A1-04 (+A4-01), A4-06, A4-04, A4-05
- Ficheiros: `supabase/migrations/20261028120200_checkup_picagens_assiduidade.sql`, `supabase/tests/checkup-picagens-assiduidade.test.mjs`.
  Atenção: `supabase/tests/picagens-insert-rls.test.mjs` tem de continuar verde.
- Correção:
  1. Trigger `BEFORE INSERT ON picagens` (`_picagem_normalizar_insert`): se `current_user = 'authenticated' AND public.auth_role() NOT IN ('admin','gestor')`
     → `resultado='PENDENTE_VALIDACAO'`, `timestamp_servidor=now()`, `desvio_relogio_s = round(extract(epoch FROM now() - NEW.timestamp_dispositivo))`,
     e `NULL` em `hora_original_proposta, hora_final_validada, validada_por, validada_em, justificacao, posicao, distancia_geofence_m`.
     O teste por `current_user` deixa passar a RPC `registar_picagem_geofence` (DEFINER, corre como dono) e o gestor.
  2. A4-06: função `public._picagem_dentro_do_desvio(p_ts timestamptz) RETURNS boolean` (`abs(extract(epoch FROM now() - p_ts)) <= 300`, STABLE);
     `_registar_picagem_geofence_impl` passa a gravar `desvio_relogio_s` e só deixa `AUTORIZADA` se `_picagem_dentro_do_desvio(p_timestamp_disp)`; senão `PENDENTE_VALIDACAO`.
     (Copiar o corpo vigente de `20260929000000_seguranca_rpcs_storage.sql` e mudar só isto.)
  3. A4-05: trigger `BEFORE INSERT ON horario_colaborador`: fecha a atribuição aberta/sobreposta anterior (`UPDATE … SET valido_ate = NEW.valido_de - 1 WHERE colaborador_id = NEW.colaborador_id AND valido_de < NEW.valido_de AND (valido_ate IS NULL OR valido_ate >= NEW.valido_de)`);
     se existir atribuição com `valido_de > NEW.valido_de` que sobreponha `[NEW.valido_de, NEW.valido_ate]`, `RAISE EXCEPTION 'Já existe um horário atribuído a partir de %'`.
     `calcular_resumo_dia` escolhe uma atribuição por colaborador (`DISTINCT ON (hc.colaborador_id) … ORDER BY hc.colaborador_id, hc.valido_de DESC`), para não abortar com sobreposições já existentes.
  4. A4-04: `calcular_resumo_dia` calcula `horas_efetivas` das picagens `AUTORIZADA` do dia de Lisboa
     (`(COALESCE(hora_final_validada, timestamp_dispositivo) AT TIME ZONE 'Europe/Lisbon')::date = p_data`), ordenadas pela mesma hora:
     soma de pares ENTRADA→SAIDA seguinte (`LEAD`) menos pares PAUSA_INI→PAUSA_FIM; se não houver picagens de pausa e o horário tiver `intervalo_min`
     e um par ENTRADA/SAIDA cobrir `intervalo_inicio..intervalo_fim` (hora local), desconta `intervalo_min/60`. `GREATEST(0, round(…, 2))`.
     `obra_id` = obra da primeira ENTRADA autorizada do dia. `desvio = efetivas − previstas`; `horas_supl_propostas = GREATEST(desvio, 0)`.
     O `ON CONFLICT` passa a atualizar também `obra_id`; `horas_supl_validadas`/`validado_*` nunca são tocados.
- Teste (falha antes): como `motorista` com ficha, INSERT com `resultado='AUTORIZADA', validada_em=now()` → linha gravada `PENDENTE_VALIDACAO`, `validada_em IS NULL`; gestor grava `AUTORIZADA`;
  `_picagem_dentro_do_desvio(now() - interval '2 hours')` = false e `(now())` = true (a RPC de geofence usa PostGIS, ausente no PGlite);
  horário 08:00–17:00 com intervalo 12:00–13:00 (60 min) + picagens AUTORIZADA 08:00/17:00 de Lisboa → `calcular_resumo_dia(d)` grava `horas_efetivas = 8`, `obra_id` preenchido, e `contabilidade_mapa_assiduidade` (como gestor) dá `dias_trabalhados = 1`;
  duas atribuições: a 2.ª (`valido_de` posterior) fecha a 1.ª (`valido_ate = valido_de − 1`); com sobreposição forçada à mão (como postgres, trigger desativado) `calcular_resumo_dia` não falha e grava 1 linha por colaborador.

#### BD-3 · MFA dos aprovadores e escrita de combustível — A1-03, A4-07, A4-12
- Ficheiros: `supabase/migrations/20261028120300_checkup_mfa_combustivel.sql`, `supabase/tests/checkup-mfa-combustivel.test.mjs`.
- Correção:
  1. `pode_aprovar_combustivel()` → acrescentar `AND NOT public.mfa_em_falta()` à condição (corrige de uma vez as 10 RPCs e a policy de `pump_sessoes` que a usam).
  2. `_autor_designado(p_obra_id)` → acrescentar `AND NOT public.mfa_em_falta()`.
  3. A4-07: `DROP POLICY IF EXISTS pend_auth_delete ON comb_abastecimentos_pendentes`; `REVOKE EXECUTE ON FUNCTION public.rejeitar_abastecimento_pendente(uuid) FROM PUBLIC, anon, authenticated` (nenhum ecrã usa; a função fica para não partir `types.ts`).
  4. A4-12: `CREATE TRIGGER auditar_alteracao AFTER UPDATE ON comb_abastecimentos FOR EACH ROW EXECUTE FUNCTION public.auditar_alteracao()` (o DELETE já tem `trg_audit_del_abastecimentos`). A policy UPDATE mantém-se (`pode_escrever('combustivel')` é o papel documentado).
- Teste (falha antes): `mfa_obrigatorio=true`, gestor em `comb_aprovadores` com `aal1` → `pode_aprovar_combustivel()` = false e `definir_aprovador_combustivel(<x>, true)` lança; com `aal2` = true;
  `armazem` faz `DELETE FROM comb_abastecimentos_pendentes` → 0 linhas e a RPC dá `42501`; `UPDATE comb_abastecimentos SET litros = …` como armazem → 1 linha em `audit_log` com antes/depois.

#### BD-4 · Faturas: lançamento atómico e imutável — A3-01, A3-04, A3-05, A3-07 (parcial)
- Ficheiros: `supabase/migrations/20261028120400_checkup_faturas.sql`, `supabase/tests/checkup-faturas.test.mjs`.
- Correção:
  1. `_lancar_fatura_impl`: `SELECT … FROM faturas_fornecedor WHERE id = p_fatura_id FOR UPDATE` e só depois validar `estado = 'CLASSIFICADA'` (a 2.ª transação concorrente espera e falha com "não está no estado CLASSIFICADA").
  2. Antes do ciclo, `RAISE` (pt-PT) se houver linhas `destino='ARMAZEM' AND (artigo_id IS NULL OR quantidade IS NULL OR quantidade <= 0)`; tirar o `COALESCE(quantidade,1)`.
  3. A3-07: `v_mov := public.registar_movimento(...)` (devolve `movimentos_stock`) e `UPDATE linhas_fatura SET lancado = true, movimento_id = v_mov.id`; remover o `SELECT … created_at >= v_inicio`.
  4. A3-05: `_classificar_e_aprender_impl` exige `estado IN ('EXTRAIDA','CLASSIFICADA')` (com `FOR UPDATE`) e faz o `UPDATE linhas_fatura … WHERE id = … AND fatura_id = p_fatura_id`.
     Trigger `BEFORE INSERT OR UPDATE OR DELETE ON linhas_fatura`: `RAISE` se a fatura-mãe está `LANCADA`. Trigger `BEFORE UPDATE ON faturas_fornecedor`: se `OLD.estado = 'LANCADA'`,
     só deixa mudar `nif_fornecedor, base_tributavel, valor_iva, observacoes, updated_at` (é o que `atualizarDadosFiscaisFatura` usa depois do lançamento); qualquer outra coluna → `RAISE`.
     O lançamento continua a funcionar porque atualiza as linhas enquanto a fatura ainda está `CLASSIFICADA` e só no fim passa a `LANCADA`.
- Teste (falha antes): `pg_get_functiondef('_lancar_fatura_impl')` contém `FOR UPDATE` (o PGlite só tem uma ligação; a corrida real prova-se no cenário de concorrência da carga contra o Docker);
  `lancar_fatura` com linha ARMAZEM sem artigo → erro e fatura continua `CLASSIFICADA`; lançar liga `movimento_id IS NOT NULL`;
  em fatura `LANCADA`, como gestor: `UPDATE linhas_fatura SET lancado=false` → erro, `UPDATE faturas_fornecedor SET estado='CLASSIFICADA'` → erro, `classificar_e_aprender` → erro, `UPDATE … SET valor_iva = 23` → aceite.

#### BD-5 · Custos e stock — A3-02, A3-09, A3-03 (RPC), A3-06 (+A1-06), A1-10
- Ficheiros: `supabase/migrations/20261028120500_checkup_custos_stock.sql`, `supabase/tests/checkup-custos-stock.test.mjs`.
- Correção:
  1. `_custos_consolidados_por_obra_impl`: materiais = `SUM(CASE WHEN m.tipo='saida' THEN m.quantidade ELSE -m.quantidade END * COALESCE(p.custo_unitario,0))` com `(m.tipo='saida' OR m.subtipo='DEVOLUCAO_OBRA')`
     (igual a `custos_materiais_por_obra`); A3-09: filtro por `(m.created_at AT TIME ZONE 'Europe/Lisbon')::date` e `p_data_fim DEFAULT public._hoje_pt()` (manter a assinatura; se o default não puder mudar com `CREATE OR REPLACE`, usar `COALESCE(p_data_fim, _hoje_pt())` no corpo). Resto do corpo inalterado.
  2. `armazem_materiais_por_obra`: acrescentar `ORDER BY obra_nome, produto_nome, produto_id` (paginação estável no FE-6).
  3. `REVOKE INSERT ON public.produtos FROM authenticated; GRANT INSERT (id, nome, categoria, unidade, stock_minimo, custo_unitario, observacoes, foto_path, localizacao, ativo) ON public.produtos TO authenticated` (sem `stock_atual`, `codigo`). `criar_produto` é DEFINER e não é afetado.
  4. Trigger `BEFORE UPDATE OF unidade ON produtos`: se `OLD.unidade IS DISTINCT FROM NEW.unidade` e existe movimento do artigo → `RAISE 'A unidade não pode mudar depois do primeiro movimento.'` (RN-UNID-02).
  5. A1-10: `REVOKE UPDATE, DELETE, TRUNCATE ON public.movimentos_stock FROM authenticated, anon` + trigger `BEFORE TRUNCATE … FOR EACH STATEMENT` igual ao `audit_log_sem_truncate`.
- Teste (falha antes): saída 100 + devolução 40 a 5 € → `custos_consolidados_por_obra` materiais = 300 = `custos_materiais_por_obra`; saída às 23:30 UTC de 30/06 conta no dia 01/07;
  como `armazem`, `INSERT INTO produtos(…, stock_atual)` → `42501`, sem `stock_atual` → aceite com 0; mudar `unidade` após um movimento → erro, sem movimentos → aceite;
  `TRUNCATE movimentos_stock` como postgres → erro.

#### BD-6 · Endurecimento: PostGIS e EXECUTE de anon — A1-05, A1-07 (+A4-18), A3-13
- Ficheiros: `supabase/migrations/20261028120600_checkup_endurecimento.sql`, `supabase/tests/checkup-endurecimento.test.mjs`.
- Correção:
  1. Função de trigger `public._spatial_ref_sys_so_leitura()` que lança exceção quando `current_user IN ('anon','authenticated')`; num `DO` com
     `IF to_regclass('public.spatial_ref_sys') IS NOT NULL` → `DROP TRIGGER IF EXISTS … ; CREATE TRIGGER spatial_ref_sys_so_leitura BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.spatial_ref_sys FOR EACH STATEMENT …`
     (o PGlite não tem PostGIS: o bloco tem de passar sem a tabela). `postgres` tem o privilégio TRIGGER (provado pelo A1).
  2. `REVOKE ALL ON FUNCTION public.promover_role(uuid, role_utilizador), public.contabilidade_mapa_assiduidade(date, date), public.custos_materiais_por_obra() FROM PUBLIC, anon;` e re-`GRANT EXECUTE … TO authenticated`.
- Teste (falha antes): cria `public.spatial_ref_sys(srid int)` stub, volta a executar o SQL da migration, `DELETE` como `authenticated` → erro, como postgres → ok;
  `GRANT EXECUTE` das 3 funções a `anon` (simula o default do Supabase), reexecuta a migration → `has_function_privilege('anon', …, 'EXECUTE')` = false nas 3.
  Validar também à mão no Docker de checkup (Postgres real com PostGIS): `SET ROLE anon; DELETE FROM spatial_ref_sys WHERE srid=4326` → erro.

#### BD-7 · Alertas, push e certificados — A4-08, A4-10 (BD), A2-03 (BD), A4-13 (BD)
- Ficheiros: `supabase/migrations/20261028120700_checkup_alertas_push_certificados.sql`, `supabase/tests/checkup-alertas-push-certificados.test.mjs`.
- Correção:
  1. `alertas_detalhados` (`CREATE OR REPLACE VIEW`, mesmas colunas e ordem, `security_invoker = on`): `LEFT JOIN atribuicoes_epi ae ON ae.id = a.entidade_id AND r.tipo = 'EPI_VALIDADE'`,
     `LEFT JOIN formacoes_colaborador fc2 ON fc2.id = a.entidade_id AND r.tipo = 'FORMACAO_VALIDADE'`; colaborador por `c.id = COALESCE(ae.colaborador_id, fc2.colaborador_id, CASE WHEN r.entidade_alvo='colaborador' THEN a.entidade_id END)`;
     `entidade_detalhe` = nome do tipo de EPI / tipo de formação nesses casos (confirmar nomes das colunas dos catálogos com `\d`).
  2. RPC `public.registar_subscricao_push(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text) RETURNS void` DEFINER: exige `auth.uid()`, valida o endpoint (regra do ponto 3) e faz
     `INSERT … ON CONFLICT (endpoint) DO UPDATE SET user_id = auth.uid(), p256dh, auth, user_agent` (o endpoint muda de dono). `REVOKE … FROM PUBLIC, anon; GRANT EXECUTE … TO authenticated`.
  3. A2-03: `ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_endpoint_https CHECK (endpoint ~ '^https://(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)/') NOT VALID` (não valida linhas antigas; `DROP CONSTRAINT IF EXISTS` antes).
  4. A4-13: `INSERT INTO storage.buckets (id, name, public) VALUES ('certificados','certificados', false) ON CONFLICT (id) DO NOTHING`; policies em `storage.objects` (`DROP POLICY IF EXISTS` antes):
     `certificados_insert` WITH CHECK `bucket_id='certificados' AND public.auth_role() IN ('admin','gestor') AND name ~* '^[0-9a-f-]{36}/[0-9]+\.(pdf|jpe?g|png)$'`;
     `certificados_select` USING `bucket_id='certificados' AND public.auth_role() IN ('admin','gestor')`. Sem UPDATE/DELETE.
- Teste (falha antes): EPI a expirar + `avaliar_regras_alerta()` → `alertas_detalhados.entidade_nome` = nome do colaborador; INSERT em `push_subscriptions` com `http://169.254.169.254/x` → erro de CHECK;
  A cria a subscrição, B chama `registar_subscricao_push` com o mesmo endpoint → `user_id = B`; storage: gestor carrega `certificados/<uuid>/1.pdf` → ok, `leitura` → recusado, `leitura` não lê.

### Task 4 — Frontend, Edge e configuração (ficheiros disjuntos: podem correr em paralelo)
Regras comuns: `useAsync`/`useMutation`, sem `as any`, sem imports novos entre módulos de `features/`, texto pt-PT. Objeto de BD em falta
(`PGRST202`/`42883`, padrão `RPC_INEXISTENTE` de `colaboradoresService.ts`) ⇒ comportamento de antes. Cada lote fecha com `npm run typecheck`
e os testes do módulo; o lote Edge com `npm run check:edge && npm run test:edge`.

#### FE-1 · Contactos de colaboradores por RPC — A1-02 (+A4-03) — **publicar antes de BD-1**
- Ficheiros: `src/features/colaboradores/services/colaboradoresService.ts`, `src/features/backup/backupService.ts`, `src/__tests__/features/colaboradores/contactos.test.ts`.
- Correção: `SELECT_COLABORADOR` e `COLUNAS_COLABORADORES` sem `telemovel, email, notas`. Em `listarColaboradores`/`buscarColaborador`/`buscarMeuColaborador`, uma chamada
  `colaboradores_contactos` (via `colaboradoresDb.rpc` ou `rpcSemTipos`) e junção por `id` (uma chamada, sem N+1); se `RPC_INEXISTENTE` → `select('id, telemovel, email, notas')` (BD antiga).
  Em `criar`/`atualizarColaborador` os contactos vêm do próprio input (sem nova leitura). `backupService` junta os contactos com a mesma RPC (cópia local da chamada; `backup` não importa de `colaboradores`).
- Teste (falha antes): mock do cliente — `listarColaboradores` não pede `telemovel` no `select` e devolve-o a partir da RPC; com erro `PGRST202` na RPC cai no select antigo.

#### FE-2 · Filas offline e picagem — A5-01, A5-02, A5-03, A4-11, A5-07, A4-17 (parcial), A5-10
- Ficheiros: `src/app/lib/errosRede.ts` (novo), `src/features/picagens/offlineQueue.ts`, `src/features/picagens/hooks/usePicagensOfflineQueue.ts`, `src/features/picagens/hooks/usePicar.ts`,
  `src/features/picagens/components/PicagemPage.tsx`, `src/features/movimentos/offlineQueue.ts`, `src/features/movimentos/hooks/useOfflineQueue.ts`, `src/features/auth/lib/limparDadosLocais.ts`, testes em `src/__tests__/lib/errosRede.test.ts`, `src/__tests__/features/picagens/`, `src/__tests__/features/movimentos/`.
- Correção:
  1. `errosRede.ts`: `isNetworkError(e)` lê `message` de objetos simples (como a versão de movimentos) e `ehErroDefinitivo(e)` = `code` em `P0001`, `42501`, `23xxx`, `22xxx`, `PGRST301`/`PGRST116`. As duas filas importam daqui (remover as cópias locais de `isNetworkError`).
  2. Filas (movimentos e picagens): só `removeFromQueue` com `ehErroDefinitivo`; outro erro → mantém o item, incrementa `tentativas` e pára o ciclo; toast de aviso a partir da 5.ª tentativa (nunca apaga).
  3. Picagens: `navigator.locks.request('encivil-picagens', …)` quando existir (como movimentos) e `try/finally` a repor `flushingRef`.
  4. `PicagemPage`: com `colaboradorAtual`, usar sempre `colaboradorAtual.id` (ignora `enc_pic_colab`); `today`/contagem de pendentes com `hojeLisboa()`; `usePicar` invalida a chave do dia de Lisboa (`hojeLisboa(new Date(ts))`).
  5. `CHAVES_LOCAIS_COM_DADOS = ['enc_pic_colab', 'enc_pic_obra', 'encivil:wa-recentes']` (atualizar o comentário do inventário).
- Teste (falha antes): `isNetworkError({message:'TypeError: Failed to fetch'})` = true; fila de movimentos com erro `{message:'error code: 522'}` mantém o item e com `{code:'P0001'}` remove; idem picagens com `{code:'57014'}`;
  dois `flush()` concorrentes → `insert` 1× por item; `PicagemPage` com `colaboradorAtual=Y` e `enc_pic_colab=X` envia `Y`; `limparDadosLocais()` remove `enc_pic_colab`.

#### FE-3 · Classificar fatura: duplo clique e erros — A3-01 (UI), A3-04 (UI)
- Ficheiros: `src/features/faturas/components/ClassificarFaturaPage.tsx`, `src/__tests__/features/faturas/ClassificarFaturaPage.test.tsx`.
- Correção: `handleLancar` envolvido em `useFormGuard` (a guarda ativa antes dos `await`); "Lançar" desativado com alterações por guardar ou `nArmazemSemArtigo > 0`; `error` de `guardarMut` e `lancarMut` mostrado (toast/`role="alert"`, `parseSupabaseError`).
- Teste (falha antes): dois cliques seguidos → `lancar_fatura` chamado 1×; mutação a rejeitar → mensagem de erro visível.

#### FE-4 · Edge Functions e config — A2-01, A2-03 (Edge), A2-04, A2-07
- Ficheiros: `supabase/config.toml`, `supabase/tests/edge-config.test.mjs`, `supabase/functions/_shared/pushEndpoint.ts` + `pushEndpoint_test.ts` (novos), `supabase/functions/notificar-abastecimento/index.ts`, `supabase/functions/send-push-frota/index.ts`,
  `supabase/functions/extrair-fatura/index.ts` + `linhas.ts` + `linhas_test.ts` (novos), `supabase/functions/_shared/html.ts` + `html_test.ts` (novos), `supabase/functions/enviar-resumo-alertas/index.ts`.
- Correção:
  1. `[functions.send-push-frota] verify_jwt = false` e `[functions.enviar-resumo-alertas] verify_jwt = false`; `edge-config.test.mjs` com as 4 funções no `it.each`.
  2. `pushEndpoint.ts`: `endpointPermitido(url)` com a mesma allowlist do CHECK de BD-7; `enviar()` nas duas funções devolve sem `fetch` (e trata como 410 → remove a subscrição) quando não permitido.
  3. `extrair-fatura`: apagar o primeiro `delete()` (antes da Gemini); `linhas.ts` `validarLinhas(extracted.linhas)` (descrição string não vazia, números finitos ou null) antes de tocar na BD; manter só o delete+insert do fim.
  4. `html.ts` `esc()` (`& < > " '`) em `entidade_nome` e `entidade_detalhe` de `enviar-resumo-alertas`.
- Teste (falha antes): `edge-config.test.mjs` falha nas 2 novas; `endpointPermitido('http://localhost/x')` = false; `validarLinhas([{descricao:null}])` lança/filtra; `esc('<a href=x>')` = `&lt;a href=x&gt;`.

#### FE-5 · Dependências npm — A2-02, A2-05
- Ficheiros: `package.json`, `package-lock.json`.
- Correção: `npm audit fix` **sem** `--force` (resolve dompurify via jspdf, vite, vitest, undici, zod, fast-uri sem major); se o `dompurify` não subir, `overrides: { "dompurify": "^3.4.17" }`. Não aplicar `vite-plugin-pwa@0.2.1` (major/retrocesso).
- Teste (falha antes): `npm audit --omit=dev --audit-level=high` sai 0; `npm test` e `npm run build` verdes (PDF: testes de `gerarPdf`).

#### FE-6 · Totais sem corte de 1000 linhas + export de materiais — A3-03 (+A4-09), A3-02 (FE)
- Ficheiros: `src/app/lib/buscarTodas.ts` (novo: `buscarTodas<T>(pagina: (de, ate) => PromiseLike<{data: T[] | null; error}>)` em ciclo `.range()` de 1000 até página curta),
  `src/features/contabilidade/contabilidadeService.ts` (exports de materiais, combustível, autos, faturas), `src/features/dashboard/hooks/useResumoObras.ts`, `src/features/obras/legacy/subempreiteirosService.ts`,
  `src/features/movimentos/services/movimentosService.ts` (`listarMovimentos`), `src/features/movimentos/services/armazemService.ts` (`listarArtigosArmazem`, `armazem_materiais_por_obra`),
  `src/features/produtos/services/produtosService.ts` (`listarProdutos`), `src/features/combustivel/services/abastecimentosService.ts` (`listarAbastecimentos`), `src/features/combustivel/services/pedidosService.ts` (`listarParaAnalise`, tirar `.limit(10_000)`),
  `src/features/horarios/services/assiduidadeService.ts`, `src/features/horarios/services/faltasService.ts`, `src/app/pages/relatorios/dados.ts`, testes em `src/__tests__/lib/buscarTodas.test.ts` e `src/__tests__/features/contabilidade/`.
- Correção: cada consulta acima passa por `buscarTodas` com `order` determinístico (acrescentar `id` como desempate). `exportarMateriais` inclui `subtipo='DEVOLUCAO_OBRA'` (`.or('tipo.eq.saida,subtipo.eq.DEVOLUCAO_OBRA')`) com quantidade e custo negativos e coluna "Tipo" (Saída/Devolução).
  Sem RPCs novas (o FE não depende de BD nova; o `ORDER BY` de BD-5 só torna a paginação da RPC estável).
- Teste (falha antes): mock com 2 páginas (1000 + 500) → `exportarMateriais`/`listarAbastecimentos` devolvem 1500; export com 1 saída de 100 e 1 devolução de 40 → soma de custo = 60 × custo.

#### FE-7 · Push por dispositivo e fim de sessão — A4-10 (FE), A5-05
- Ficheiros: `src/app/lib/push.ts`, `src/app/components/PushSetup.tsx`, `src/features/auth/AuthContext.tsx`, testes em `src/__tests__/lib/push.test.ts` e `src/__tests__/features/auth/`.
- Correção: `guardarSubscricao` chama `registar_subscricao_push` (via `rpcSemTipos`); se inexistente → `upsert` antigo. Nova `removerSubscricaoDoDispositivo()` (apaga a linha do endpoint atual do próprio) chamada em `encerrarSessao` antes do `signOut` (falha silenciosa e com tempo-limite curto: o logout nunca fica preso).
  `PushSetup` deixa de engolir o erro (`captureError`). A5-05: em `registarAtividade` e em `visibilitychange`→visible, se `Date.now() - max(ultima, lerUltimaAtividade()) >= INACTIVITY_LIMIT_MS` → `encerrarSessao('local')` em vez de renovar.
- Teste (falha antes): fake timers, avançar o relógio 31 min sem correr temporizadores e disparar `mousedown` → `signOut({scope:'local'})`; `guardarSubscricao` chama a RPC e com `PGRST202` faz `upsert`; logout chama `delete` do endpoint.

#### FE-8 · Atualização da PWA e erros de rota — A5-06, A5-08
- Ficheiros: `src/app/lib/protegerSaida.tsx`, `src/app/components/UpdatePrompt.tsx`, `src/app/routes.tsx` (só `RouteErrorPage`), testes em `src/__tests__/lib/`.
- Correção: exportar `haTrabalhoPorGuardar()` (`ativos.size > 0`) de `protegerSaida.tsx`; no `controllerchange`, se houver trabalho por guardar, mostrar aviso persistente "Nova versão disponível — Atualizar" (botão recarrega) em vez de navegar.
  `RouteErrorPage`: `useEffect(() => { if (!isChunkError) captureError(error) }, [error])`.
- Teste (falha antes): com `useProtegerSaida(true)` montado, `controllerchange` não altera `location`; rota que lança → `captureError` 1×.

#### FE-9 · Datas de Lisboa no combustível e URLs de fotos — A5-04, A5-13
- Ficheiros: `src/features/combustivel/components/modulo/HistoricoAbastecimentos.tsx`, `src/app/pages/AbastecimentoFormPage.tsx`, `src/features/combustivel/components/relatorio/RelatorioCombustivelPage.tsx`,
  `src/features/combustivel/components/pedidos/PedidoPage.tsx`, `src/app/lib/exportCsv.ts`, `src/app/lib/exportXlsx.ts`, `src/app/lib/exportJson.ts`, teste em `src/__tests__/features/combustivel/`.
- Correção: trocar `toISOString().split('T')[0]` por `dataISOLocal`/`hojeLisboa` de `@/app/lib/dataLisboa` (filtros do mês, "Hoje/Ontem", data por defeito, nomes de ficheiro). `href`/`src` de `foto_url` só se começar por `https://`.
- Teste (falha antes): com `TZ=Europe/Lisbon`, julho/2026 → `{dataInicio:'2026-07-01', dataFim:'2026-07-31'}`; `foto_url='javascript:alert(1)'` → sem link.

#### FE-10 · Certificado de formação — A4-13 (FE)
- Ficheiros: `src/features/epis/components/FormacoesPage.tsx`, teste em `src/__tests__/features/epis/`.
- Correção: se o upload do certificado falhar, não registar a formação; mostrar o erro e manter o formulário (o utilizador pode tirar o ficheiro e registar sem certificado). Com a BD antiga (sem bucket) é o mesmo caminho.
- Teste (falha antes): `upload` a rejeitar → `registar` não é chamado e a mensagem aparece.

---

## 4. Ordem de publicação (para o relatório final)
1. Site (todos os FE, em especial **FE-1 antes de BD-1**). O site novo funciona com a BD antiga (fallbacks de FE-1, FE-7, FE-10).
2. Migrations no SQL Editor, por esta ordem: `20261028120100` → `…120200` → `…120300` → `…120400` → `…120500` → `…120600` → `…120700`.
3. Edge Functions (FE-4): `notificar-abastecimento`, `send-push-frota`, `extrair-fatura`, `enviar-resumo-alertas` — com o `config.toml` novo.
4. `npx supabase gen types typescript --local > src/integrations/supabase/types.ts` (pelo Git Bash) e remover remendos `rpcSemTipos`/`db.ts` das RPCs novas.

## 5. Passos manuais (utilizador, produção, só leitura salvo indicação)
1. **A1-05** — SQL Editor: `select has_table_privilege('anon','public.spatial_ref_sys','DELETE');` e `select count(*) from public.spatial_ref_sys where srid = 4326;` (tem de ser 1; se for 0, o geofence já está partido).
2. **A2-01** — Dashboard › Edge Functions › `send-push-frota` e `enviar-resumo-alertas` › "Enforce JWT verification": se estiver ligado, o push diário e o email de alertas estão a falhar hoje. Depois do deploy com o `config.toml` novo tem de ficar desligado nas duas.
3. **A4-13** — Dashboard › Storage: o bucket `certificados` existe? Que policies tem? (A migration BD-7 é idempotente; se houver policies criadas à mão com outros nomes, dizer antes de aplicar.)
4. **A4-04 (opcional, decisão sua)** — depois de BD-2, os dias passados continuam com `horas_efetivas = 0`. Para recalcular (ex.: outubro): `select public.calcular_resumo_dia(d::date) from generate_series('2026-10-01'::date, '2026-10-27', '1 day') d;` — reescreve horas efetivas, desvio e propostas; não toca nas horas suplementares já validadas.
5. **A1-09** — Dashboard › Authentication › Sign In / Providers: confirmar "Allow new users to sign up" desligado (toda a conta nova nasce `gestor`).
6. **A1-11** — mover o segredo `app.edge_function_secret` para `privado.segredos` (como `fase9_agendar_push_frota`) quando houver janela; registado.
7. **A3-10** — decidir: contagem de inventário (`INVENTARIO`) é só admin/gestor (como diz o doc 17) ou também `armazem` (como a BD permite)? Até lá fica como está.

## 6. Lotes adicionais (decididos pelo controlador depois da concorrência, da carga e das revisões)

#### Acrescentos a lotes existentes
- **BD-6** também: (a) **A1-09 promovido a Média** — `handle_new_user` cria a conta com papel `leitura` (não `gestor`); confirmar que
  `supabase/functions/admin-utilizadores` define sempre o papel pedido a seguir (via `promover_role`) e que nenhum teste/fluxo depende
  do `gestor` por omissão. Teste: INSERT em `auth.users` → `profiles.role = 'leitura'`. (b) `REVOKE SELECT ON public.colaboradores FROM anon`
  (revisão BD-1). Ficheiros extra: os mesmos do BD-6 + `supabase/tests/seguranca.test.mjs` se precisar de ajuste.
- **FE-6** também cobre as truncagens medidas na carga (seed com 53 mil movimentos e 2 214 artigos): `listarArtigosArmazem`, `listarProdutos`,
  relatório de stock do ano (`listarMovimentos`), `exportarMovimentosArmazem` (o `limit` de 5000 nunca chega — o PostgREST corta em 1000),
  `exportarMateriais`, e a RPC `armazem_materiais_por_obra` (14,6 mil linhas). Regra: listas/exportações que precisam de tudo paginam com
  `.range()` em blocos de 1000 até esgotar (helper local ao service, não genérico de filtros); totais vêm de agregação no servidor quando existir.
  Ver `.superpowers/sdd/2026-10-28-checkup-geral-carga/task-7-report.md`.

#### BD-8 · Picagens idempotentes (reenvio da fila offline) — FE-2 (preocupação), A5-07
- Ficheiros: `supabase/migrations/20261028120800_checkup_picagens_client_id.sql`, `supabase/tests/checkup-picagens-client-id.test.mjs`.
- Correção: coluna `picagens.client_id uuid NULL` + índice único parcial `(client_id) WHERE client_id IS NOT NULL`; o caminho de inserção usado
  pelo site (INSERT direto e/ou `registar_picagem_geofence` — confirmar no frontend) aceita `client_id` e, se já existir picagem com esse
  `client_id`, devolve a existente em vez de criar outra (no INSERT direto: `ON CONFLICT` não é possível via PostgREST sem `upsert`; usar
  trigger `BEFORE INSERT` que, se o `client_id` já existe e pertence ao mesmo colaborador, faz `RETURN NULL`, ou o upsert com
  `ignoreDuplicates` — escolher o que o PostgREST suporta e testar). GRANT da coluna nova a `authenticated` (INSERT/SELECT).
- Teste (falha antes): dois INSERT com o mesmo `client_id` → 1 linha; `client_id` diferente → 2; outro colaborador com o mesmo `client_id` → recusado.

#### FE-2b · Fila de picagens envia `client_id` — depende de BD-8 (com fallback para BD antiga)
- Ficheiros: o serviço/fila de picagens tocados no FE-2 (`src/features/picagens/...`) + teste.
- Correção: cada picagem recebe `client_id = crypto.randomUUID()` no momento do registo (antes de ir para a fila) e envia-o sempre;
  coluna inexistente (`PGRST204`/`42703`) ⇒ reenvia sem `client_id` (BD antiga). Teste: o mesmo item reenviado 2× usa o mesmo `client_id`.

#### BD-9 · Desempenho medido na carga (Task 7)
- Ficheiros: `supabase/migrations/20261028120900_checkup_desempenho.sql`, `supabase/tests/checkup-desempenho.test.mjs`.
- Correção: (1) índice `movimentos_stock (tipo, created_at DESC)` (`CREATE INDEX IF NOT EXISTS`); (2) nas policies com `auth.role()`,
  `auth.uid()`, `public.auth_role()` ou `public.pode_escrever(...)` avaliados por linha, envolver em `(select …)` para o planner os avaliar uma
  vez (initplan) — reescrever com `DROP POLICY IF EXISTS` + `CREATE POLICY` mantendo **exatamente** a mesma semântica, papéis e comandos;
  (3) `obras` SELECT: trocar a chamada por linha a `pode_ver_obra(id)` por `(select public.pode_ler_obras()) OR public._autor_designado(id)`
  ou equivalente que preserve o resultado — confirmar a semântica atual de `pode_ver_obra` antes. Listar no relatório cada policy reescrita.
- Teste: (a) o índice existe; (b) para cada policy reescrita, a matriz de acesso por papel (admin, gestor, armazem, medicoes, mecanico,
  motorista, leitura, anon) é idêntica antes/depois — gerar a matriz com as migrations até 120800 e comparar com a de 120900 (mesmo teste);
  (c) `pg_policies.qual` das reescritas contém `SELECT` envolvendo as funções. A melhoria de tempo é medida pelo controlador na re-execução da carga.

#### FE-11 · Contagens baratas — Task 7
- Ficheiros: o service do dashboard que faz as contagens `count: 'exact'` de entradas/saídas de hoje, e `listarMovimentosArmazem`.
- Correção: `listarMovimentosArmazem` pede `count: 'exact'` só na 1.ª página (as seguintes reutilizam o total) — ou `planned` se o ecrã
  só mostra "≈"; contagens do dashboard com `head: true` e filtro por `created_at >= início do dia de Lisboa` (usa o índice do BD-9).
  Teste: a 2.ª página não pede `count`.
