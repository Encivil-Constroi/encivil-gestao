# 22 — Segurança: operação, recuperação e incidentes

> Escrito em 2026-10-07 (entrega "Segurança 2026"). Serve a quem substitui o responsável de
> sistemas e à Direção. Nunca contém valores de passwords, chaves ou tokens — só o nome do
> segredo e onde ele vive. Desenho completo: `docs/superpowers/specs/2026-10-06-seguranca-2026-design.md`.
> Inventário de contas e segredos: `docs/13-infraestrutura-e-contas.md`. Modelo de acesso: `docs/05-seguranca-e-acesso.md`.

---

## 1. Mapa dos 20 pontos

| # | Ponto | Medida | Onde está | Como verificar |
|---|---|---|---|---|
| 1 | HTTPS | Cloudflare força HTTPS; HSTS 2 anos com `includeSubDomains; preload` | `public/_headers` | `curl -sI https://app.encivilconstroi.com` mostra `strict-transport-security` |
| 2 | Senhas com hash | Hash bcrypt do Supabase Auth; política 12+ caracteres com maiúscula, minúscula e dígito (UI e `config.toml` local) | `src/features/auth/lib/politicaSenha.ts`, `supabase/config.toml`; Dashboard → Authentication (manual) | Tentar criar utilizador com senha fraca: é recusada |
| 3 | MFA | TOTP em `/seguranca/mfa`, desafio depois do login; imposto na BD por `auth_role()` quando `seguranca_config.mfa_obrigatorio` está ligado (começa desligado) | `src/features/auth`, migration `20261008010000` | Secção 2; testes de BD (papel × AAL) |
| 4 | Rate limit | `privado.rate_limit` + `rate_limit_consumir`. `extrair-fatura` 20/10 min, `ler-foto-abastecimento` 30/10 min, `admin-utilizadores` 60/10 min por utilizador; `pump-status` só após segredo falhado: 30/10 min por IP + 100/10 min global. Falha aberta (com log) se a RPC não existir | `supabase/functions/*`, migration `20261008020000` | Logs da função mostram 429 |
| 5 | Validação de inputs | Validação de corpo em todas as Edge Functions; política de senha na UI | `supabase/functions/_shared/`, `src/features/auth` | `npm run test:edge` |
| 6 | Sanitização | `HelpPage` sem `innerHTML`; exportações CSV/Excel neutralizam fórmulas (`=`, `+`, `-`, `@`) | `src/app/lib/exportCsv.ts`, `exportXlsx.ts`, `HelpPage` | Exportar uma observação "=1+1": abre como texto |
| 7 | SQL injection | Queries parametrizadas (SDK); `EXECUTE` dinâmico só com `format(%I/%L)` | `supabase/tests/seguranca-guardas.test.mjs` | `npm test` |
| 8 | Migrations | Convenção + deteção de divergência produção × repositório | `supabase/scripts/verificar-migrations.mjs` | Secção 7 |
| 9 | Rollback | Bloco `-- ROLLBACK` obrigatório nas migrations novas; rollback do site e das funções | fim de cada migration `20261008*`; secção 4 | Teste-guarda de BD |
| 10 | Controlo de acesso | RLS + `pode_escrever`; **todas** as verificações de papel passam por `auth_role()`; NIF só para admin/gestor/próprio (RPC `colaborador_nif`); INSERT direto em `movimentos_stock` revogado | migrations `20261008000000`, `20261008030000`; `src/features/auth/useRole.ts` | Testes-guarda de BD; `npm test` |
| 11 | Expiração de sessão | Inatividade 30 min no browser; em cada `SIGNED_OUT` limpa-se o cache em memória do `useAsync` (`limparCacheMemoria`), o `sessionStorage` e, se existir, o cache `supabase-api` do SW (a rota Workbox é cross-origin e provavelmente nunca o enche; o `caches.delete` é inofensivo); filas offline (movimentos e picagens) só enviadas por quem as criou. Timebox no servidor: só no Pro (secção 8) | `src/features/auth` (`limparDadosLocais`), `src/features/movimentos/offlineQueue.ts` | Sair e entrar com outro utilizador: a fila do anterior não é enviada |
| 12 | Secrets | Pre-commit local + gitleaks no CI (histórico completo, `.gitleaks.toml`); inventário em doc 13 | `.githooks/`, `.github/workflows/ci.yml` | Job "Segurança" do CI |
| 13 | CORS | Lista de origens: `app.encivilconstroi.com`, `encivil-gestao.pages.dev` (e previews), `localhost:5173`. Origem diferente recebe 403; sem `Origin` (cron, Shelly, servidor) funciona | `supabase/functions/_shared/cors.ts` | `npm run test:edge` |
| 14 | Logs | `audit_log` imutável em `profiles`, `colaboradores`, `faturas_fornecedor`, `comb_aprovadores`, `configuracoes_empresa`, `seguranca_config`, `obras`; `eventos_seguranca` imutável, retenção 1 ano | migrations `20261008020000`, `20261008060000`; página Auditoria | Auditoria → separador Eventos de segurança |
| 15 | Backups | `pg_dump` noturno cifrado + restauro de teste | `.github/workflows/backup-bd.yml`, `scripts/backup/backup-bd.sh` | Secção 3 |
| 16 | Criptografia | TLS em trânsito, cifra em repouso do Supabase, backups cifrados com `age`, dados pessoais restritos por RLS/GRANT (sem cifra de coluna) | — | Secção 3 |
| 17 | Dependências | `react-router` 7.18.4; SheetJS 0.20.3 oficial (cdn.sheetjs.com); `npm audit` (high, prod) no CI | `package.json`, `ci.yml` | Job "Segurança" |
| 18 | Gestão de patches | Dependabot semanal (npm + actions); rotina mensal; ações do GitHub fixadas por SHA | `.github/dependabot.yml` | Secção 6 |
| 19 | Monitorização | Sentry (erros); painel Eventos de segurança com logins falhados (`registar_login_falhado`) | Página Auditoria | Falhar um login de propósito e ver o evento |
| 20 | Plano de recuperação | RPO 24 h, RTO 4 h; resposta a incidentes | Secções 4 e 5 | Exercício anual (secção 4) |

