# Implantação — ENCIVIL Gestão

> **Estado: já implantado.** URL de produção: `https://encivil-gestao.pages.dev`.
> Este documento serve para reproduzir o setup ou recuperar de um desastre —
> não é um plano futuro. Reescrito em 2026-09-29 para refletir o deploy atual
> (Cloudflare Pages); a versão anterior descrevia a Vercel, entretanto
> abandonada — ver `docs/11-transferencia-titularidade.md`.

Para o inventário de contas, segredos e assinaturas (quem tem acesso a quê,
onde vive cada chave), ver `docs/13-infraestrutura-e-contas.md`. Este
documento cobre só os passos técnicos de implantação.

---

## Pré-requisitos

- Conta Supabase (org da empresa)
- Conta Cloudflare (Pages)
- Repositório GitHub (`Encivil-Constroi/encivil-gestao`)
- Node.js 22+ (CI usa Node 24 LTS) e npm — **não pnpm**: o projeto usa
  `package-lock.json`, apesar de existir um `pnpm-workspace.yaml` legado nalgumas
  cópias antigas do repositório (removido em 2026-09-29)

---

## 1. Configurar Projeto Supabase (já feito — para novo ambiente)

1. Aceder a [supabase.com](https://supabase.com) e criar novo projeto
2. Anotar: **Project URL** e a chave pública `sb_publishable_...` (em Settings → API).
   **Automatically expose new tables** vem OFF por definição — todas as
   migrations deste projeto incluem `GRANT` explícitos (ver `CLAUDE.md`)
3. Aplicar **todas** as migrations de `supabase/migrations/` (101 ficheiros em 2026-11-12) em ordem cronológica.
   Hoje isto é feito manualmente no SQL Editor do Dashboard (o CLI não tem
   login com a conta da organização — ver Etapa 3 de
   `docs/plano-seguranca-desempenho.md`); quando o login estiver feito:
   ```bash
   supabase db push
   ```
4. Depois de aplicar migrations que mudem o schema, regenerar os tipos **pelo Git Bash** (o `>` do PowerShell 5.1 grava `types.ts` em UTF-16) e correr `npm run typecheck`:
   ```bash
   npx supabase gen types typescript --local > src/integrations/supabase/types.ts   # ou --project-id <project-ref>
   ```

## 2. Configurar Autenticação Supabase

1. Supabase Dashboard → Authentication → Settings
2. **Verificar que "Allow new users to sign up" está desativado** — contas só são criadas via convite (Authentication → Users → Invite user)
3. Promover um utilizador a `admin` via a RPC `promover_role()`, autenticado
   como um admin existente — nunca por `UPDATE` direto: a coluna `role` em
   `profiles` está bloqueada por GRANT a nível de coluna desde 2026-06-22
4. Reforçar política de password (Authentication → Settings → Password requirements): mínimo 10-12 caracteres
5. MFA (TOTP): funciona no plano Free (ver `docs/22-seguranca-operacao.md` §2); confirmar nas definições de Authentication que o TOTP (enroll + verify) está ligado

## 3. Configurar RLS

Já aplicado via migrations. Para verificar:
```sql
-- Deve retornar true para cada tabela
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';
```

RLS por si só não chega — o Postgres verifica primeiro o GRANT de base. Ver
"Segurança RLS — padrão correto" (`public.auth_role()`, nunca
`auth.jwt()->>'role'`) e a regra de GRANTs em `CLAUDE.md`.

## 4. Configurar Variáveis de Ambiente

### Para desenvolvimento local

```bash
cp .env.example .env.local
```

Editar `.env.local`:
```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_SENTRY_DSN=            # opcional; vazio desativa o Sentry em dev
```

Sem `.env.local` válido, `src/integrations/supabase/client.ts` cai num
fallback com as credenciais de produção embutidas (são públicas por natureza;
a segurança real é a RLS) — ver comentário no ficheiro.

### Para Cloudflare Pages (produção)

1. Cloudflare Dashboard → Workers & Pages → o projeto → Settings → Environment variables
2. Adicionar (ambiente **Production**, e Preview se aplicável):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SENTRY_DSN` (opcional)
   - `VITE_VAPID_PUBLIC_KEY` (notificações push)

**Cuidado ao colar:** o formato do campo é só o valor — colar `NOME=valor`
dentro do campo *valor* já causou "Invalid API key" em produção (ver
`docs/13-infraestrutura-e-contas.md` e `docs/11-transferencia-titularidade.md`).

## 5. Deploy no Cloudflare Pages

### Primeira vez

1. Cloudflare Dashboard → Workers & Pages → Create → **Pages** → Connect to Git
2. Autorizar a org GitHub `Encivil-Constroi`, escolher o repo `encivil-gestao`
3. Framework preset: **Vite**
4. Build command: `npm run build`
5. Output directory: `dist`
6. Adicionar as variáveis de ambiente (passo 4)
7. Deploy

### Deploys subsequentes

Push para a branch `main` dispara deploy automático. O hook `pre-push`
(`.githooks/pre-push`) já corre `npm run build` localmente antes de deixar o
push sair — um erro de build é apanhado em segundos, não só depois no
Cloudflare.

Os headers de segurança (CSP, X-Frame-Options, cache) vêm de
`public/_headers` (convenção do Cloudflare Pages) — não precisam de
configuração manual no Dashboard. Ver `docs/05-seguranca-e-acesso.md`.

### Se aparecer "Failed to fetch dynamically imported module"

O projeto usa `lazy()` por rota desde 28/07/2026 (ver ADR-010, que reverteu a
ADR-008). O risco de "stale chunk" pós-deploy é mitigado por
`UpdatePrompt.tsx`: deteta a nova versão do service worker e faz uma
navegação completa (`location.href = '/'`, não `location.reload()`) só depois
de o novo SW assumir controlo — evita servir um `index.html` antigo a apontar
para chunks que já não existem. Se ainda assim acontecer, recarregar a página
resolve; reportar o caso para investigar (não deve ser frequente).

---

## Ordem de publicação (regra fixa)

**Site → migrations → Edge Functions.** O site novo tem de funcionar com a BD antiga (RPC ou tabela inexistente ⇒ comportamento de antes);
as migrations aplicam-se à mão no SQL Editor, por ordem cronológica; as Edge Functions publicam-se no fim.
Exemplo: a `20261028120100` retira colunas do SELECT de `colaboradores`, por isso só se aplica depois de o site novo estar no ar.

1. Merge para `main` (CI verde) ⇒ deploy automático no Cloudflare Pages. Confirmar o deploy e a consola sem erros.
2. Migrations, fora do horário de trabalho. Várias levam `SET lock_timeout = '5s'` (falham depressa se houver tráfego a segurar o lock;
   são idempotentes e repete-se noutro momento). Cada migration nova termina com um bloco `-- ROLLBACK` (SQL comentado). A tabela do que
   está aplicado mantém-se em `docs/22-seguranca-operacao.md` §7; para comparar com a produção: `node supabase/scripts/verificar-migrations.mjs aplicadas.txt`.
3. Tipos: `npx supabase gen types typescript --local > src/integrations/supabase/types.ts` **pelo Git Bash**, depois `npm run typecheck`.
4. Edge Functions (`admin-utilizadores`, `enviar-resumo-alertas`, `extrair-fatura`, `ler-foto-abastecimento`, `notificar-abastecimento`,
   `pump-status`, `send-push-frota`): só as alteradas; ver os Logs. `pump-status`, `notificar-abastecimento`, `send-push-frota` e `enviar-resumo-alertas` têm `verify_jwt = false` (`supabase/config.toml`): quem as chama é a BD ou o Shelly, com segredo próprio; publicadas pelo CLI sem esta definição devolvem 401.

`npm run dev` liga à BD de **produção** quando `.env.local` está vazio (fallback em `client.ts`): só leitura. Desde 2026-11 (`src/integrations/supabase/config.ts`),
se `VITE_SUPABASE_URL`/chave estiverem preenchidas mas inválidas em dev, o arranque falha em vez de cair em produção; para uma stack local
aceita-se `http(s)://localhost` ou `127.0.0.1`.

## 6. Configuração Inicial do Sistema (novo ambiente)

Após o primeiro deploy, aceder ao sistema e:

1. Fazer login com as credenciais criadas
2. Aceder a Configurações e preencher os dados da empresa
3. Aceder a Produtos e criar o catálogo inicial de materiais
4. Registar o stock atual de cada produto através de movimentos de entrada
   (ou ajustes com observação "Stock inicial")

---

## Checklist de Produção (estado em 2026-09-29; revisto 2026-11-12 — o que é manual da Direção fica por confirmar)

### Base de dados
- [x] Todas as migrations aplicadas (o histórico completo está em `supabase/migrations/`)
- [x] RLS ativa em todas as tabelas, com GRANTs explícitos (Etapa 1 do plano de segurança)
- [x] GRANTs a nível de coluna em `profiles` (role/email/id só-leitura)
- [ ] Produção e repositório 100% alinhados — **divergem** (ex.: `criar_guia_transporte`
      não existe em produção); resolve-se na Etapa 3 do plano (login do CLI)

### Segurança
- [x] Apenas a chave pública `sb_publishable_...` no frontend, nunca `sb_secret_...`
- [x] Variáveis de ambiente configuradas no Cloudflare Pages
- [x] HTTPS + HSTS a funcionar
- [x] Headers de segurança completos (CSP, X-Frame-Options, etc. — `public/_headers`)
- [x] RPCs SECURITY DEFINER e Edge Functions fechadas a `anon` sem guarda (auditoria 2026-09-29)
- [ ] MFA (TOTP): implementado (`/seguranca/mfa`); confirmar que admins e gestores o registaram e que `seguranca_config.mfa_obrigatorio` está ligado (`docs/22-seguranca-operacao.md` §2)

### Funcionalidades
- [x] Login/logout, RBAC por papel (RLS, não só UI)
- [x] Armazém, obras, subempreiteiros, ferramentas, combustível, RH/picagens, EPIs, faturas por IA
- [x] PWA instalável (iOS + Android), notificações push
- [x] CI em cada push/PR — `.github/workflows/ci.yml`: TypeScript (typecheck + lint) → Build; Tests (Vitest + Deno); Segurança (`npm audit` + gitleaks)

### Operacional — pendente (ver `docs/13-infraestrutura-e-contas.md`)
- [ ] Backup completo da base de dados: o workflow `.github/workflows/backup-bd.yml` (noturno, cifrado com `age`, restauro de teste) existe desde 2026-10-07; confirmar que os segredos `SUPABASE_DB_URL` e `BACKUP_AGE_PUBLIC_KEY` estão configurados e que há um artefacto recente (`docs/22-seguranca-operacao.md` §3)
- [ ] 2FA + gestor de passwords + envelope de emergência para a Direção
- [x] Domínio `app.encivilconstroi.com` ligado ao Cloudflare Pages (2026-09-30); `app.encivil.pt` não criado
- [ ] Projeto Vercel antigo desligado

---

## Manutenção

### Monitorização
- Supabase Dashboard → Database → Performance (queries lentas)
- Supabase Dashboard → Edge Functions → Logs (erros e tempos — ver os logs de
  `ler-foto-abastecimento` para o formato de linha de medição)
- Sentry (`VITE_SENTRY_DSN`) → erros do frontend em produção
- Cloudflare Pages → Deployments (histórico de builds, tempo, logs)

### Backups
- Backup automático: workflow `Backup BD` (ver checklist acima e `docs/22-seguranca-operacao.md` §3); até 2026-09-29 não havia nenhum — plano
  Supabase atual não confirmado como Pro. Ver `docs/13-infraestrutura-e-contas.md`
  para o estado e o que falta decidir com a Direção
- Exportação manual disponível em `/backup` (admin) — cobre as tabelas de
  negócio principais; não substitui um backup de banco completo

### Atualizações
1. Fazer alterações em branch de feature
2. Testar localmente (`npm run typecheck`, `npm test`, `npm run build`; Edge: `npm run check:edge && npm run test:edge`). O hook `pre-commit` faz scan de segredos e typecheck; nunca `--no-verify`
3. Abrir Pull Request — a Action `pr-review.yml` corre um code review automático
4. Merge para `main` → deploy automático no Cloudflare Pages
