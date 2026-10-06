# Segurança 2026 — Desenho

> Data: 2026-10-06 · Estado: aprovado em conversa, aguarda revisão da spec escrita
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
| 3 | MFA | Desligado (doc dizia "só Pro" — errado: TOTP é grátis) | TOTP obrigatório admin/gestor, imposto no servidor | 2 |
| 4 | Rate limit | Só o do Auth | Limitador genérico na BD usado por Edge Functions e RPCs pesadas | 2 |
| 5 | Validação de inputs | Validação ad hoc | Validação de esquema em todas as Edge Functions; política de senha na UI | 3 |
| 6 | Sanitização | 1 `dangerouslySetInnerHTML` com regex (`HelpPage`) | Remover; proteção contra injeção de fórmulas em CSV/Excel | 3 |
| 7 | SQL injection | Queries parametrizadas | Teste que falha se surgir `EXECUTE` com concatenação sem `format(%I/%L)` em migrations novas | 4 |
| 8 | Migrations | Aplicadas à mão; produção divergiu | Script de deteção de divergência; checklist por migration | 6 |
| 9 | Rollback | Inexistente | Bloco `-- ROLLBACK` obrigatório em migrations novas; runbook de rollback do site e BD | 6 |
| 10 | Controle de acesso | RLS + `pode_escrever` | Testes-guarda (RLS, anon, search_path); espelho `MATRIZ_ESCRITA`×SQL; dados pessoais restritos | 3, 4 |
| 11 | Expiração de sessão | Inatividade 30 min só no browser | Mantém; limpeza de dados locais no logout; timebox de sessão documentado para o Pro | 1, 7 |
| 12 | Secrets | Pre-commit | gitleaks no CI (histórico completo); inventário em doc 13 | 5 |
| 13 | CORS | Edge Functions com `*` | Lista de origens permitidas | 3 |
| 14 | Logs | `audit_log` cobre pouco | Auditoria genérica imutável em tabelas sensíveis; eventos de segurança | 4, 7 |
| 15 | Backups | **Nunca feito** | `pg_dump` noturno cifrado (age) + teste de restauro semanal | 6 |
| 16 | Criptografia | Trânsito (TLS) e repouso (Supabase) | Backups cifrados; HSTS; dados pessoais restritos por RLS (sem cifra de coluna — ver §4.3) | 1, 3, 6 |
| 17 | Dependências | `react-router` (alta, corrigível), `xlsx` (alta, sem correção no npm) | Corrigir; SheetJS 0.20.3 oficial; `npm audit` no CI | 5 |
| 18 | Gestão de patches | Ad hoc | Dependabot semanal (npm + actions); rotina mensal documentada | 5 |
| 19 | Monitoramento | Sentry só para erros | Relatórios CSP no Sentry; painel "Eventos de segurança" | 1, 7 |
| 20 | Plano de recuperação | Inexistente | Plano de recuperação (RPO 24 h / RTO 4 h) + resposta a incidentes | 7 |

### Acrescentados (riscos 2026 não cobertos pela lista)
- CSP sem `unsafe-eval`/`unsafe-inline` em scripts, COOP/CORP (fase 1)
- Limpeza de cache do PWA no logout — telemóveis partilhados em obra (fase 1)
- Cadeia de fornecimento: ações do GitHub fixadas por SHA, CodeQL (fase 5)
- Testes-guarda da BD que partem o CI em regressões de RLS/GRANT (fase 4)
- Limites de tamanho/tipo nos buckets de Storage (fase 3)
- `SECURITY.md` e resposta a incidentes (fase 7)

## 3. Arquitetura — 7 fases independentes

Cada fase é publicável sozinha. Ordem de publicação de cada fase: **migration → Edge Functions → site**,
salvo indicação em contrário. Nenhuma fase depende de outra estar em produção, exceto onde dito.

### Fase 1 — Borda (HTTP) e PWA
**`public/_headers`**
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- CSP: `script-src 'self'` + hash `sha256-…` do script anti-FOUC do `index.html` (calculado no build por
  um teste que falha se o script mudar sem o hash ser atualizado); remover `'unsafe-eval'` e
  `'unsafe-inline'` de `script-src`. `style-src` mantém `'unsafe-inline'` (Radix/Recharts injetam estilos).
  Acrescentar `object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests`.
- `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`.
- `report-uri`/`report-to` para o endpoint de segurança do Sentry (derivado de `VITE_SENTRY_DSN`;
  como `_headers` é estático, o endpoint fica escrito no ficheiro — o DSN já é público por natureza).
- Verificar antes de remover `unsafe-eval`: build de produção a correr no browser sem violações
  (Leaflet, Recharts, Workbox, Sentry).

**Logout seguro (PWA)** — `src/features/auth`:
- No `signOut` (manual e por inatividade): apagar caches do service worker com dados de API
  (`caches.keys()` filtradas pelos nomes de cache de runtime definidos em `src/sw.ts`; os caches de
  assets estáticos ficam) e `sessionStorage`.
- Fila offline (`offlineQueue`): **não** é apagada sem aviso. Se tiver itens: logout manual pergunta
  ("Há N movimentos por enviar. Sair na mesma?"); logout por inatividade mantém a fila (é enviada no
  próximo login, que revalida tudo no servidor).
