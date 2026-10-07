# Segurança 2026 — Desenho

> Data: 2026-10-06 · Estado: implementado no repositório (2026-10-07), por publicar em produção
> Alinhado em 2026-10-07 com o que foi realmente construído; ver "Alterações face ao desenho inicial" no fim.
> Continua `docs/plano-seguranca-desempenho.md` (etapa 1, concluída em 2026-09-29).

## 1. Objetivo e critérios de sucesso

Elevar o ENCIVIL Gestão (ERP em produção + PWA) a um nível de proteção adequado a 2026,
cobrindo os 20 pontos pedidos pelo utilizador e os riscos atuais que eles não cobriam.

Sucesso =
- Cada um dos 20 pontos tem uma medida implementada **ou** uma decisão documentada (com motivo).
- Nenhuma fase retira acesso legítimo a quem o tem hoje; o sistema nunca fica partido entre fases.
- Tudo verificado: typecheck 0 erros, `npm test`, `npm run build`, testes Deno, testes de BD com
  mutações, fluxos de UI percorridos com o `agent-browser` sobre **Supabase local** (Docker,
  utilizadores fictícios). Em produção só validação pública/leitura.
- Entregue checklist manual ordenado do que só o utilizador pode fazer (migrations, Dashboard, secrets).

### Decisões do utilizador
| Pergunta | Decisão |
|---|---|
| Item 18 "PMP" | Escrito por engano → substituído por **gestão de patches** (menor privilégio já está no item 10) |
| Plano Supabase | **Free** (Pro pedido em breve) → tudo tem de funcionar no Free; extras do Pro ficam documentados |
| MFA | **Obrigatório para `admin` e `gestor`**; opcional para os restantes papéis |
| Backup | **GitHub Actions** noturno, cifrado, com secret da ligação à BD no GitHub |
| Testes de UI com login | **Só Supabase local**; nada de contas de produção |

### Restrições (CLAUDE.md)
- Migrations não são aplicadas por nós em produção; configurações do Dashboard Supabase/Cloudflare e
  secrets do GitHub são passos manuais do utilizador.
- `npm run dev` liga à produção → os testes com login correm com `.env` a apontar para o Supabase local.
- Sem novas dependências entre módulos de `features/`. Sem `as any`. GRANT + RLS em tudo o que é novo.

## 2. Mapa dos 20 pontos

| # | Ponto | Estado em 2026-10-06 | Medida | Fase |
|---|---|---|---|---|
| 1 | HTTPS | Cloudflare força HTTPS; **HSTS desapareceu** do `_headers` | HSTS 2 anos + includeSubDomains + preload | 1 |
| 2 | Senhas com hash | bcrypt do Supabase Auth; mínimo **6** caracteres | Mínimo 12 + maiúscula/minúscula/dígito (UI + Auth); reautenticação para mudar senha | 2 |
| 3 | MFA | Desligado (doc dizia "só Pro" — errado: TOTP é grátis) | TOTP obrigatório admin/gestor, imposto no servidor via `auth_role()`; todas as verificações diretas de papel convertidas para `auth_role()` | 2 |
| 4 | Rate limit | Só o do Auth | Limitador genérico na BD usado pelas Edge Functions (e pelas RPCs de eventos de segurança) | 2 |
| 5 | Validação de inputs | Validação ad hoc | Validação de esquema em todas as Edge Functions; política de senha na UI | 3 |
| 6 | Sanitização | 1 `dangerouslySetInnerHTML` com regex (`HelpPage`) | Remover; proteção contra injeção de fórmulas em CSV/Excel | 3 |
| 7 | SQL injection | Queries parametrizadas | Teste que falha se surgir `EXECUTE` com concatenação sem `format(%I/%L)` em migrations novas | 4 |
| 8 | Migrations | Aplicadas à mão; produção divergiu | Script de deteção de divergência; checklist por migration | 6 |
| 9 | Rollback | Inexistente | Bloco `-- ROLLBACK` obrigatório em migrations novas; runbook de rollback do site e BD | 6 |
| 10 | Controle de acesso | RLS + `pode_escrever` | Testes-guarda (RLS, anon, search_path, sem verificação de papel fora de `auth_role()`); espelho `MATRIZ_ESCRITA`×SQL; NIF só admin/gestor/próprio (RPC `colaborador_nif`); INSERT direto em `movimentos_stock` revogado | 3, 4 |
| 11 | Expiração de sessão | Inatividade 30 min só no browser | Mantém; limpeza de dados locais no logout; timebox de sessão documentado para o Pro | 1, 7 |
| 12 | Secrets | Pre-commit | gitleaks no CI (histórico completo); inventário em doc 13 | 5 |
| 13 | CORS | Edge Functions com `*` | Lista de origens permitidas | 3 |
| 14 | Logs | `audit_log` cobre pouco | Auditoria genérica imutável em tabelas sensíveis; eventos de segurança | 4, 7 |
| 15 | Backups | **Nunca feito** | `pg_dump` noturno cifrado (age) + teste de restauro semanal | 6 |
| 16 | Criptografia | Trânsito (TLS) e repouso (Supabase) | Backups cifrados; HSTS; dados pessoais restritos por RLS (sem cifra de coluna — ver §4.3) | 1, 3, 6 |
| 17 | Dependências | `react-router` (alta, corrigível), `xlsx` (alta, sem correção no npm) | `react-router` 7.18.4; SheetJS 0.20.3 oficial (cdn.sheetjs.com); `npm audit` (high, produção) no CI | 5 |
| 18 | Gestão de patches | Ad hoc | Dependabot semanal (npm + actions); rotina mensal documentada | 5 |
| 19 | Monitoramento | Sentry só para erros | Painel "Eventos de segurança" (relatórios CSP no Sentry não foram implementados: `_headers` é estático e não há `report-uri`) | 1, 7 |
| 20 | Plano de recuperação | Inexistente | Plano de recuperação (RPO 24 h / RTO 4 h) + resposta a incidentes | 7 |

