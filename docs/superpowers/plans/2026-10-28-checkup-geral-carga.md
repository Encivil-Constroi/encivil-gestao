# Checkup geral + testes de carga — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encontrar e corrigir fragilidades de segurança e bugs do ENCIVIL Gestão, e provar com testes de carga/concorrência locais que os fluxos críticos se mantêm corretos de 10 a 500 utilizadores simultâneos.

**Architecture:** Três fases. (A) Auditoria em paralelo por domínio — cada auditor só lê e escreve um ficheiro de achados. (B) Correções sequenciais por severidade, cada uma com teste que falha sem ela (TDD). (C) Infra de carga em `scripts/carga/` contra o Supabase local (Docker), validação do frontend com `agent-browser` contra o Vite ligado ao Supabase local, e relatório final.

**Tech Stack:** React 18 + Vite + TS strict, Supabase (Postgres/PostgREST/Auth/Storage/Edge Deno), Vitest + PGlite (`supabase/tests/pg-harness.mjs`), Node 24, `@supabase/supabase-js` (já dependência), `agent-browser` CLI.

**Spec:** `docs/superpowers/specs/2026-10-28-checkup-geral-carga-design.md`

## Global Constraints
- Todas as regras de `CLAUDE.md` valem (lê-o inteiro). Destaques abaixo.
- **Nunca** tocar em produção: sem carga, sem utilizadores, sem escrita. `npm run dev` sem override liga à BD real — usar sempre `VITE_SUPABASE_URL=http://127.0.0.1:55321` e a chave anon local.
- Stack local do checkup: cópia isolada de `supabase/` em `<scratchpad>/carga-stack` com `project_id = "encivil-checkup"` e portas 553xx (API 55321, BD 55322). A stack `encivil-local` (portas 543xx) pertence a outro trabalho: **não parar nem resetar**. Comandos: `npx supabase <cmd> --workdir <scratchpad>/carga-stack`; para aplicar migrations novas, recopiar `supabase/migrations` para lá e `db reset --workdir …`.
- Migrations novas: `supabase/migrations/2026102812xxxx_<nome>.sql` (timestamp > último existente), idempotentes, `GRANT` explícito + RLS, `SECURITY DEFINER` com `SET search_path = public`, `public.auth_role()`/`public.pode_escrever()` (nunca `auth.jwt()->>'role'`), terminam com bloco `-- ROLLBACK`.
- Site novo funciona com a BD antiga (RPC/coluna inexistente ⇒ comportamento anterior).
- Cada correção de regra/RLS traz teste de BD em `supabase/tests/*.test.mjs` que falha sem a correção; cada correção de frontend traz teste Vitest em `src/__tests__/`.
- Não retirar acesso legítimo. Acesso mais largo que os docs: corrigir só se expõe dados pessoais (NIF, contactos, salários) ou permite escrita/aprovação fora do papel; senão registar.
- `npm audit`: só correções sem major (exceção: Alta/Crítica explorável no uso real).
- Sem `as any`, sem helpers genéricos de filtros, sem novos imports entre `features/`, sem editar `src/integrations/supabase/types.ts` à mão, `useAsync`/`useMutation` para dados remotos.
- Texto de UI/erros/commits em pt-PT; commits `tipo(âmbito): descrição` + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca `--no-verify`, nunca push.
- Antes de cada commit: `npm run typecheck` 0 erros e os testes tocados verdes.

## Review Focus
1. Duplo clique / dois dispositivos a submeter a mesma operação (saída de stock, aprovação de abastecimento, empréstimo de ferramenta) → uma só aplicação, a segunda falha com mensagem pt-PT. Testado na Task 6 (concorrência) e Task 3 (correções).
2. Utilizador `leitura`/`motorista` a chamar diretamente a API (PostgREST/RPC) em vez da UI → recusado pela BD. Testado na Task 3 (testes por papel em cada correção) e na sondagem anónima/papéis da Task 1.
3. Rede móvel instável em obra (fila offline reenviada duas vezes) → sem movimento duplicado. Auditor de frontend verifica idempotência da `offlineQueue`; teste na Task 4 se houver achado.
4. Datas à volta da meia-noite e mudança de hora (Europe/Lisbon) em picagens/relatórios diários → dia correto. Auditor RH/frontend; teste na Task 4 se houver achado.
5. Listas grandes (milhares de movimentos/colaboradores) → paginação/limites sem truncar silenciosamente em 1000 linhas (`max_rows`). Medido na Task 7 (carga com seed grande).

---

### Task 1: Auditoria paralela por domínio (só leitura)

Cinco auditores em paralelo (`superpowers:dispatching-parallel-agents`), cada um escreve **apenas** o seu ficheiro em `docs/auditorias/2026-10-28/`. Nenhum altera código.