Também feito: CSP com `script-src 'self'` (script anti-FOUC em `public/tema-inicial.js`), COOP/CORP, `object-src 'none'`, `base-uri`, `form-action`, `upgrade-insecure-requests`.
`enviar-resumo-alertas` **falha fechada** sem `EDGE_FUNCTION_SECRET` (tem de ser igual a `app.edge_function_secret` na BD).

---

## 2. MFA (verificação em dois passos)

**Registar (cada utilizador).** Perfil → "Verificação em dois passos" (ou `/seguranca/mfa`) → ler o QR
com uma app autenticadora (Google/Microsoft Authenticator, Authy) → escrever o código de 6 dígitos.

**Ligar a obrigatoriedade (admin, só depois de todos os admins e gestores terem registado).**
1. Em Gestão de utilizadores confirmar quem já tem MFA.
2. Entrar como admin **com código MFA** (sessão aal2).
3. Ligar o interruptor "MFA obrigatório" (RPC `definir_mfa_obrigatorio`, só admin com aal2).
4. A partir daí, admin/gestor com sessão sem MFA ficam só com leitura na BD e são levados ao registo.

**Utilizador perdeu o telemóvel.**
1. Admin → Gestão de utilizadores → "Remover MFA" (Edge Function `admin-utilizadores`, ação `removerMfa`).
2. O utilizador entra só com a senha e regista o MFA de novo.

**O único admin perdeu o telemóvel.**
1. Supabase → SQL Editor: `UPDATE public.seguranca_config SET mfa_obrigatorio = false;`
2. Supabase → Authentication → Users → utilizador → MFA → apagar o fator.
3. Entrar, registar MFA novo e voltar a ligar o interruptor.
4. Registar o incidente (secção 5).

---

## 3. Backups