### Acrescentados (riscos 2026 não cobertos pela lista)
- CSP sem `unsafe-eval`/`unsafe-inline` em scripts, COOP/CORP (fase 1)
- Limpeza de cache do PWA no logout — telemóveis partilhados em obra (fase 1)
- Cadeia de fornecimento: ações do GitHub fixadas por SHA; CodeQL só se o repositório o permitir (condicional — não criado, visibilidade do repositório por confirmar) (fase 5)
- Testes-guarda da BD que partem o CI em regressões de RLS/GRANT (fase 4)
- Limites de tamanho/tipo nos buckets de Storage (fase 3)
- `SECURITY.md` e resposta a incidentes (fase 7)

## 3. Arquitetura — 7 fases independentes

Cada fase é publicável sozinha. **Ordem de publicação desta entrega: site → migrations → Edge Functions.** O site novo
tem de funcionar com a BD antiga (tabela/RPC inexistente — `42P01`, `PGRST202`, `PGRST205`, `42883` — ⇒ comportamento de
antes) e as Edge Functions novas têm de funcionar se a RPC de rate limit ainda não existir (falham abertas, com log).

### Fase 1 — Borda (HTTP) e PWA
**`public/_headers`**
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- CSP: `script-src 'self'`; o script anti-FOUC saiu do `index.html` para `public/tema-inicial.js` (sem hash); remover `'unsafe-eval'` e
  `'unsafe-inline'` de `script-src`. `style-src` mantém `'unsafe-inline'` (Radix/Recharts injetam estilos).
  Acrescentar `object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests`.
- `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`.
- `report-uri`/`report-to`: **não implementado** (ficou fora; ver mapa, ponto 19).
- Verificar antes de remover `unsafe-eval`: build de produção a correr no browser sem violações
  (Leaflet, Recharts, Workbox, Sentry).

**Logout seguro (PWA)** — `src/features/auth`:
- No `signOut` (manual e por inatividade): apagar caches do service worker com dados de API
  (`caches.keys()` filtradas pelos nomes de cache de runtime definidos em `src/sw.ts`; os caches de
  assets estáticos ficam) e `sessionStorage`.
- Fila offline: as filas de **movimentos e de picagens** guardam o `userId` de quem as criou e só esse utilizador as
  envia (telemóvel partilhado em obra: os itens de A nunca saem com a sessão de B). A fila não é apagada no logout.
- `limparDadosLocais()` (cache `supabase-api` + `sessionStorage`) corre em **todo** o `SIGNED_OUT`, com testes.