**Files:**
- Create: `docs/auditorias/2026-10-28/A1-bd-seguranca.md` (RLS, GRANTs, views `security_invoker`, `SECURITY DEFINER`, Storage, `pg_cron`/`pg_net`, inventário de funções executáveis por anon/authenticated a partir das migrations — a definição vigente é a da última migration que a redefine)
- Create: `docs/auditorias/2026-10-28/A2-edge-infra.md` (Edge Functions: auth, CORS, validação, segredos, SSRF; `public/_headers` CSP; `src/sw.ts`; `npm audit --omit=dev` e `npm audit`; segredos no repositório)
- Create: `docs/auditorias/2026-10-28/A3-stock-dinheiro.md` (armazém, movimentos, ferramentas, inventário, faturas, autos, subempreitadas, custos, contabilidade — RPCs e services/UI)
- Create: `docs/auditorias/2026-10-28/A4-operacao-pessoas.md` (abastecimento/bomba, frota, picagens, colaboradores/NIF, EPIs, horários, alertas, notificações)
- Create: `docs/auditorias/2026-10-28/A5-frontend-transversal.md` (rotas × `RoleGuard`, `MATRIZ_ESCRITA` × `pode_escrever`, XSS/`dangerouslySetInnerHTML`/URLs de dados, `useAsync`/`useMutation` (corridas, estados presos), offline queue, datas Lisboa, exports (injeção de fórmulas), sessão/auto-logout/MFA, erros não tratados)

**Formato de cada achado** (obrigatório, para a Task 2 consumir):
```
### <ID ex. A3-07> <título>
- Severidade: Crítica | Alta | Média | Baixa
- Onde: caminho:linha (migration vigente ou ficheiro)
- Evidência: excerto/raciocínio concreto; cenário de falha (entradas → resultado errado)
- Correção proposta: 1-3 linhas
- Teste que prova: nome + asserção
```
Regras para auditores: só achados verificados no código (nada de "possível" sem cenário); confirmar que nenhuma migration posterior já corrigiu; respeitar a regra de "acesso legítimo" das Global Constraints.

- [ ] **Step 1:** Despachar os 5 auditores em paralelo com o prompt acima e o caminho do spec e do `CLAUDE.md`.
- [ ] **Step 2:** Verificar que os 5 ficheiros existem e seguem o formato.
- [ ] **Step 3: Commit** `docs(checkup): achados da auditoria por domínio`

### Task 2: Triagem e consolidação

**Files:**
- Create: `docs/auditorias/2026-10-28/00-triagem.md`

- [ ] **Step 1:** Ler os 5 ficheiros; verificar pessoalmente cada Crítica/Alta no código (descartar falsos positivos com motivo); deduplicar.
- [ ] **Step 2:** Escrever a lista ordenada de correções: `ID · severidade · lote` em lotes de Task 3 (BD/SQL) e Task 4 (frontend/edge), agrupando por ficheiro para que cada lote toque ficheiros distintos (permite paralelo sem conflitos).
- [ ] **Step 3: Commit** `docs(checkup): triagem dos achados`

### Task 3: Correções de BD (lotes por severidade)

Um lote = uma migration + um ficheiro de teste. Executar lote a lote (migrations partilham a cronologia — sequencial).

**Files (por lote N):**
- Create: `supabase/migrations/20261028120N00_checkup_<tema>.sql`
- Create/Modify: `supabase/tests/checkup-<tema>.test.mjs` (copiar o padrão de `seguranca-guardas.test.mjs`: `criarBanco`, `como`, utilizadores por papel)

- [ ] **Step 1:** Escrever os testes do lote: por achado, (a) o ataque/bug falha agora — ex. `it('leitura não executa X', …expect(…).rejects.toThrow())`; (b) o papel legítimo continua a funcionar.
- [ ] **Step 2:** `npx vitest run supabase/tests/checkup-<tema>.test.mjs` → FAIL nos testes (a).
- [ ] **Step 3:** Escrever a migration (técnica de wrapper `_impl` de `20260929000000_seguranca_rpcs_storage.sql` quando for guarda numa função existente; atuar só se o objeto existir; bloco `-- ROLLBACK`).
- [ ] **Step 4:** Mesmo comando → PASS. Depois `npx vitest run supabase/tests` → tudo PASS (incl. o teste-guarda de ROLLBACK).
- [ ] **Step 5:** Mutação: comentar a guarda nova, confirmar que o teste falha, repor.
- [ ] **Step 6:** Se mudou assinatura/coluna usada pelo site: regenerar tipos pelo Git Bash (`npx supabase gen types typescript --local > src/integrations/supabase/types.ts`) e `npm run typecheck`.
- [ ] **Step 7: Commit** `fix(<âmbito>): <correção>` (um por lote).

