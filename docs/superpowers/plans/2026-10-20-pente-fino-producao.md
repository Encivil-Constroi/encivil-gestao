# Pente fino final para produção — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os defeitos encontrados na auditoria de 2026-10-20 (6 áreas), incluindo o "flash" após o login e a automação da bomba de combustível, sem regressões.

**Architecture:** Correções pontuais por domínio. Cada domínio tem os seus ficheiros e, quando precisa de BD, uma migration própria com timestamp distinto. As tarefas 1-6 tocam ficheiros disjuntos e correm em paralelo. A tarefa 0 cria o helper de datas partilhado antes delas.

**Tech Stack:** React 18 + TS strict, Vitest, Supabase (Postgres/PGlite nos testes), Edge Functions Deno.

**Spec:** relatórios da auditoria (resumidos em cada tarefa abaixo); regras do `CLAUDE.md`.

## Global Constraints
- Ler `CLAUDE.md` antes de começar. UI, erros e commits em pt-PT.
- **Ordem de publicação: site → migrations → Edge Functions.** O site novo tem de funcionar com a BD antiga: se uma RPC/parâmetro novo não existir (`PGRST202` / `42883`), cair no comportamento anterior.
- Migrations novas: idempotentes, `GRANT` explícito, RLS, `SET search_path = public` em SECURITY DEFINER, terminar com bloco `-- ROLLBACK` comentado. Não aplicar em produção.
- Não editar `src/integrations/supabase/types.ts`; RPC sem tipos → `db.ts` do módulo ou `rpcSemTipos`.
- Sem `as any`, sem fetch com `useEffect`+`useState` (usar `useAsync`/`useMutation`), sem novos imports entre `features/`.
- TDD: teste que falha primeiro. Correr **só os testes do teu domínio** (`npx vitest run <ficheiros>`) e `npm run typecheck`. A suite completa corre no fim (tarefa 7).
- Não fazer commit nem push (o coordenador integra no fim). Não usar `npm run dev` para escrever dados.
- Datas "de hoje"/limites de dia: usar o helper da tarefa 0, nunca `toISOString().slice(0,10)` sobre datas locais.

## Review Focus
1. Utilizador faz login com MFA obrigatório: nenhum frame da app antes do estado MFA decidido (teste na tarefa 1).
2. Rede do Shelly perde a resposta `stop`: a bomba tem de continuar a receber `stop` (teste na tarefa 2).
3. Telemóvel perde a rede depois de o servidor gravar o movimento: reenvio da fila não duplica (teste na tarefa 3).
4. Site novo com BD antiga (migrations ainda não aplicadas): fluxos de stock, bomba e login continuam a funcionar (teste de fallback nas tarefas 2 e 3).
5. Datas entre 00:00 e 01:00 de Lisboa no verão: ficam no dia certo (testes nas tarefas 0, 4 e 5).

---

### Task 0: Helper de datas Europe/Lisbon (coordenador)

**Files:** Create `src/app/lib/dataLisboa.ts`, Test `src/__tests__/lib/dataLisboa.test.ts`

**Interfaces — Produces:**
- `hojeLisboa(agora?: Date): string` → `'YYYY-MM-DD'` no fuso Europe/Lisbon.
- `dataISOLocal(d: Date): string` → `'YYYY-MM-DD'` com os campos locais (ano/mês/dia) da `Date`, sem conversão UTC.
- `limitesDiaLisboa(data: string): { inicio: string; fimExclusivo: string }` → instantes ISO com offset (`+01:00`/`+00:00`) do início do dia e do início do dia seguinte em Lisboa.

- [ ] Testes: `hojeLisboa(new Date('2026-07-14T23:30:00Z'))==='2026-07-15'`; `limitesDiaLisboa('2026-07-15')` → `{inicio:'2026-07-15T00:00:00+01:00', fimExclusivo:'2026-07-16T00:00:00+01:00'}`; `limitesDiaLisboa('2026-01-10').inicio==='2026-01-10T00:00:00+00:00'`; dia de mudança de hora `2026-10-25` → fim `+00:00`.
- [ ] Implementar com `Intl.DateTimeFormat` (`timeZone:'Europe/Lisbon'`). Correr o teste.

### Task 1: Login sem flash + sessão/PWA

**Files:** `src/features/auth/hooks/useEstadoMfa.ts`, `src/app/pages/LoginPage.tsx`, `src/features/auth/AuthContext.tsx`, `src/features/auth/lib/limparDadosLocais.ts`, `src/app/lib/useAsync.ts` (só remover `limparCacheMemoria` se sem uso), `src/sw.ts`, `src/app/lib/sentry.ts`; testes em `src/__tests__/features/auth/` e `src/__tests__/pages/`.

