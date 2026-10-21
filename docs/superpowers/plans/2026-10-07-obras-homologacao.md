# Obras — plano de fechamento de produção

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Fechar falhas da integração e homologar os fluxos de engenharia com Auth, RLS e Storage reais em ambiente local.
**Architecture:** Preservar React/hooks/serviços e assinaturas RPC. Corrigir proteção de identidade no Auth, proteção de edição no relatório e serialização das linhas com o auto pai. Validar APIs locais reais e frontend local/Cloudflare sem escrita em produção.
**Tech Stack:** React 18, TypeScript strict, Supabase/PostgreSQL 17, Vitest/PGlite, agent-browser, Docker.
**Spec:** `docs/superpowers/specs/2026-10-07-obras-homologacao-design.md`.

## Global Constraints

- Migrations já aplicadas são imutáveis.
- Produção não recebe registros fictícios nem alteração de papel para testes.
- Não elimina dados, não remove RLS, não concede novo bypass.
- Não gravar tokens/senhas de produção em arquivos/logs.
- Datas Europe/Lisbon; mensagens pt-PT.
- Sem commit/push/deploy nesta rodada sem pedido específico; preservar trabalho anterior.
- Subagentes não delegam nem alteram arquivos de outra tarefa. Baseline: 5ba4e4d. Workspace isolado em TEMP; mudanças serão copiadas ao checkout principal após revisão.

## Review Focus

1. Perfil de usuário A chega depois de B/logout: jamais substituir identidade atual (T1).
2. Logout offline com resposta em voo: cache nunca volta a conter dados anteriores (T1).
3. Relatório reaberto/editado depois de submissão: saída continua protegida (T1).
4. Linha editada/excluída/inserida durante submissão: total e estado permanecem consistentes, sem deadlock por troca de pai (T2).
5. Storage recusa remoção/upsert/move de foto vinculada: bytes e registro sobrevivem (T3).

### Task 1: Autenticação integrada e saída do relatório

**Files:** `src/features/auth/AuthContext.tsx`, `src/features/auth/lib/limparDadosLocais.ts`, eventualmente `src/app/lib/useAsync.ts`; `src/features/obras/components/RelatorioDiarioPage.tsx`; `src/integrations/supabase/client.ts` e helper de configuração; testes em `src/__tests__/features/auth/`, `src/__tests__/features/obras/` e `src/__tests__/lib/`.
**Interfaces:** contratos públicos de Auth/useAsync/relatório permanecem. Limpeza de dados locais usa a invalidação robusta já existente `clearAsyncCache(): void`. Resposta de perfil só publica dados da sessão/version atual. Navegação interna só dispensa a transição pretendida.
- [x] Reproduzir com testes diferidos: perfil A→B, logout, resposta tardia; limpeza offline; submeter/reabrir/editar/navegar.
- [x] Executar os testes antes e confirmar falha real.
- [x] Corrigir as três guardas mínimas; não reescrever Auth nem adicionar fetch manual ao módulo Obras.
- [x] Executar testes de Auth/cache/relatório; relatar RED/GREEN e diff exato para revisão independente.
- [x] RED/GREEN de seleção de URL/chave como par: hosted válido permitido; localhost/127.0.0.1 permitido só em DEV; host HTTP arbitrário negado; configuração parcial nunca mistura origem e chave. Confirmar origem local efetiva no navegador antes de qualquer escrita de teste.

### Task 2: Consistência de linhas do auto e MFA de autores

**Files:** nova `supabase/migrations/20261008100000_obras_concorrencia_mfa.sql`; novo `supabase/tests/obras-linhas-concorrencia.test.mjs`; novo `supabase/tests/obras-mfa-autores.test.mjs`; reprodutor local real em `supabase/scripts/validar-obras-concorrencia.mjs` se necessário.
**Interfaces:** `_trg_auto_linha_imutavel() RETURNS trigger` e RPCs de auto mantêm assinatura e erros de workflow. Lock pai precede leitura de workflow; ordenar IDs quando UPDATE muda auto_id; não permitir operação direta adicional nem enfraquecer regras de cascata/imutabilidade.
- [x] Teste de guarda e reprodução real duas sessões: submissão→UPDATE/DELETE/INSERT, linhas→submissão, mudança de pai e reaplicação da migration.
- [x] Confirmar RED, implementar somente migration nova transacional/idempotente com grants/revokes apropriados e rollback comentado.
- [x] Confirmar GREEN e repetir suites `subs-controlo-a/b`, `obras-producao`, `seguranca-guardas`; provar total final e ausência de escrita tardia.
- [x] RED/GREEN de admin/gestor designado com exigência MFA ativada/desativada em aal1/aal2, e leitura real designada. Redefinir `pode_relatar_obra(uuid) RETURNS boolean` com negação explícita de `mfa_em_falta()`, preservando assinatura e leitura. Guardar testes em banco que aplique todas as migrations atuais, não apenas fixture histórica.
- [x] Relatar lock ordering, compatibilidade, dados preservados e resultados para revisão independente.

