# ENCIVIL Gestão — Guia para IA

ERP interno da ENCIVIL (construção civil), **em produção**, multiutilizador, usado todos os dias pelas equipas de obra.
Lê isto inteiro antes de tocar em código. **Não inventes**: se um ficheiro, função, RPC, tabela ou coluna não está
confirmado aqui ou no código, abre o repositório e verifica (`Grep`/`Glob`) antes de o usares ou citares.

## Ordem de precedência e arranque
- Prioridade: instrução explícita do utilizador › este ficheiro › skills de `.agents/skills/` › docs em `docs/`.
- **Superpowers é obrigatório**: antes de uma tarefa ler `.agents/skills/using-superpowers/SKILL.md` e aplicar as skills
   relevantes (brainstorming, writing-plans, TDD, verification-before-completion…). Detalhes: `docs/superpowers.md`.
- Antes de alterar um módulo ler a doc dele (tabela "Módulos"). Para stock/movimentos: `docs/00-source-of-truth.md` e
  `docs/02-regras-de-negocio.md`. `AGENTS.md` (para agents que não leem este ficheiro) duplica parte disto: em conflito este
  vence — sinaliza a divergência. Doc ausente ou a contradizer o código: o código manda; diz o que encontraste.
- Responde ao utilizador em **português do Brasil**. Texto de UI, mensagens de erro e commits: **português de Portugal**
   (o produto é pt-PT; datas em `Europe/Lisbon`). Identificadores de código: mistura PT/EN já existente — segue a vizinhança.

## Stack
React 18 + Vite + TypeScript **strict** (`noUnusedLocals/Parameters`), Tailwind CSS v4 (plugin Vite), shadcn/ui + Radix
(`src/app/components/ui`), React Router v7, Recharts, Leaflet, Sonner. Backend: **Supabase** (Postgres, Auth, Storage, RLS,
Edge Functions em Deno). PWA com Workbox (`injectManifest`, SW em `src/sw.ts`), Web Push, Sentry. Alias `@/` → `src/`.
Deploy: **Cloudflare Pages** (remote `origin`, org GitHub `Encivil-Constroi`), `main` → deploy automático.
URL: https://app.encivilconstroi.com (e https://encivil-gestao.pages.dev). Remote `antigo-vercel`: legado, **nunca** dar push.

## Estrutura
```
src/app/            App.tsx, routes.tsx (lazy() por rota, ADR-010), types.ts, layouts/MainLayout.tsx
  pages/            ecrãs transversais (Dashboard, Reports, Settings, Auditoria, Backup…) e pages/armazem/*
  components/       UI partilhada (Sidebar, Header, StatCard, FotoInput…) e components/ui/ (shadcn)
  lib/              useAsync, useMutation, stockUtils, format, exportCsv/Json/Xlsx, rpcSemTipos, sentry, push…
src/features/<m>/   um módulo por domínio, tipicamente components/ hooks/ services/ lib/ (+ db.ts, index.ts)
src/integrations/supabase/  client.ts + types.ts (GERADO, não editar à mão)
src/__tests__/      Vitest (features/<m>/, lib/)      src/sw.ts   service worker
supabase/migrations/  SQL (≈70)    supabase/functions/  Edge Functions    supabase/tests/  testes de BD (PGlite)
docs/               specs, ADRs, planos, docs por módulo      public/_headers  CSP (Cloudflare)
```
Módulos em `src/features`: alertas, auth, autos, backup, colaboradores, combustivel, configuracoes, contabilidade,
custos, dashboard, epis, faturas, ferramentas, frota, horarios, livro-obra, movimentos, notificacoes, obras, picagens,
produtos, search, subempreiteiros, theme. **Não criar novas dependências entre módulos**: um módulo importa só de `auth`,
`@/app/lib`, `@/integrations`, `@/app/components`. Quem junta vários módulos (ex.: `armazem` = produtos+movimentos+ferramentas)
é `src/app/pages`. Exceções históricas: `obras` é o núcleo de que dependem subempreiteiros, autos, faturas, picagens,
livro-obra, custos, contabilidade, dashboard; `colaboradores`↔`horarios`/`picagens`/`epis`. Não as espalhes. As telas de
subempreitadas/autos estão em `features/obras`, mas `features/subempreiteiros|autos` e `obras/legacy/` **continuam ativos**
(serviços/hooks usados por obras, dashboard, custos) — não os apagues sem ver quem os usa.