### Fase 2 — Autenticação
**MFA TOTP**
- UI em `src/features/auth`:
  - `MfaRegistoPage` (rota `/seguranca/mfa`): `supabase.auth.mfa.enroll({ factorType: 'totp' })`,
    mostra QR (já existe `qrcode.react`) e segredo, confirma com `challenge` + `verify`. Também permite
    remover fator (exige AAL2).
  - `MfaDesafio` no login: depois da senha, se `getAuthenticatorAssuranceLevel()` indicar
    `nextLevel = aal2` e `currentLevel = aal1`, pede o código de 6 dígitos.
  - Guarda: admin/gestor sem fator registado, com o interruptor ligado → redirecionados para o registo
    (só podem sair dali fazendo logout).
- Imposição no servidor (migration):
  - Tabela `public.seguranca_config` (linha única: `mfa_obrigatorio boolean default false`,
    `atualizado_por`, `atualizado_em`); RLS: leitura autenticada, escrita só admin com AAL2.
  - `public.sessao_aal()` → `auth.jwt()->>'aal'`.
  - Migration `20261008000000` unifica primeiro **todas** as verificações de papel em `auth_role()` (policies/RPCs que
    consultavam `profiles` diretamente teriam contornado o MFA); um teste-guarda impede regressões.
  - `public.auth_role()` redefinida: se papel ∈ (`admin`,`gestor`) **e** `mfa_obrigatorio` **e**
    `sessao_aal() <> 'aal2'` → devolve `'leitura'`. Como todas as policies e RPCs usam
    `auth_role()`/`pode_escrever()`, a imposição cobre toda a BD de uma vez.
  - `promover_role` e Edge Function `admin-utilizadores` (usa papel de serviço) passam a verificar AAL
    do chamador explicitamente.
  - RPC `definir_mfa_obrigatorio(boolean)` (admin + AAL2, grava `audit_log`).
- Interruptor **desligado** na publicação → ninguém fica trancado; o admin liga-o depois de os
  gestores registarem a app (o ecrã de utilizadores mostra quem já tem MFA).
- Recuperação de quem perde o telemóvel: admin remove os fatores do utilizador via
  `admin-utilizadores` (ação `removerMfa`, com auditoria; botão "Remover MFA" em Gestão de utilizadores). Documentado em `docs/22-seguranca-operacao.md`.

**Senhas e sessão**
- `src/features/auth/lib/politicaSenha.ts`: mínimo 12, maiúscula, minúscula, dígito; usada em todos os
  formulários que definem senha (criação de utilizador, mudança de senha, reposição).
- `supabase/config.toml` espelha a produção desejada: `minimum_password_length = 12`,
  `password_requirements = "lower_upper_letters_digits"`, `enable_signup = false`,
  `secure_password_change = true`, `[auth.mfa.totp] enroll/verify = true`.
- Dashboard (manual): os mesmos valores.

**Rate limit**
- Tabela `privado.rate_limit (chave text, janela_inicio timestamptz, contagem int, PK(chave, janela_inicio))`
  — schema `privado` sem GRANT a `anon`/`authenticated`.
- `public.rate_limit_consumir(p_chave text, p_janela_seg int, p_max int) returns boolean`
  (`SECURITY DEFINER`, `search_path = public`, atómica com `INSERT … ON CONFLICT DO UPDATE`),
  EXECUTE só para o papel de serviço; variante interna chamada pelas RPCs.
- Uso: Edge Functions `extrair-fatura` (20/10 min), `ler-foto-abastecimento` (30/10 min) e `admin-utilizadores`
  (60/10 min) por utilizador; `pump-status` só quando o segredo falha: por IP (`cf-connecting-ip`/último `X-Forwarded-For`)
  30/10 min + global 100/10 min. Excedido → 429. **As RPCs de relatórios ficam fora**: são só leitura sob RLS.
  Se a RPC não existir (BD antiga), as funções falham abertas com log.
- Limpeza: pg_cron diário apaga janelas com mais de 1 dia (se pg_cron indisponível, a função apaga
  janelas antigas da mesma chave ao consumir).
- Eventos de segurança: ver fase 7.

### Fase 3 — Entradas e dados
- **Edge Functions**: módulo partilhado `supabase/functions/_shared/` com
  - `cors.ts`: origens permitidas `https://app.encivilconstroi.com`, `https://encivil-gestao.pages.dev`,
    `http://localhost:5173`; responde à origem do pedido se estiver na lista, senão sem cabeçalho.
    `pump-status` (chamado pelo Shelly, sem browser) não leva CORS.
  - `validar.ts`: validador pequeno por esquema (tipos, obrigatórios, comprimentos, UUID, enum) sem
    dependência nova; cada função declara o esquema do corpo e recusa com 400.