Causa: após `SIGNED_IN`, `AuthGuard` deixa passar o `<Outlet/>` com `profile` null (mostra "Ainda não tem funções…"), depois `useEstadoMfa` liga com `loading=false` num frame, a seguir spinner e remontagem do `MainLayout`.

- [ ] Teste `AuthGuard` com `useEstadoMfa` **real** (mock só dos serviços MFA/Supabase): perfil passa de `null` para `p`; o `Outlet` nunca renderiza antes de o estado MFA estar resolvido.
- [ ] `useEstadoMfa`: `ativo = !!uid && !!profile`; devolver `loading: loading || (ativo && data === null && error === null)`. Manter o diff já existente do `AuthContext` (sessaoVersaoRef).
- [ ] `LoginPage`: `if (session) return <Navigate to="/" replace />` (remover `navigate()` durante o render).
- [ ] Inatividade: último instante de atividade em `localStorage` (chave `encivil-ultima-atividade`), partilhado entre separadores; logout por inatividade com `signOut({ scope: 'local' })`. Teste: atividade noutro separador (evento `storage`) adia o logout.
- [ ] `fetchProfile`: 1 nova tentativa após falha de rede antes de baixar `loading`.
- [ ] `limparDadosLocais`: não apagar as chaves `sw_reload_at`, `chunk_reload_ts`, `encivil-recuperacao` (remover só as restantes do `sessionStorage`). Teste.
- [ ] Ao mudar de identidade (`mudouIdentidade`) apagar também `caches.delete('supabase-api')` (best effort). `sw.ts`: `/auth/v1/` e `/functions/v1/` passam a `NetworkOnly`; corrigir o comentário.
- [ ] Sentry: `setSentryUser` só com id (sem email).
- [ ] `npx vitest run src/__tests__/features/auth src/__tests__/pages src/__tests__/lib` + `npm run typecheck`.

### Task 2: Automação da bomba de combustível

**Files:** Create `supabase/migrations/20261020100000_bomba_fiabilidade.sql`; modify `supabase/functions/pump-status/*`, `supabase/functions/notificar-abastecimento/*`, `supabase/config.toml`, `supabase/scripts/shelly-instalar.mjs` (+test), `src/features/combustivel/**` (PedidoPage), `docs/21-shelly-pro3-bomba.md`; tests `supabase/tests/bomba.test.mjs`, `supabase/tests/cancelar-autorizacao-bomba.test.mjs`.

- [ ] **ALTO 1** `pump_poll`: relé reportado ligado (`on=true`) sem sessão APP aberta, se a última sessão fechou por TERMINEI/EMERGENCIA/TEMPO/cancelamento há < 15 min ⇒ responder `stop` (não criar sessão MANUAL). Teste: ligar → `parar_bomba` → poll(on) = stop → novo poll(on) continua `stop`, sem sessão MANUAL.
- [ ] **ALTO 2** `relay_confirmado_em` na sessão, gravado no 1.º poll com `on=1`. Sessão fechada sem confirmação ⇒ repor `pump_activated_at`, `pump_auth_token`, `bomba_ligada_em` a NULL, motivo `NAO_ARRANCOU`. Teste: ligar → poll ⇒ authorized → poll(off) ⇒ `ligar_bomba` volta a aceitar e `concluir` recusa.
- [ ] **MÉDIO 5** `concluir_pedido_abastecimento` recusa se `pump_heartbeat.relay_on` for verdadeiro e o heartbeat for recente (< 30 s). UI: fase da leitura final só com `desligadaConfirmada` (senão aviso "A aguardar que a bomba desligue"). Teste SQL.
- [ ] **MÉDIO 6** `cancelar_pedido_abastecimento` depois de `pump_activated_at` com relé confirmado ⇒ recusar com mensagem "A bomba já forneceu combustível: conclua o pedido com a leitura final." Teste.
- [ ] `ligar_bomba` usa `COALESCE(comb_veiculos.pump_max_seconds, 600)`. Teste.
- [ ] **MÉDIO 3** `pump-status`: `?probe=1` valida o segredo e responde `{"probe":"ok"}` sem chamar `pump_poll` (segredo errado → 401). Instalador usa `probe=1` e só diz OK com `probe:"ok"`; `--password` deixa de aparecer em mensagens (preferir `SHELLY_PASSWORD`). Testes Deno/Node existentes alargados.
- [ ] **MÉDIO 4** `config.toml`: `[functions.notificar-abastecimento] verify_jwt = false` + teste-guarda que lê o ficheiro.
- [ ] `notificar-abastecimento`: marcar `push_notificado_em` só depois de pelo menos um envio com sucesso.
- [ ] Fallback: a UI funciona com a BD antiga (sem `relay_confirmado_em`).
- [ ] `npx vitest run supabase/tests/bomba.test.mjs supabase/tests/cancelar-autorizacao-bomba.test.mjs supabase/scripts/shelly-instalar.test.mjs src/__tests__/features/combustivel` + `npm run check:edge && npm run test:edge` + typecheck.