## Módulos (rota → onde ler)
| Módulo | Rota | Doc |
|---|---|---|
| Armazém (artigos, stock, movimentos, ferramentas, inventário) | `/armazem` | `docs/17-armazem.md`, `docs/specs/SPEC-*.md` |
| Obras (painel, ficha, relatórios diários, subempreitadas, autos) | `/obras` | `docs/19-obras.md`, `docs/superpowers/specs/` |
| Frota (viaturas/máquinas, entregas, manutenção, revisão) | `/frota` | `docs/18-frota.md` |
| Abastecimento (pedidos, histórico, bomba Polo 2) | `/abastecimento` | `docs/15-abastecimento-v2.md`, `docs/16-jev-gateway.md` |
| RH: colaboradores, picagens, EPIs, formações, segurança, alertas | `/colaboradores`, `/rh`, `/picagens`, `/epis`, `/alertas` | `docs/12-plano-v3.md` |
| Faturas, contabilidade, backup, auditoria, utilizadores, definições | `/faturas`, `/exportacao-contabilidade`, `/backup`, `/auditoria`, `/gestao-utilizadores`, `/configuracoes` | `docs/12-plano-v3.md` |
Contas, segredos, titularidade: `docs/13-infraestrutura-e-contas.md`. Segurança/desempenho em curso:
`docs/plano-seguranca-desempenho.md`. Decisões: `docs/adrs/ADR-001..010`. Planos feitos: `docs/plans/`. Specs: `docs/specs/`
(armazém original) e `docs/superpowers/specs/` (desenhos recentes, ex.: obras) — em conflito vale a mais recente.

## Papéis (RBAC) — a RLS é a segurança real, a UI é só conforto
Enum `role_utilizador`, 7 papéis: `admin` (tudo, eliminar, validar), `gestor` (gestão/aprovação), `armazem`, `medicoes`,
`mecanico` (só Frota), `motorista` (só pede abastecimentos; aprovar é de `comb_aprovadores`), `leitura` (só consulta).
- Escrita por módulo: função SQL `public.pode_escrever(modulo)` (criada em `20260702000004_rbac_permissoes.sql`; a definição
  vigente é a da migration mais recente que a redefine — hoje `20260929030000_fase9_frota.sql`; confirma com
  `grep -rn "FUNCTION public.pode_escrever" supabase/migrations`). Módulos válidos: `armazem`, `ferramentas`, `combustivel`,
  `obras`, `subempreitadas`, `frota` (outro valor devolve `false`). Hoje: armazem/ferramentas/combustivel → admin, gestor, armazem ·
  obras → admin, gestor · subempreitadas → admin, gestor, medicoes · frota → admin, gestor, mecanico. **`colaboradores` não passa
  por `pode_escrever`**: tem policy RLS própria (`auth_role() IN ('admin','gestor')`). Espelho na UI: `src/features/auth/useRole.ts`
  (`MATRIZ_ESCRITA`) — tem de coincidir com o SQL; um módulo novo exige migration (`CREATE OR REPLACE FUNCTION`) **e** entrada
  em `Modulo`/`MATRIZ_ESCRITA`.
- Guardas de rota: `AuthGuard`, `RoleGuard require="gestor|admin"`. Esconder um botão **não** protege nada: toda a
  funcionalidade sensível precisa de policy RLS ou RPC com `public.pode_escrever()` / `public.auth_role()`.
- Papel de utilizador: nunca `UPDATE profiles SET role` (bloqueado por GRANT de coluna, ADR-007); usar a RPC `promover_role()`.
- Auto-logout por inatividade aos 30 min. Sem MFA (indisponível no plano Supabase atual).

## Regras de negócio imutáveis (stock)
- `produtos.stock_atual` **nunca** se edita diretamente; só por movimentos via RPC `registar_movimento` (atómica, com
  advisory lock e audit log). `registar_movimento_armazem` é a porta do armazém (tipo detalhado, fornecedor, fatura, cliente).
- `movimentos_stock`: **nunca DELETE nem UPDATE**. Corrigir = novo movimento de ajuste com observação.
- Entrada soma, saída subtrai (bloqueada se o stock ficar negativo), ajuste fixa o valor; quantidade > 0; destino/obra
  obrigatório em saídas; responsável obrigatório. Relatórios calculam-se a partir de `movimentos_stock`, não de `stock_atual`.