### Task 4: Correções de frontend e Edge Functions (lotes em paralelo)

Lotes da triagem com ficheiros disjuntos podem correr em paralelo; o mesmo ficheiro nunca em dois lotes.

**Files:** os indicados por cada achado; testes em `src/__tests__/features/<m>/` ou `src/__tests__/lib/`; Edge em `supabase/functions/<f>/*.test.ts`.

- [ ] **Step 1:** Teste que reproduz o achado → FAIL (`npx vitest run <ficheiro>` ou `npm run test:edge`).
- [ ] **Step 2:** Correção mínima no estilo vizinho.
- [ ] **Step 3:** Teste → PASS; `npm run typecheck` 0 erros; `npm run check:edge` se tocou Edge.
- [ ] **Step 4: Commit** por lote.

### Task 5: Ambiente local de carga + seed

**Files:**
- Create: `scripts/carga/env.mjs` — lê `npx supabase status -o json` e exporta `{ API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL }`; aborta se `API_URL` não for `127.0.0.1`/`localhost` (guarda anti-produção).
- Create: `scripts/carga/seed.mjs` — `node scripts/carga/seed.mjs [--escala=1]`: cria por service role (Admin API do Auth local) 1 utilizador por papel `carga-<papel>@local.test` + 500 utilizadores `carga-u<n>@local.test` (papéis distribuídos: 60% leitura/motorista, 20% armazem, 10% medicoes, 5% mecanico, 5% gestor); 15 obras, 300 colaboradores, 2 000 produtos, 50 000 movimentos via `registar_movimento_armazem`/inserção em lote pelo papel de serviço respeitando as RPCs, 40 viaturas, 200 ferramentas. Idempotente (apaga só linhas com marcador `carga-`). Senha comum lida de `CARGA_SENHA` (default gerado e impresso, nunca commitado).
- Create: `scripts/carga/README.md` — como correr (5 linhas).

- [ ] **Step 1:** `npx supabase start` (já em curso) → `npx supabase status` mostra API em `127.0.0.1:55321`.
- [ ] **Step 2:** `npx supabase db reset` (aplica todas as migrations, incl. as novas) → sem erros.
- [ ] **Step 3:** Implementar `env.mjs` e `seed.mjs`; correr `node scripts/carga/seed.mjs` → imprime contagens esperadas; correr 2× → mesmas contagens.
- [ ] **Step 4: Commit** `test(carga): ambiente local e seed sintético`

### Task 6: Testes de concorrência (integridade)

**Files:**
- Create: `scripts/carga/concorrencia.mjs` — cada cenário imprime `OK|FALHA <nome> <detalhe>` e o processo sai com código ≠ 0 se algum falhar.

Cenários (contra o Supabase local, utilizadores reais do seed, chamadas paralelas com `Promise.all`):
1. `saidas-mesmo-artigo`: stock 100, 200 saídas simultâneas de 1 → exatamente 100 sucessos, stock final 0, nunca negativo, 100 linhas em `movimentos_stock`.
2. `entradas-saidas-mistas`: 300 operações aleatórias → `stock_atual` = soma derivada de `movimentos_stock`.
3. `autos-numeracao`: 50 `criar_auto_rpc` simultâneos na mesma subempreitada → números únicos e consecutivos.
4. `codigos-sequencia`: 100 produtos criados em paralelo → códigos únicos.
5. `aprovacao-dupla-abastecimento`: 20 aprovações simultâneas do mesmo pedido → 1 transição de estado.
6. `emprestimo-duplo-ferramenta`: 20 empréstimos simultâneos da mesma ferramenta → 1 sucesso.
7. `picagem-duplicada`: 20 picagens simultâneas do mesmo colaborador no mesmo minuto → comportamento coerente com a regra existente (documentar).

(Nomes exatos das RPCs/tabelas: confirmar com `grep -rn "CREATE OR REPLACE FUNCTION" supabase/migrations`.)

- [ ] **Step 1:** Implementar e correr `node scripts/carga/concorrencia.mjs` → todos `OK`.
- [ ] **Step 2:** Qualquer `FALHA` = bug: volta à Task 3 (teste PGlite que reproduz + migration) antes de seguir.
- [ ] **Step 3: Commit** `test(carga): cenários de concorrência`

### Task 7: Testes de carga leve/médio/pesado