- **HelpPage**: substituir o `dangerouslySetInnerHTML` por renderização React do negrito (split do texto).
- **Exportações**: `exportCsv`/`exportXlsx` prefixam com `'` células de texto que comecem por
  `=`, `+`, `-`, `@`, tab ou CR (exceto números genuínos).
- **Storage**: inventário feito — buckets já com limites corretos, **sem migration** (por isso não existe `…040000`). O bucket
  `certificados` foi criado à mão no Dashboard: confirmar os limites em produção.
- **Dados pessoais de colaboradores** (`nif`, `morada`, `telefone`): verificar a RLS atual; se papéis
  além de admin/gestor e o próprio os leem, expor a esses papéis uma view sem essas colunas e revogar
  o SELECT dessas colunas (GRANT de coluna, padrão do ADR-007). **Decidido: só o NIF** — fica só para admin/gestor/próprio
  via RPC `colaborador_nif` (SELECT da coluna revogado; colunas novas em `colaboradores` precisam do seu próprio `GRANT SELECT`).
  O site novo tolera a BD antiga (a ficha não apaga o NIF ao guardar). Também: INSERT direto em `movimentos_stock` revogado
  (só RPCs). `enviar-resumo-alertas` passa a **falhar fechada** sem `EDGE_FUNCTION_SECRET` (igual a `app.edge_function_secret` da BD).
  CORS: pedidos de origem fora da lista recebem 403; sem `Origin` (cron, Shelly, servidor) continuam a funcionar;
  comparação de segredos em tempo constante. Sem cifra de coluna: não há dados
  bancários e a cifra impediria pesquisa/ordenação sem ganho face à RLS.

### Fase 4 — Controlo de acesso e auditoria
- **Testes-guarda** (`supabase/tests/seguranca-guardas.test.mjs`), sobre todas as migrations:
  1. Toda a tabela em `public` tem RLS ativa.
  2. `anon` não tem privilégio em nenhuma tabela/função fora de uma lista permitida explícita.
  3. Toda a função `SECURITY DEFINER` tem `search_path` fixo.
  4. Nenhuma policy usa `auth.jwt()->>'role'`.
  5. Migrations com data ≥ 2026-10-06: `EXECUTE` dinâmico só com `format()` + `%I`/`%L`; bloco `-- ROLLBACK` presente.
- **Espelho de permissões**: teste Vitest que lê `MATRIZ_ESCRITA` e compara com o resultado de
  `pode_escrever` para cada papel × módulo (via PGlite).
- **Auditoria genérica**: função trigger `public.auditar_alteracao()` grava em `audit_log`
  (tabela, operação, id, utilizador, antes/depois em jsonb, só colunas alteradas no UPDATE).
  Aplicada a `profiles`, `colaboradores`, `faturas_fornecedor`, `comb_aprovadores`, `configuracoes_empresa`,
  `seguranca_config`, `obras`. Guarda linhas completas (incluindo dados pessoais) e **sem retenção**; a imutabilidade e a FK
  impedem apagar utilizadores com histórico (desativam-se/banem-se). `audit_log` imutável (sem UPDATE/DELETE para ninguém, incluindo admin).
  Verificar o formato atual de `audit_log` e acrescentar colunas sem quebrar as escritas existentes.
- `AuditoriaPage` mostra as novas entradas (filtro por tabela).