- Produto desativado some das seleções mas mantém o histórico. Stock/estado: `calcStatus(atual, minimo)` em `stockUtils.ts`.
- Outras RPCs a **reutilizar, não duplicar**: `armazem_materiais_por_obra`, `custos_materiais_por_obra`,
  `produtos_em_alerta`, `criar_auto_rpc` (numeração de autos sem race), `promover_role`. Lista completa: `grep -rn "CREATE OR REPLACE FUNCTION" supabase/migrations`.

## Padrões obrigatórios de código
**Dados remotos: sempre `useAsync` / `useMutation`** (`src/app/lib`). Nunca `useEffect`+`useState` manual para fetch.
```ts
const { data: foo, loading, error, reload } = useAsync(() => fetchFoo(id!), [id], { enabled: !!id, errorMsg: 'Foo não encontrado' })
const { mutate: salvar, loading } = useMutation(salvarFoo, 'Erro ao guardar', { invalidates: ['foos-*'] })
// void mutation: async (id): Promise<true> => { await eliminarFoo(id); return true }  e  (await mutate(id)) === true
```
`cacheKey`/`invalidates` partilham chaves; terminadas em `*` invalidam por prefixo (`invalidateCache`).
- **Services**: constante `SELECT` no topo do ficheiro (`'*, tabela_b(col1)'`); em INSERT/UPDATE encadear `.select(SELECT).single()`
  para devolver a linha num só round-trip. **Sem N+1** (nunca buscar depois de criar; agregações no servidor via RPC/view).
- **Filtros Supabase inline** (`if (f.estado) query = query.eq('estado', f.estado)`). Nunca helper genérico de filtros nem `as any`.
- Regra de negócio em `services/`, `lib/` ou funções puras — **não** dentro de componentes visuais. SQL nunca inline em componentes.
- RPC/tabela ainda sem tipos gerados: declarar o esquema em `db.ts` do módulo (ver `features/frota/db.ts`, `features/obras/db.ts`)
  ou usar `rpcSemTipos` (`src/app/lib`). Depois de regenerar os tipos, remover o remendo.
- Rotas novas: `lazy(() => import(...))` em `routes.tsx` dentro de `<L>`; redirects de rotas antigas com `Redirecionar`.
- Erros mostrados ao utilizador: mensagem em pt-PT (`parseSupabaseError`). Exportações: `exportCsv/Json/Xlsx`.
- Comentários só para o **porquê** não óbvio, nunca o quê. Alterações pequenas, uma funcionalidade de cada vez, código no estilo vizinho.
- Offline: fila em `src/features/movimentos/offlineQueue.ts` + `hooks/useOfflineQueue.ts`; fotos reduzidas por `reduzirFoto`.

## Supabase — regras críticas
- Migrations: `supabase/migrations/YYYYMMDDHHMMSS_nome.sql`, cronologia estritamente crescente (a última é a de maior timestamp).
  **"Automatically expose new tables" está OFF**: toda tabela/view/sequência/função nova leva `GRANT` explícito
  (`GRANT SELECT, INSERT, UPDATE ON TABLE … TO authenticated; GRANT EXECUTE ON FUNCTION … TO authenticated;`) **e** `ENABLE ROW LEVEL SECURITY` + policies.
- Policies: usar `public.auth_role()` / `public.pode_escrever('modulo')`; **nunca** `auth.jwt()->>'role'`. Funções `SECURITY DEFINER`
  levam sempre `SET search_path = public`. Funções só de leitura: `STABLE`.
- **Migrations não são aplicadas por ti em produção**: o utilizador aplica-as à mão no SQL Editor do Dashboard (docs/09-implantacao.md).
  Entrega o ficheiro, diz a ordem e o que testar. Depois: `npx supabase gen types typescript --local > src/integrations/supabase/types.ts`
  e `npm run typecheck`. `types.ts` é gerado — nunca editar à mão.
- **`npm run dev` liga à BD de PRODUÇÃO** (`.env.local` e o fallback de `client.ts` apontam para o projeto real): dados e
  utilizadores reais. Não cries, alteres nem apagues registos para "testar"; só leitura, ou pede uma conta/ambiente de teste.
- Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_*`), `VITE_SENTRY_DSN` (ver `.env.example`; `.env*` não se commita).
  `client.ts` tem credenciais públicas de produção como fallback. `sb_secret_*` e a chave secreta de serviço do Supabase: **nunca** no frontend nem em `VITE_`
  (o pre-commit bloqueia). Edge Functions leem segredos com `Deno.env.get()`.
- Edge Functions (`supabase/functions/`): admin-utilizadores, enviar-resumo-alertas, extrair-fatura, ler-foto-abastecimento,
  notificar-abastecimento, pump-status, send-push-frota.

## Comandos
```sh
npm run dev           # Vite HMR (porta por defeito 5173)
npm run typecheck     # tsc --noEmit — tem de dar 0 erros
npm test              # Vitest: src/__tests__ (jsdom) + supabase/tests/*.test.mjs (Postgres real em memória, PGlite)
npm run build         # bundle de produção
npm run check:edge && npm run test:edge   # Edge Functions (Deno via npx)
npx vitest run src/__tests__/features/frota        # um subconjunto de UI/serviços
npx vitest run supabase/tests/frota.test.mjs       # um ficheiro de BD (~4 s; copia o mais parecido para um novo)
```
Testes de BD: `supabase/tests/pg-harness.mjs` aplica **todas** as migrations por ordem sobre stubs de `auth`/`storage`; um
novo módulo SQL traz o seu `*.test.mjs` (papéis, validações, imutabilidade, RLS); um erro SQL numa migration nova parte a
suite toda. CI (`.github/workflows/ci.yml`, Node 24; o build usa variáveis fictícias, nada corre contra o Supabase real):
jobs typecheck → build, e testes + edge em paralelo. Hooks git (`core.hooksPath=.githooks`): pre-commit = scan de secrets + typecheck;
pre-push = `npm run build`. Nunca `--no-verify`.

## Verificar antes de dizer "feito"
Evidência antes de afirmações (skill `verification-before-completion`): `npm run typecheck` (0 erros), `npm test`, `npm run build`
**e**, se houve mudança de UI, abrir a app e percorrer o fluxo alterado. Ferramenta: CLI global `agent-browser`
(`agent-browser --help`) sobre `npm run dev` (`http://localhost:5173`) ou o URL Cloudflare. Login: o utilizador fornece as
credenciais por papel — nunca as inventes nem as gravas em ficheiros/commits; sem credenciais, valida só o que é público
(`/login`, arranque, consola sem erros). Mudança de regra/RLS ⇒ teste de BD que falhe sem a correção. Nada fecha com
testes por correr, mutações por validar ou CI vermelho. Reporta com honestidade o que falhou ou ficou por fazer.

## NUNCA fazer
1. `as any`, helpers genéricos de filtros Supabase, ou contornar tipos.  2. N+1 / buscar a linha depois de a criar.
3. Migration sem GRANT/RLS.  4. Editar `types.ts` gerado, `stock_atual` ou `movimentos_stock` à mão.
5. `sb_secret_*` ou a chave de serviço no frontend; commitar `.env*`.  6. Confiar só na UI para restringir acesso.
7. Criar novas importações entre módulos de `features/`.  8. Push para `antigo-vercel`; push forçado para `main`.
9. Inventar funcionalidades, ecrãs ou fases fora do pedido (ERP faseado em `docs/12-plano-v3.md`; faturação/ecommerce/pagamentos excluídos).
10. Apagar ficheiros, dados, branches ou worktrees sem ver o alvo. **Worktrees**: nunca remover um worktree que tenha *junction*
    de `node_modules` (apaga o `node_modules` real).  11. Aplicar migrations ou alterar dados em produção.

## Ambiente de trabalho (Windows 11)
Shells: PowerShell e Git Bash — sintaxe diferente em cada um. Escreve scripts longos em ficheiros (heredocs com crases/`$$`
partem na shell). Commit/push só quando o utilizador pedir; `main` é a branch principal e faz deploy. Mensagens de commit no
formato `tipo(âmbito): descrição` (ex.: `feat(frota): …`, `fix(obras): …`). Decide e avança sem pedir confirmações triviais;
confirma antes de ações irreversíveis ou que publiquem algo para fora.

## Como responder ao utilizador (regra fixa)
Direto ao ponto, sem enrolação. Frases curtas. Problema numa linha; solução em passos numerados. Termo técnico só com
uma frase a explicá-lo logo a seguir. Faltou informação para executar? **Pergunta ANTES de fazer** (uma pergunta, objetiva).

## Ao terminar uma tarefa, reporta
Ficheiros alterados · comportamento alterado · testes/comandos corridos com o resultado · riscos conhecidos · passos manuais
para o utilizador (ex.: migration a aplicar no SQL Editor, por esta ordem).