### Task 3: Armazém e stock

**Files:** Create `supabase/migrations/20261020110000_armazem_integridade.sql`; modify `src/features/movimentos/**` (useArmazem, useOfflineQueue, offlineQueue), `src/features/produtos/services/produtosService.ts`, `src/features/ferramentas/hooks/useEmprestimos.ts`, `src/app/pages/armazem/MovimentoFormPage.tsx`, `src/app/pages/armazem/*` se necessário; tests `supabase/tests/armazem.test.mjs`, `supabase/tests/seguranca-guardas.test.mjs`, `src/__tests__/features/movimentos|produtos|ferramentas`.

- [ ] **CRÍTICO** idempotência: coluna `movimentos_stock.client_id uuid` + índice único parcial; `registar_movimento_armazem(..., p_client_id uuid DEFAULT NULL)` devolve a linha existente se o id já existir. A fila envia `queueId` como `p_client_id`; se a BD antiga responder função inexistente, reenviar sem o parâmetro. `flush` dentro de `navigator.locks.request('encivil-queue', …)` quando disponível. Testes: reenvio com o mesmo `client_id` não altera o stock; dois flush concorrentes enviam cada item uma vez.
- [ ] **ALTO** `REVOKE UPDATE ON produtos FROM authenticated` + `GRANT UPDATE (<colunas editáveis exceto stock_atual>)` — confirmar as colunas usadas por `produtosService`. Teste: UPDATE direto de `stock_atual` falha.
- [ ] **ALTO** stock inicial: RPC `criar_produto(p jsonb)` que insere com 0 e regista movimento de entrada inicial (mesma transação); serviço usa-a com fallback ao fluxo antigo se a RPC não existir. Teste: produto com stock inicial 5 tem 1 movimento de 5.
- [ ] **MÉDIO** imutabilidade: `registar_movimento_armazem` grava todos os campos no INSERT (sem UPDATE posterior); trigger `BEFORE UPDATE OR DELETE ON movimentos_stock` que lança erro (padrão `audit_log_imutavel`). Teste.
- [ ] **MÉDIO** `DEVOLUCAO_OBRA` limitado ao líquido enviado para essa obra/produto. Teste.
- [ ] **MÉDIO** ferramentas: índice único parcial `(ferramenta_id) WHERE estado='ativo'`; revogar INSERT/UPDATE diretos de `emprestimos_ferramentas` se o frontend só usa RPCs (verificar antes; se usa diretos, só o índice). Teste.
- [ ] **BAIXO** `produtos_em_alerta` devolve `numeric` (DROP+CREATE, GRANT).
- [ ] `MovimentoFormPage`: parser numérico pt-PT (remove pontos de milhar, vírgula→ponto, `Number()`; "10abc" inválido). Teste.
- [ ] `useEmprestimosPaginados` com `useAsync` (cacheKey por filtros+página).
- [ ] Corrigir CLAUDE.md/comentário "advisory lock" se a RPC usa `FOR UPDATE`: **não editar CLAUDE.md**, só reportar.

### Task 4: Obras, livro de obra, custos, relatórios

**Files:** Create `supabase/migrations/20261020120000_obras_livro_integridade.sql`; modify `supabase/migrations/20261008100000_obras_concorrencia_mfa.sql` (só cabeçalho: "depois de 20261008090000"), `src/features/custos/services/custosService.ts`, `src/features/obras/lib/autoDados.ts`, `src/features/obras/db.ts`, `src/features/faturas/services/faturasService.ts`, `src/features/livro-obra/**`, `src/app/pages/RelatorioSemanalPage.tsx`, `ReportsPage.tsx`, `ExportacaoContabilidadePage.tsx`, `src/features/custos/**/CustosObraPage.tsx`, `SubempreiteiroDetailPage.tsx`; tests `supabase/tests/` (novo `livro-obra-rls.test.mjs` copiado do mais parecido), `src/__tests__/features/obras|custos`.

