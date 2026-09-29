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
3. Aplicar **todas** as migrations de `supabase/migrations/` em ordem cronológica.
   Hoje isto é feito manualmente no SQL Editor do Dashboard (o CLI não tem
   login com a conta da organização — ver Etapa 3 de
   `docs/plano-seguranca-desempenho.md`); quando o login estiver feito:
   ```bash
   supabase db push
   ```
4. Depois de aplicar migrations que mudem o schema, regenerar os tipos:
   ```bash
   npx supabase gen types typescript --project-id <project-ref> > src/integrations/supabase/types.ts
   ```

## 2. Configurar Autenticação Supabase

1. Supabase Dashboard → Authentication → Settings
2. **Verificar que "Allow new users to sign up" está desativado** — contas só são criadas via convite (Authentication → Users → Invite user)
3. Promover um utilizador a `admin` via a RPC `promover_role()`, autenticado
   como um admin existente — nunca por `UPDATE` direto: a coluna `role` em
   `profiles` está bloqueada por GRANT a nível de coluna desde 2026-06-22
4. Reforçar política de password (Authentication → Settings → Password requirements): mínimo 10-12 caracteres
5. MFA (TOTP): requer plano Supabase Pro — a confirmar se já ativo (ver `docs/13-infraestrutura-e-contas.md`)

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

## 6. Configuração Inicial do Sistema (novo ambiente)

Após o primeiro deploy, aceder ao sistema e:

1. Fazer login com as credenciais criadas
2. Aceder a Configurações e preencher os dados da empresa
3. Aceder a Produtos e criar o catálogo inicial de materiais
4. Registar o stock atual de cada produto através de movimentos de entrada
   (ou ajustes com observação "Stock inicial")

---

## Checklist de Produção (estado em 2026-09-29)

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
- [ ] MFA (TOTP) nas contas de acesso — a confirmar (`docs/13-infraestrutura-e-contas.md`)

### Funcionalidades
- [x] Login/logout, RBAC por papel (RLS, não só UI)
- [x] Armazém, obras, subempreiteiros, ferramentas, combustível, RH/picagens, EPIs, faturas por IA
- [x] PWA instalável (iOS + Android), notificações push
- [x] CI (typecheck + build + testes) em cada push/PR — `.github/workflows/ci.yml`

### Operacional — pendente (ver `docs/13-infraestrutura-e-contas.md`)
- [ ] Backup completo da base de dados (nunca foi feito — depende do login do CLI)
- [ ] 2FA + gestor de passwords + envelope de emergência para a Direção
- [ ] Domínio próprio (`app.encivil.pt`) ligado ao Cloudflare Pages
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
- **Nenhum backup automático da base de dados até 2026-09-29** — plano
  Supabase atual não confirmado como Pro. Ver `docs/13-infraestrutura-e-contas.md`
  para o estado e o que falta decidir com a Direção
- Exportação manual disponível em `/backup` (admin) — cobre as tabelas de
  negócio principais; não substitui um backup de banco completo

### Atualizações
1. Fazer alterações em branch de feature
2. Testar localmente (`npm run typecheck`, `npm test`, `npm run build`)
3. Abrir Pull Request — a Action `pr-review.yml` corre um code review automático
4. Merge para `main` → deploy automático no Cloudflare Pages