**Files:**
- Create: `scripts/carga/runner.mjs` — `node scripts/carga/runner.mjs --perfil=leve|medio|pesado|rutura --duracao=60`. VU = utilizador do seed autenticado com o seu próprio cliente; laço com pausa aleatória 1–3 s ("think time"). Mede por operação: n, erros, p50/p95/p99, req/s. Grava JSON em `scripts/carga/resultados/<perfil>-<timestamp>.json` (pasta no `.gitignore`) e imprime tabela.
- Create: `scripts/carga/cenarios.mjs` — mix de operações usando as **mesmas queries dos services** (importar a constante `SELECT` não é possível em Node sem build; replicar e citar o service de origem em comentário):
  - leitura: dashboard/lista de artigos paginada, lista de movimentos 30 dias, ficha de obra, lista de colaboradores (sem NIF), `produtos_em_alerta`, `custos_materiais_por_obra`.
  - escrita: saída/entrada de stock, picagem, pedido de abastecimento, relatório diário de obra.
  - pesado (fecho de mês): relatórios/exports de movimentos de 1 ano, `custos_consolidados_por_obra`, autos.
- Perfis: `leve` 10 VUs 70/30 leitura/escrita; `medio` 50 VUs com rampa de 30 s (pico de picagens); `pesado` 200 VUs com 30% fecho de mês; `rutura` rampa 50→500 em degraus de 50 até erro > 1% ou p95 > 3 s.
- Critérios de aprovação (local): leve/médio p95 < 800 ms e 0 erros; pesado p95 < 2 s e erros < 0,5%; integridade pós-carga = cenário 2 da Task 6 verde.

- [ ] **Step 1:** Implementar; correr `leve` → tabela + JSON.
- [ ] **Step 2:** Correr `medio`, `pesado`, `rutura`; após cada um, `node scripts/carga/concorrencia.mjs --so=entradas-saidas-mistas` (integridade).
- [ ] **Step 3:** Gargalos: para as 3 operações com pior p95, `EXPLAIN (ANALYZE, BUFFERS)` via `psql`/`DB_URL` e `pg_stat_statements`. Índice/consulta em falta → migration na Task 3 (com teste que verifica o índice/plano quando aplicável) e repetir o perfil afetado (antes/depois no relatório).
- [ ] **Step 4: Commit** `test(carga): runner e perfis de carga`

### Task 8: Validação do frontend com agent-browser

- [ ] **Step 1:** Arrancar Vite contra o local: `VITE_SUPABASE_URL=http://127.0.0.1:55321 VITE_SUPABASE_PUBLISHABLE_KEY=<anon local> npx vite --port 5174` (porta distinta para não confundir com um dev ligado à produção). Confirmar no browser que o pedido de rede vai para `127.0.0.1`.
- [ ] **Step 2:** Com `agent-browser`, por papel (admin, gestor, armazem, medicoes, mecanico, motorista, leitura do seed): login, menu visível conforme papel, abrir cada rota do módulo, sem erros na consola. Fluxos: saída de stock; empréstimo/devolução de ferramenta; pedido + aprovação de abastecimento; criar relatório diário de obra; criar auto; picagem; exportação Excel; tentar rota proibida → redirecionado.
- [ ] **Step 3:** Repetir os fluxos que tocam código corrigido nas Tasks 3/4. Todo erro encontrado → Task 4 (teste + correção).
- [ ] **Step 4:** Smoke público em `https://app.encivilconstroi.com/login` (só abrir e ver consola; sem login, sem escrita).
- [ ] **Step 5:** Guardar capturas relevantes no scratchpad; notas no relatório.

### Task 9: Verificação final, revisão do branch e relatório

**Files:**
- Create: `docs/auditorias/2026-10-28-checkup-geral.md` — sumário executivo; achados por severidade (corrigido/registado, com commit); resultados de carga (tabelas por perfil, ponto de rutura, gargalos antes/depois, ressalva de que é local); riscos remanescentes; **passos manuais**: migrations a aplicar no SQL Editor por ordem, depois merge para `main`, depois Edge Functions (se alteradas).
- Modify: `docs/plano-seguranca-desempenho.md` — secção curta "Checkup 2026-10-28" com ligação ao relatório.

- [ ] **Step 1:** `npm run typecheck` (0), `npm test` (tudo verde), `npm run build`, `npm run lint`, `npm run check:edge && npm run test:edge` — colar contagens no relatório.
- [ ] **Step 2:** Revisão do branch inteiro por um revisor novo (`superpowers:requesting-code-review`); tratar achados com `superpowers:receiving-code-review`.
- [ ] **Step 3:** Escrever o relatório.
- [ ] **Step 4: Commit** `docs(checkup): relatório final`
- [ ] **Step 5:** `npx supabase stop --workdir <scratchpad>/carga-stack` e parar o Vite.