**O que é copiado.** Schemas `public` e `privado` (dados de negócio, perfis e papéis, `audit_log`,
`eventos_seguranca`). **Não** copia as passwords/contas do `auth.users` nem os ficheiros do Storage.
Num desastre, os utilizadores voltam a convidar-se (§4a) e as fotos têm exportação manual.

**Quando e onde.** Todas as noites ~03:17 (Lisboa) e à mão. GitHub → Actions → **Backup BD** → execução → Artifacts.
Retenção 30 dias. O job faz um *snapshot* consistente, restaura num Postgres temporário, compara as contagens
das tabelas principais com a origem e só depois cifra. Contagens diferentes ou restauro falhado = job vermelho,
sem artefacto, e o GitHub avisa por e-mail.

**Configuração inicial (uma vez).** Sem os dois secrets o job falha com mensagem explícita.
1. Gerar o par de chaves, num computador de confiança: `age-keygen -o encivil-backup.key`.
2. A linha `Public key: age1…` vai para o secret do GitHub `BACKUP_AGE_PUBLIC_KEY` (Settings → Secrets and variables → Actions).
3. O ficheiro `encivil-backup.key` (chave privada) vai para o gestor de passwords **e** para o envelope da Direção. Nunca para o repositório, e-mail ou chat. Sem ela os backups não abrem.
4. `SUPABASE_DB_URL`: Dashboard Supabase → Connect → **Session pooler** (IPv4, modo sessão), com a password da BD no URL. Os runners do GitHub não têm IPv6, por isso a ligação direta não serve; o modo transação também não serve.
5. Correr o workflow à mão uma vez e confirmar o artefacto.

**Restaurar.**
1. Descarregar o artefacto e extrair o `.age`.
2. Decifrar: `age -d -i encivil-backup.key -o bd.dump bd-<data>.dump.age`
3. Restaurar num projeto Supabase novo/limpo: `pg_restore --no-owner --dbname=<URL do projeto novo/limpo> bd.dump`
4. Voltar a convidar os utilizadores e confirmar os papéis (§4a, passo 5).

**Fotos do Storage.** Fora do backup automático. Exportação manual trimestral: Dashboard → Storage → descarregar cada bucket; guardar em disco da empresa. Registar abaixo.

| Data | Quem | Buckets exportados |
|---|---|---|
| — | — | — |

---

## 4. Plano de recuperação de desastre

**Objetivos.** RPO 24 h (Supabase Free: perde-se no máximo o dia desde o último backup; com Pro + PITR passa a minutos).
RTO 4 h (sistema outra vez utilizável). Exercício anual: restaurar o último backup num projeto de teste e registar o tempo gasto.

**(a) Dados apagados ou corrompidos**
1. Avisar as equipas para pararem de registar; se preciso, pôr o site num deploy estável (Cloudflare Pages → Rollback).
2. Perceber o alcance: Auditoria (`audit_log`, `eventos_seguranca`). Os movimentos de stock nunca se apagam (`movimentos_stock` é imutável), por isso o stock reconstrói-se a partir deles.
3. Se bastar corrigir poucas linhas: restaurar o backup num projeto temporário e copiar só essas linhas.
4. Se for geral: restaurar (secção 3) num projeto novo; apontar o site para ele (`VITE_SUPABASE_URL` e chave pública no Cloudflare Pages), republicar, reconfigurar Edge Functions e segredos.
5. Utilizadores: as contas de login não vêm no backup. Convidar de novo cada utilizador em Gestão de utilizadores e confirmar o papel de cada um com `promover_role`.
6. Registar o incidente e a perda de dados (máx. 24 h).

**(b) Conta de utilizador comprometida**
1. Gestão de utilizadores → desativar a conta (desativa-se, nunca se apaga: o histórico de auditoria impede apagar).
2. Remover o MFA do utilizador e exigir nova senha forte antes de reativar.
3. Rever `eventos_seguranca` (logins falhados, MFA) e `audit_log` desse utilizador no período suspeito; corrigir o indevido com movimentos de ajuste.
4. Se era admin: rever também quem tem papel `admin` (`promover_role` fica em `audit_log`).

**(c) Chave ou segredo vazado** — rodar **sempre** no serviço de origem e atualizar onde é usado.