### Fase 5 — Dependências, CI e gestão de patches
- `react-router` ≥ versão corrigida (`npm audit fix`).
- `xlsx` → `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (oficial; mesma API; só usado em
  `exportXlsx.ts`). Verificar exportação real.
- `.github/workflows/ci.yml`: job `seguranca` com `npm audit --audit-level=high --omit=dev`, gitleaks
  (histórico completo, com allowlist igual à do pre-commit). Todas as `uses:` fixadas por SHA.
- CodeQL: **condicional e não criado** — depende da visibilidade do repositório (em privado exige GitHub Advanced Security).
- `.github/dependabot.yml`: npm e github-actions, semanal, agrupado.
- Doc de rotina mensal de patches (secção em `docs/22-seguranca-operacao.md`).

### Fase 6 — Backups, migrations e rollback
- `.github/workflows/backup-bd.yml`:
  - Noturno (03:17 Europe/Lisbon) + manual. `pg_dump` (cliente da mesma versão major do Postgres do
    projeto) com `SUPABASE_DB_URL` (secret; **Session pooler**, IPv4, modo sessão), snapshot consistente, schemas `public` e
    `privado` **apenas** (não inclui passwords de `auth.users` nem ficheiros do Storage).
  - Cifra com `age` usando `BACKUP_AGE_PUBLIC_KEY` (secret; só a chave pública). A chave privada é
    gerada pelo utilizador e guardada offline (gestor de passwords + envelope da Direção).
  - Artefato privado, retenção 30 dias. Falha do job = e-mail do GitHub ao dono do repositório.
- Teste de restauro **dentro do job noturno**, antes de cifrar: restaura o dump num contentor Postgres
  efémero (service container) e compara as contagens de linhas das tabelas principais com a origem.
  Falha = job vermelho, artefato não publicado. Não há workflow separado de restauro: isso exigiria a
  chave privada no GitHub, e ela nunca sai do controlo da Direção.
- Restauro real (desastre): procedimento manual no runbook, decifrando localmente com a chave privada.
- Fotos do Storage: fora do backup automático (volume); documentado como exportação manual trimestral.
- `supabase/scripts/verificar-migrations.mjs`: compara `supabase/migrations` com a lista de migrations
  aplicadas (`supabase_migrations.schema_migrations` ou saída de `supabase migration list`) e lista
  divergências. Uso documentado.
- Convenção: migrations novas terminam com bloco `-- ROLLBACK` (SQL comentado que desfaz). Imposta
  pelo teste-guarda 5.
- Runbook de rollback: site (Cloudflare Pages → Deployments → Rollback), BD (bloco ROLLBACK ou restauro
  do backup), Edge Functions (redeploy do commit anterior).
- `BackupPage`/`backupService`: corrigir `comb_viaturas` (tabela inexistente) e rever a lista contra
  as tabelas reais.

### Fase 7 — Monitoramento, eventos e recuperação
- Tabela `public.eventos_seguranca` (tipo, utilizador, ip, detalhe jsonb, criado_em), só INSERT via
  RPC `registar_evento_seguranca` (SECURITY DEFINER) e funções internas; leitura só admin; imutável.
  Tipos: `login_falhado`, `login_ok`, `mfa_registado`, `mfa_removido`, `mfa_falhado`,
  `rate_limit`, `papel_alterado`, `mfa_obrigatorio_alterado`.
- Retenção de 1 ano. Login falhado registado por `registar_login_falhado`; MFA e restantes pelo frontend/RPCs
  (melhor esforço, sem bloquear o login) — o próprio
  `auth.audit_log_entries` do Supabase continua a ser a fonte autoritativa.
- Painel "Eventos de segurança" na `AuditoriaPage` (separador), com contagem de logins falhados
  últimas 24 h e alerta visual acima de um limiar.
- Sentry: tag `seguranca` para erros 401/403/429.
- Documentos:
  - `docs/22-seguranca-operacao.md`: plano de recuperação de desastre (RPO 24 h no Free / RTO 4 h;
    cenários: BD apagada/corrompida, conta comprometida, chave vazada, Cloudflare em baixo, perda do
    responsável), resposta a incidentes (conter → avaliar → erradicar → recuperar → lições; contactos;
    rotação de chaves por serviço), rotina de patches, checklist "ao passar para o Pro".
  - `SECURITY.md` na raiz (como reportar uma vulnerabilidade).
  - Atualizar `docs/05-seguranca-e-acesso.md` (modelo de papéis desatualizado, MFA, headers) e
    `docs/13-infraestrutura-e-contas.md` (secrets novos, backup).

## 4. Decisões e trade-offs
1. **MFA imposto em `auth_role()`** em vez de policies restritivas em cada tabela: uma alteração cobre
   tudo; risco = `auth_role()` fica no caminho crítico → coberto por testes de BD de cada papel × AAL.
2. **Interruptor desligado por defeito**: evita trancar admins antes de registarem o fator.
3. **Sem cifra de coluna**: RLS + GRANT de coluna dá a mesma proteção contra o acesso pela app; a cifra
   só ajudaria contra quem já tem acesso de serviço à BD, e esse tem também a chave.
4. **Teste de restauro dentro do job de backup**: a chave privada nunca sai do controlo da Direção.
5. **SheetJS oficial em vez de trocar de biblioteca**: mesma API, menor risco de regressão nas exportações.
6. **Validador próprio nas Edge Functions** em vez de zod: evita dependência nova no Deno para esquemas
   simples.

## 5. Tratamento de erros
- 429 / rate limit e MFA em falta → mensagens pt-PT via `parseSupabaseError` (acrescentar códigos).
- Escrita recusada por falta de AAL2 → "Esta ação exige verificação em dois passos. Volta a entrar."
- Falha a registar evento de segurança nunca bloqueia o fluxo do utilizador.
- Falha do backup → job vermelho + e-mail; falha do restauro-teste → job vermelho.

## 6. Testes
| Camada | O quê |
|---|---|
| BD (PGlite) | `auth_role` × papel × AAL × interruptor; `rate_limit_consumir` (limite, janela, atomicidade); auditoria (insert/update/delete, imutabilidade); eventos (só admin lê, imutável); guardas da fase 4; dados pessoais por papel; buckets |
| Vitest | `politicaSenha`, `limparDadosLocais`, escape de fórmulas, `HelpPage` sem HTML injetado, fluxos MFA (mocks do cliente), espelho `MATRIZ_ESCRITA`, hash do script anti-FOUC no `_headers` |
| Deno | `_shared/cors.ts`, `_shared/validar.ts`, rate limit e AAL nas funções alteradas |
| Mutações | Cada guarda nova: remover/inverter a condição tem de partir pelo menos um teste |
| agent-browser + Supabase local | login → registo MFA → logout → login com código; admin sem MFA com interruptor ligado → só leitura/redireção; senha fraca recusada; logout limpa caches; aviso de fila offline; CSP sem violações na consola |
| Produção (só público) | Cabeçalhos (`curl -I`), `/login` carrega sem violações CSP |
| CI | typecheck, build, testes, edge, `seguranca`, CodeQL a verde |

## 7. Passos manuais do utilizador (checklist entregue no fim)
1. Publicar o site; depois aplicar as migrations por ordem no SQL Editor (`20261008000000`, `…010000`, `…020000`, `…030000`, `…050000`, `…060000`); só então publicar as Edge Functions.
2. Dashboard Supabase → Auth: desligar signup; senha mínima 12 + requisitos; secure password change;
   ativar MFA TOTP.
3. GitHub → Secrets: `SUPABASE_DB_URL` (Session pooler), `BACKUP_AGE_PUBLIC_KEY` (gerar o par com `age-keygen`; guardar a
   privada offline).
4. Registar o próprio MFA; pedir aos gestores para registarem; ligar `mfa_obrigatorio`.
5. Confirmar/apagar o utilizador de teste `admin123` (doc 13 §3).
6. Ao passar ao Pro: senhas vazadas, timebox/inatividade de sessão no servidor, PITR.

## 8. Fora do âmbito
- WAF/regras pagas da Cloudflare, SIEM externo, pentest externo, cifra de coluna, WebAuthn/passkeys
  (o TOTP cobre o requisito com menos risco de adoção; passkeys podem vir depois).

## 9. Alterações face ao desenho inicial

Registadas em 2026-10-07 para a spec refletir o que foi construído (detalhe em `docs/22-seguranca-operacao.md`):

- Rate limit só nas Edge Functions (e RPCs de eventos); RPCs de relatórios fora (só leitura sob RLS). `pump-status` limita só após segredo falhado.
- MFA exigiu converter todas as verificações diretas de papel para `auth_role()` (migration `20261008000000`) e um teste-guarda.
- NIF: só admin/gestor/próprio via RPC `colaborador_nif`; o resto dos dados pessoais ficou como estava.
- Fila offline por utilizador (movimentos e picagens), em vez de aviso no logout.
- CSP sem hash: o script anti-FOUC passou para `public/tema-inicial.js`; relatórios CSP no Sentry não implementados.
- CodeQL condicional (não criado). Dependabot e gitleaks no CI feitos.
- Backup: só `public` e `privado`; contas de `auth.users` e Storage fora do backup.
- Storage: sem migration (buckets já corretos).
- Publicação: site → migrations → Edge Functions.