- [ ] **ALTO** `guias_all` → SELECT `true`, INSERT/UPDATE com `pode_escrever('obras')`. `reg_obra_ins` → `WITH CHECK (pode_escrever('obras') AND autor_id = auth.uid())` (confirmar se o serviço envia `autor_id`; senão DEFAULT `auth.uid()`). Testes por papel (leitura/motorista recusados).
- [ ] **ALTO** `custoObra` usa `custos_materiais_por_obra` (inclui devoluções, sem truncamento). Teste.
- [ ] **MÉDIO** `autos_medicao`: preflight de duplicados (se houver, `RAISE NOTICE` e não criar o índice), índice único `(subempreiteiro_id, numero)`; `criar_auto_rpc` com `SET search_path = public`.
- [ ] **MÉDIO** `guardarLinhasAuto` atómico: RPC `substituir_linhas_auto(p_auto_id uuid, p_linhas jsonb)` com fallback ao fluxo antigo. Teste SQL.
- [ ] **MÉDIO** remover `as unknown as any` nos 4 serviços (tipos gerados ou `db.ts`); remover remendo duplicado de `criar_auto_rpc` em `obras/db.ts`.
- [ ] **MÉDIO** `RelatorioSemanalPage` e `ReportsPage` (linhas ~1106/1125/1145): `useAsync`.
- [ ] **MÉDIO** datas: substituir `toISOString().slice(0,10)` de datas locais pelos helpers da tarefa 0 nos ficheiros listados.
- [ ] `npx vitest run supabase/tests/<novos e obras*> src/__tests__/features/obras src/__tests__/features/custos src/__tests__/pages` + typecheck.

### Task 5: RH, picagens, utilizadores, notificações

**Files:** Create `supabase/migrations/20261020130000_rh_picagens_seguranca.sql`; modify `src/features/horarios/**`, `src/features/picagens/services/picagensService.ts`, `src/features/epis/components/EpisPage.tsx`, `FormacoesPage.tsx`, `src/features/notificacoes/**`, `supabase/functions/admin-utilizadores/*`, `supabase/functions/extrair-fatura/*`, `supabase/functions/send-push-frota/*`; tests correspondentes.

- [ ] **ALTO** `assiduidadeService` fim de mês com `dataISOLocal`. Teste em julho.
- [ ] **ALTO** `picagensService` limites com `limitesDiaLisboa` e `.lt(fimExclusivo)`. Teste.
- [ ] **ALTO** `admin-utilizadores.alterarPapel` via `userClient.rpc('promover_role', …)` (respeita lockout e audit). `convidar`: tratar erro do update do perfil como no `criar`. Ligação a colaborador com `.is('user_id', null)`.
- [ ] **MÉDIO** `picagens_insert`: próprio colaborador ou admin/gestor. Teste SQL.
- [ ] **MÉDIO** `useNotifications`: consultas para um service + `useAsync`; erros visíveis; `today` com `hojeLisboa`.
- [ ] **BAIXO** "hoje" com `hojeLisboa` em FaltasPage, AtribuicaoHorarioPage, EpisPage, FormacoesPage.
- [ ] **BAIXO** `extrair-fatura`: apagar linhas só depois da extração com sucesso. `send-push-frota`: update em lote `.in('id', ids)`.
- [ ] Fora de âmbito (reportar como risco, não implementar): email/telemóvel de colaboradores visíveis a todos e bucket `rh` público — exigem RPC/URLs assinados e decisão de negócio.

### Task 6: Infra, CI, desempenho

**Files:** `src/build/vendorChunks.ts`, `.github/workflows/ci.yml`, `public/_headers`, Create `supabase/migrations/20261020140000_views_sequencias.sql`; test `supabase/tests/seguranca-guardas.test.mjs` (só acrescentar casos no fim, num bloco `describe` novo) ou novo `views-sequencias.test.mjs`.

- [ ] `vendorChunks`: `clsx|tailwind-merge|class-variance-authority` num chunk `vendor-utils` antes de `vendor-charts`. Verificar com `npm run build` que `dist/index.html` não faz modulepreload de `vendor-charts`.
- [ ] CI: `npm run lint` no job typecheck; renomear `VITE_SUPABASE_ANON_KEY` → `VITE_SUPABASE_PUBLISHABLE_KEY`.
- [ ] CSP `img-src`: `'self' data: blob: https://*.supabase.co` + domínios de tiles usados pelo Leaflet (grep `tileLayer`/`url=` no código).
- [ ] Migration: `ALTER VIEW alertas_detalhados SET (security_invoker = on)` só se as tabelas base têm SELECT para `authenticated` (verificar no harness); `GRANT USAGE ON SEQUENCE produto_codigo_seq TO authenticated`. Teste.

### Task 7: Integração e verificação final (coordenador)
- [ ] `npm run typecheck`, `npm run lint`, `npm test` (suite completa), `npm run build`, `npm run check:edge && npm run test:edge` — tudo verde.
- [ ] Revisão de código de cada tarefa (spec + qualidade).
- [ ] `agent-browser` sobre `npm run dev`: `/login` carrega sem erros de consola; sem credenciais não se valida o fluxo autenticado (reportar).
- [ ] Relatório final com migrations por ordem: 20261008100000 (se ainda não aplicada), 20261020100000, 110000, 120000, 130000, 140000.