| Segredo | Onde se roda | Onde se atualiza / o que reiniciar |
|---|---|---|
| Password da BD (`SUPABASE_DB_URL`) | Supabase → Project Settings → Database → reset password | Secret `SUPABASE_DB_URL` no GitHub; correr Backup BD à mão |
| Chaves de API do Supabase (incluindo a de papel de serviço) | Supabase → Project Settings → API Keys | As Edge Functions recebem-nas automaticamente; republicar as funções |
| Chave pública (`sb_publishable_`) | Supabase → API Keys (é pública; rodar só se for pedido) | Variáveis do Cloudflare Pages + novo deploy |
| `GOOGLE_AI_API_KEY` | Google AI Studio | Supabase → Edge Functions → Secrets |
| `RESEND_API_KEY` | Resend | Supabase → Edge Functions → Secrets |
| `VAPID_PRIVATE_KEY` | Gerar par novo | Secrets das Edge Functions + `VITE_VAPID_PUBLIC_KEY` no Cloudflare; os telemóveis têm de reativar as notificações |
| `PUMP_POLO2_SECRET` | Gerar novo valor | Secrets do Supabase **e** configuração do Shelly (`supabase/scripts/shelly-polo2.js`) |
| `EDGE_FUNCTION_SECRET` | Gerar novo valor | Secret das Edge Functions **e** `app.edge_function_secret` na BD (têm de ser iguais; senão `enviar-resumo-alertas` recusa) |
| Segredos em `privado.segredos` / `privado.frota_push` | Gerar novos na BD | Ver migrations `20260929040000` e `20260930010000` |
| `ANTHROPIC_API_KEY` | Console da Anthropic | Secret no GitHub |
| `BACKUP_AGE_PUBLIC_KEY` / chave privada age | Gerar par novo | Atualizar o secret; guardar a chave privada nova; **manter a antiga** para abrir backups antigos |
| Variáveis do Cloudflare Pages | Cloudflare → Pages → Settings | Novo deploy |
| Acessos GitHub / contas | Settings da conta | Rever membros da organização `Encivil-Constroi` |

Depois de rodar: confirmar nos Logs das Edge Functions que as chamadas voltam a passar.

**(d) Site partido depois de um deploy.** Cloudflare Pages → Deployments → escolher o último deploy bom → Rollback.
Depois corrigir no código com um commit novo (nunca push forçado em `main`).

**(e) Migration errada**
1. Cada migration `20261008*` termina com um bloco `-- ROLLBACK` (SQL comentado). Copiar o bloco para o SQL Editor, retirar os comentários e correr.
2. Se a migration apagou ou alterou dados e o rollback não os repõe: restaurar o backup (secção 3) e copiar as linhas afetadas.
3. Corrigir no repositório com um ficheiro novo (timestamp maior) e voltar a aplicar.

**(f) Edge Function errada.** Fazer checkout do commit anterior e republicar essa função (Dashboard → Edge Functions, ou CLI). Confirmar nos Logs.

**(g) Responsável indisponível.** Seguir `docs/13-infraestrutura-e-contas.md`: titulares das contas, envelope da Direção
(chave privada dos backups, gestor de passwords) e este documento. O substituto começa por entrar no GitHub (organização), no Supabase e no Cloudflare, correr o workflow Backup BD à mão e confirmar o artefacto.

---

## 5. Resposta a incidentes

Quem suspeitar de um incidente (conta alheia a entrar, dados estranhos, aviso de segurança) avisa de imediato o responsável de sistemas, que avisa a Direção.
**Quem decide:** o responsável de sistemas decide as medidas técnicas; a Direção decide parar o sistema, comunicar a terceiros e notificar a autoridade.