- Função pura `limparDadosLocais()` em `src/features/auth/lib/` com testes.

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
  - `public.auth_role()` redefinida: se papel ∈ (`admin`,`gestor`) **e** `mfa_obrigatorio` **e**
    `sessao_aal() <> 'aal2'` → devolve `'leitura'`. Como todas as policies e RPCs usam
    `auth_role()`/`pode_escrever()`, a imposição cobre toda a BD de uma vez.
  - `promover_role` e Edge Function `admin-utilizadores` (usa papel de serviço) passam a verificar AAL
    do chamador explicitamente.
  - RPC `definir_mfa_obrigatorio(boolean)` (admin + AAL2, grava `audit_log`).
- Interruptor **desligado** na publicação → ninguém fica trancado; o admin liga-o depois de os
  gestores registarem a app (o ecrã de utilizadores mostra quem já tem MFA).
- Recuperação de quem perde o telemóvel: admin remove os fatores do utilizador via
  `admin-utilizadores` (ação nova `remover_mfa`, com auditoria). Documentado no runbook.

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
- Uso: Edge Functions (`extrair-fatura`, `ler-foto-abastecimento`, `admin-utilizadores`,
  `pump-status`) por utilizador/IP; RPCs pesadas de relatórios por `auth.uid()`. Excedido → 429 / erro
  pt-PT "Demasiados pedidos. Tenta dentro de instantes."
- Limpeza: pg_cron diário apaga janelas com mais de 1 dia (se pg_cron indisponível, a função apaga
  janelas antigas da mesma chave ao consumir).
- Cada recusa grava um evento de segurança (fase 7).

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
- **Storage**: migration define `file_size_limit` e `allowed_mime_types` em todos os buckets que ainda
  não os têm (inventário na implementação).
- **Dados pessoais de colaboradores** (`nif`, `morada`, `telefone`): verificar a RLS atual; se papéis
  além de admin/gestor e o próprio os leem, expor a esses papéis uma view sem essas colunas e revogar
  o SELECT dessas colunas (GRANT de coluna, padrão do ADR-007). Sem cifra de coluna: não há dados
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
  Aplicada a `profiles`, `colaboradores`, `faturas`, `comb_aprovadores`, `configuracoes_empresa`,
  `seguranca_config`, `obras`. `audit_log` imutável (sem UPDATE/DELETE para ninguém, incluindo admin).
  Verificar o formato atual de `audit_log` e acrescentar colunas sem quebrar as escritas existentes.
- `AuditoriaPage` mostra as novas entradas (filtro por tabela).

### Fase 5 — Dependências, CI e gestão de patches
- `react-router` ≥ versão corrigida (`npm audit fix`).
- `xlsx` → `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (oficial; mesma API; só usado em
  `exportXlsx.ts`). Verificar exportação real.
- `.github/workflows/ci.yml`: job `seguranca` com `npm audit --audit-level=high --omit=dev`, gitleaks
  (histórico completo, com allowlist igual à do pre-commit). Todas as `uses:` fixadas por SHA.
- `.github/workflows/codeql.yml` (javascript-typescript, semanal + PR).
- `.github/dependabot.yml`: npm e github-actions, semanal, agrupado.
- Doc de rotina mensal de patches (secção em `docs/22-seguranca-operacao.md`).

### Fase 6 — Backups, migrations e rollback
- `.github/workflows/backup-bd.yml`:
  - Noturno (03:17 Europe/Lisbon) + manual. `pg_dump` (cliente da mesma versão major do Postgres do
    projeto) com `SUPABASE_DB_URL` (secret; ligação pelo pooler em modo sessão), schemas `public`,
    `privado`, `auth`, `storage` (metadados).
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
- Login falhado/ok e MFA registados pelo frontend (melhor esforço, sem bloquear o login) — o próprio
  `auth.audit_log_entries` do Supabase continua a ser a fonte autoritativa.
- Painel "Eventos de segurança" na `AuditoriaPage` (separador), com contagem de logins falhados
  últimas 24 h e alerta visual acima de um limiar.
- Sentry: tag `seguranca` para erros 401/403/429; relatórios CSP (fase 1).
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
1. Aplicar as migrations por ordem no SQL Editor; correr as verificações indicadas.
2. Dashboard Supabase → Auth: desligar signup; senha mínima 12 + requisitos; secure password change;
   ativar MFA TOTP.
3. GitHub → Secrets: `SUPABASE_DB_URL`, `BACKUP_AGE_PUBLIC_KEY` (gerar o par com `age-keygen`; guardar a
   privada offline).
4. Registar o próprio MFA; pedir aos gestores para registarem; ligar `mfa_obrigatorio`.
5. Confirmar/apagar o utilizador de teste `admin123` (doc 13 §3).
6. Ao passar ao Pro: senhas vazadas, timebox/inatividade de sessão no servidor, PITR.

## 8. Fora do âmbito
- WAF/regras pagas da Cloudflare, SIEM externo, pentest externo, cifra de coluna, WebAuthn/passkeys
  (o TOTP cobre o requisito com menos risco de adoção; passkeys podem vir depois).