### Task 3: Homologação real local por papel e arquivo

**Files:** criar `supabase/scripts/validar-obras-local.mjs` (provisionamento e validação somente localhost); artefatos de evidência em relatório. Não alterar scripts existentes de seed nem contratos SQL.
**Interfaces:** CLI aceita apenas API_URL localhost, lê chaves locais por ambiente/status do Supabase, provisiona engenharia1/engenharia2 com `medicoes`, autor designado `leitura` e papel negado `motorista`. Nunca imprime credenciais. Fornece fixture local de obra/fase e acesso ao navegador por arquivo TEMP excluído do git.
- [x] Guardar rejeição explícita de URL não local; validar fixture sem tocar produção.
- [x] Como usuários reais: abrir obra, registrar aferição com upload, consultar como segundo engenheiro, criar rascunho/submeter relatório e negar edição de submetido.
- [x] Testar caminhos não existentes, DELETE/upsert/move de foto vinculada pela API Storage, validar bytes originais após erro; papéis permitidos/negados via PostgREST e autor designado.
- [x] Root percorre formulário de aferição e relatório no agent-browser local, erro offline/retry e reentrada, viewport móvel; Cloudflare somente leitura com a conta fornecida.
- [x] Relatar status/contagens/evidências redigidas e excluir qualquer dado de produção dos artefatos.

### Task 4: Gates, dependências e entrega

**Files:** `package.json`, `package-lock.json`, `eslint.config.mjs` se necessário; relatório `docs/auditorias/2026-10-08-obras-homologacao.md`; atualizar `docs/19-obras.md`.
**Interfaces:** script `npm run lint` com regras ESLint/TypeScript reais para código fonte, sem disables para esconder falhas. Atualização compatível de React Router se aviso continuar; não executar audit fix force.
- [x] Conferir alerta do lockfile e corrigir dependência em versão patch compatível, se presente.
- [x] Introduzir lint efetivo sem confundir typecheck com lint; separar problemas existentes e corrigir somente o necessário, sem enfraquecer gates.
- [x] Executar typecheck, lint, suite completa, build, check:edge, test:edge, migrations/contratos/RLS e auditoria de dependências; verificar saída e zero falhas.
- [x] Revisão independente de cada tarefa e do conjunto; corrigir findings importantes com regressão e repetir checks afetados.
- [x] Revisar diff/escopo, copiar só arquivos desta rodada ao checkout principal preservando docs anteriores, repetir checks finais da árvore entregue.
- [x] Registrar resultado atual do Cloudflare e banco local, publicação/migration ainda necessárias se existirem, sem extrapolar evidência.

## Dependências, riscos, rollback e validação final

T1 e T2 são independentes: arquivos e contratos distintos. T3 só cria um script/fixtures locais; não altera frontend/SQL. T4 altera tooling/deps apenas depois das implementações; testes finais e navegador da árvore final são sequenciais. Tarefas não compartilham migrations nem arquivos.

Riscos: novas guardas podem revelar fixtures com arquivos inventados; não mudar assertions para ocultar isso. MFA real deve seguir política local equivalente, sem desativação para passar. Edição de rascunho entre autores deve respeitar propriedade; não inventar colaboração simultânea não contratada. Rollback de código limitado ao diff desta rodada; banco com dados preservados, sem apagar movimentos/evidências. Observabilidade conserva Sentry/auditoria e relata status sem tokens.

Aceite final: obra abre, engenharia aferições e relatórios completos, fotos vinculadas preservadas, autor designado permitido e papel negado recusado, relatório submetido imutável, cache/perfil isolados, linhas e total consistentes sob concorrência, gates aprovados e riscos de rollout explícitos. Plano revisado pelo controller e execução autorizada automaticamente conforme pedido do usuário; não solicitar aprovação novamente.