1. **Conter** — desativar contas suspeitas, remover MFA e forçar nova senha, rodar segredos expostos (§4c), pôr o site em manutenção se necessário. Não apagar nada: preservar `audit_log`, `eventos_seguranca` e os logs do Supabase/Cloudflare.
2. **Avaliar** — o que foi acedido ou alterado, desde quando, por quem; que dados pessoais (colaboradores, NIF) estão envolvidos. Fontes: Auditoria, `eventos_seguranca`, Logs das Edge Functions, Authentication → Logs.
3. **Erradicar** — fechar a causa (senha fraca, segredo vazado, falha de código com correção por PR) e rever outras contas e acessos.
4. **Recuperar** — repor dados (§4a/§4e), reativar utilizadores com senha nova e MFA, confirmar que os logins falhados voltaram ao normal.
5. **Lições aprendidas** — numa semana: o que correu mal, o que mudar (código, processo, formação); atualizar este documento.

**Registo do incidente** (um por incidente, guardado pela Direção):

| Campo | Conteúdo |
|---|---|
| Data/hora de deteção e de início | |
| Quem detetou | |
| Impacto (sistemas, dados, pessoas) | |
| Ações tomadas (com hora) | |
| Dados pessoais envolvidos? | sim/não — quais |
| Comunicado à CNPD / aos titulares? | sim/não — quando |
| Causa e correção | |
| Lições / ações futuras | |

**RGPD.** Se houver violação de dados pessoais (acesso, perda ou divulgação indevidos de dados de colaboradores, como NIF, morada ou telefone), a Direção avalia o risco e, quando aplicável, notifica a CNPD em **72 horas** após ter conhecimento; se o risco para as pessoas for elevado, informa também os titulares. Mesmo sem notificar, registar a decisão e o motivo.

Nota sobre dados pessoais: o `audit_log` guarda linhas completas (incluindo dados pessoais) sem prazo de retenção; é imutável e a ligação a `auth.users` impede apagar utilizadores com histórico — por isso as contas desativam-se, não se apagam. Um pedido de apagamento (RGPD) exige decisão da Direção sobre esta imutabilidade.

---

## 6. Gestão de patches

**Semanal (segunda-feira).** O Dependabot abre PRs (npm e GitHub Actions, agrupados). Juntar os que têm o CI verde; analisar os vermelhos antes.

**Mensal (1.ª segunda-feira).**
1. `npm audit` — corrigir o que seja *high* ou *critical* em produção.
2. GitHub → Security → Dependabot alerts: rever e fechar.
3. Supabase → Infrastructure: versão do Postgres e avisos de atualização.
4. Versão do `deno` das Edge Functions (`npm run check:edge && npm run test:edge`).
5. Registar abaixo.

**Patches aplicados**

| Data | Quem | Atualizado | Observações |
|---|---|---|---|
| — | — | — | — |

---

## 7. Migrations

- Ficheiros `supabase/migrations/YYYYMMDDHHMMSS_nome.sql`, cronologia crescente, **idempotentes** (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP … IF EXISTS`), com `GRANT` + RLS e, nas novas, **bloco `-- ROLLBACK` no fim**.
- **Ordem de publicação desta entrega: site → migrations → Edge Functions.** O site novo funciona com a BD antiga; as Edge Functions novas funcionam sem a RPC de rate limit (falham abertas, com log).
- Aplicação à mão no SQL Editor, por esta ordem: `20261008000000`, `20261008010000`, `20261008020000`, `20261008030000`, `20261008050000`, `20261008060000` (não existe `…040000`: os buckets já estavam corretos). Depois regenerar tipos (`npx supabase gen types typescript --local > src/integrations/supabase/types.ts`) e `npm run typecheck`.
- Colunas novas em `colaboradores` precisam do seu próprio `GRANT SELECT` de coluna (o SELECT global foi revogado por causa do NIF).
- O bucket `certificados` foi criado à mão no Dashboard (não está nas migrations): confirmar o limite de tamanho e os tipos permitidos em produção.

**Detetar divergências.** No SQL Editor: `SELECT version FROM supabase_migrations.schema_migrations ORDER BY 1;` → guardar o resultado num ficheiro (uma versão por linha) → `node supabase/scripts/verificar-migrations.mjs aplicadas.txt`. Mostra o que falta aplicar e o que está só na BD.

**Migrations aplicadas em produção** (atualizar a cada aplicação; até haver CLI esta tabela é a fonte):

| Versão | Aplicada em | Por quem |
|---|---|---|
| `20261008000000` seguranca_auth_role_unificado | por aplicar | — |
| `20261008010000` seguranca_mfa | por aplicar | — |
| `20261008020000` seguranca_eventos_rate_limit | por aplicar | — |
| `20261008030000` seguranca_colaboradores_nif | por aplicar | — |
| `20261008050000` seguranca_search_path | por aplicar | — |
| `20261008060000` seguranca_auditoria | por aplicar | — |

As migrations anteriores a `20261008*` não foram comparadas com a produção: correr o script acima e anotar o resultado aqui. A CONFIRMAR pelo utilizador (só ele lê a produção).

---

## 8. Ao passar para o Supabase Pro

1. Authentication → proteção de senhas vazadas (HaveIBeenPwned).
2. Authentication → Sessions: duração máxima 12 h e inatividade 30 min no servidor (hoje só existe o auto-logout do browser).
3. Ativar PITR (o RPO passa de 24 h a minutos) e atualizar o RPO neste documento.
4. Aumentar a retenção de logs.
5. O backup noturno mantém-se como cópia independente do fornecedor.

---

## 9. Fora do âmbito e riscos conhecidos

- **Buckets públicos** (`rh`, `obras`, `armazem`, `frota-*`): servem fotos por URL não adivinhável, mas público — quem tiver o link vê a foto. Decisão futura: URLs assinados.
- **`audit_log`** guarda linhas completas com dados pessoais e sem retenção (ver §5).
- **CodeQL** não foi criado porque a visibilidade do repositório é desconhecida (em repositório privado exige GitHub Advanced Security). A CONFIRMAR pelo utilizador: se o repositório for público, ativar em Settings → Code security.
- **WAF, SIEM e pentest externo**: fora do âmbito; recomendável um pentest externo anual quando houver orçamento.
- **Passkeys/WebAuthn e cifra de coluna**: não implementados (decisão no desenho).
- **MFA** só é obrigatório para admin e gestor; para os restantes papéis é opcional.

---

## 10. Publicação (checklist por ordem)

1. Fazer commit do WIP em `main` e juntar a branch `seguranca-2026`. Em conflitos em `colaboradoresService`, usar `SELECT_COLABORADOR` (nunca `'*'`, nunca `nif`); depois `grep "from('colaboradores')"`, `npm run typecheck`, `npm test`, `npm run build`.
2. Push e confirmar o job "Segurança" verde no GitHub CI.
3. Merge para `main` = deploy do site. Depois: `curl -sI https://app.encivilconstroi.com` (cabeçalhos) e consola sem erros no login, mapa, faturas e `/sw-reset.html`.
4. Esperar que os telemóveis atualizem a PWA.
5. Dashboard Supabase → Authentication: registos (signups) desligados; senha com 12+ caracteres, minúsculas, maiúsculas e dígitos; TOTP (enroll + verify) ligado; `secure_password_change` (testar primeiro a alteração de senha com MFA).
6. SQL Editor, migrations por ordem: `20261008000000` → `010000` → `020000` → `030000` → `050000` → `060000` (não existe `040000`).
7. `EDGE_FUNCTION_SECRET` igual a `app.edge_function_secret` na BD (senão os e-mails de alertas param).
8. Deploy das Edge Functions `admin-utilizadores`, `extrair-fatura`, `ler-foto-abastecimento`, `pump-status`, `enviar-resumo-alertas`; depois ver os Logs.
9. Regenerar os tipos (`npx supabase gen types typescript`) e remover os remendos em `db.ts`.
10. Segredos do GitHub `SUPABASE_DB_URL` (Session pooler) e `BACKUP_AGE_PUBLIC_KEY`; a chave privada age fica offline; correr "Backup BD" uma vez.
11. Admins/gestores inscrevem o MFA; só depois um admin com aal2 liga o interruptor de obrigatoriedade.
12. Preencher a tabela de migrations (§7), decidir o CodeQL e fazer a primeira exportação manual do Storage.
