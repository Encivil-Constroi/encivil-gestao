# Segurança e Controlo de Acesso — Controle Armazém ENCIVIL

> Última auditoria completa: 2026-06-22. Ver `TASKS/SEGURANÇA/` para o histórico de tarefas e `docs/adrs/ADR-007.md` para a decisão da correção crítica.

---

## Modelo de Segurança Atual

- Multiutilizador com dois roles: `admin` e `gestor`
- Login obrigatório (Supabase Auth, JWT) para qualquer funcionalidade
- **Auto-logout após 30 minutos de inatividade** — compensa a ausência de MFA no plano atual do Supabase
- RLS ativa em todas as tabelas + **GRANTs a nível de coluna** como segunda camada (mais forte que RLS para certos casos — ver abaixo)
- RPCs sensíveis (`registar_movimento`, `promover_role`) verificam role no servidor, independente do frontend
- `audit_log` regista mudanças de role
- Headers de segurança HTTP completos no Vercel (CSP, HSTS, etc.)
- Zero vulnerabilidades conhecidas nas dependências (`npm audit` limpo)
- Nenhuma chave secreta exposta no frontend (só `anon`/`publishable`)

---

## Modelo de Roles

| Role | Acesso |
|---|---|
| `admin` | Tudo: CRUD produtos, configurações, promover/despromover roles, ver audit log, registar movimentos |
| `gestor` | Dashboard, produtos (leitura), histórico, relatórios, registar movimentos. **Sem** acesso a configurações nem CRUD de produtos |

Role é definido em `profiles.role` (enum `role_utilizador`). Novo signup recebe `gestor` por defeito (mínimo privilégio) — promoção a `admin` é manual via RPC `promover_role()`.

**Aplicado em três camadas independentes** (defesa em profundidade — cada uma funciona mesmo que as outras falhem):
1. **DB (RLS + GRANTs)** — a defesa real; nunca pode ser contornada pelo cliente
2. **RPC (`SECURITY DEFINER` com verificação de role)** — para operações que precisam de lógica transacional
3. **Frontend (`RoleGuard`, UI condicional)** — só UX; nunca é a única defesa

---

## Autenticação

### Supabase Auth

**Fluxo:**
1. Utilizador submete e-mail + palavra-passe em `/login`
2. Supabase Auth valida credenciais
3. Supabase devolve JWT (access_token + refresh_token)
4. Token guardado pelo SDK Supabase
5. Todas as chamadas à API incluem o token no header `Authorization`
6. RLS valida o token em cada operação na base de dados

**Proteção de rotas:**
- `AuthGuard` (`src/features/auth/AuthGuard.tsx`) bloqueia qualquer rota sem sessão ativa, redireciona para `/login`
- `RoleGuard` (`src/features/auth/RoleGuard.tsx`) bloqueia rotas que exigem role específico (ex: `/configuracoes` exige `admin`)

**Auto-logout por inatividade:**
- Implementado em `AuthContext.tsx` — escuta `mousedown`, `mousemove`, `keydown`, `touchstart`, `scroll`
- 30 minutos sem atividade → `supabase.auth.signOut()` + toast informativo
- Reduz a janela de exposição se um dispositivo for deixado desbloqueado ou roubado

---

## Falha Crítica Corrigida — Auto-promoção a Admin (2026-06-22)

**O que era:** A policy `profiles_update_own` (`USING (auth.uid() = id)`) permitia que qualquer utilizador autenticado alterasse a sua própria linha em `profiles` — **sem restringir colunas**. Um `gestor` podia correr:
```js
await supabase.from('profiles').update({ role: 'admin' }).eq('id', meuId)
```
e tornar-se admin instantaneamente, via chamada de API normal com a `anon` key (que é suposto estar exposta — o problema era a RLS não bloquear). Combinado com signup público (se ativo), isto seria um caminho completo de "qualquer pessoa na internet → admin total" sem exploit sofisticado.

**Fix (`20260622000001_fix_profiles_privilege_escalation.sql`):**
```sql
-- GRANT a nível de coluna — mais forte que RLS para este caso,
-- porque não depende de nenhuma condição em USING/WITH CHECK
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (nome) ON public.profiles TO authenticated;

-- INSERT direto também revogado — só o trigger SECURITY DEFINER cria perfis
REVOKE INSERT ON public.profiles FROM authenticated;
```

Resultado verificado em produção: `authenticated` só tem `UPDATE` na coluna `nome`. `role`, `email`, `id` são só-leitura para qualquer utilizador, independentemente de qualquer policy RLS futura mal escrita.

**Caminho legítimo para mudar role:** RPC `promover_role(p_user_id, p_novo_role)` — `SECURITY DEFINER`, verifica que o chamador já é `admin`, escreve em `audit_log`, bloqueia auto-despromoção.

---

## Políticas RLS Atuais

### Tabela: profiles

```sql
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);
```
> A defesa real aqui não é a policy — é o GRANT a nível de coluna (ver secção acima). A policy por si só permitiria mudar qualquer coluna; o GRANT impede.

### Tabela: produtos

```sql
CREATE POLICY "produtos_select_auth"  ON produtos FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "produtos_insert_admin" ON produtos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "produtos_update_admin" ON produtos FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "produtos_delete_admin" ON produtos FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
```

### Tabela: movimentos_stock

```sql
CREATE POLICY "movimentos_select_auth" ON movimentos_stock FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "movimentos_insert_admin_gestor" ON movimentos_stock FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'gestor')));

-- Sem UPDATE/DELETE — imutável, mesmo para admin
```

> A RPC `registar_movimento` é `SECURITY DEFINER` e por isso bypassa RLS — tem a sua **própria** verificação de role no corpo da função (ver `docs/03-modelo-de-dados.md`). A policy de INSERT acima é um fallback de defesa em profundidade, caso alguém tente inserir diretamente na tabela sem passar pela RPC.

### Tabela: configuracoes_empresa

```sql
CREATE POLICY "config_select_auth"  ON configuracoes_empresa FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "config_update_admin" ON configuracoes_empresa FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
```

### Tabela: audit_log

```sql
CREATE POLICY "audit_log_select_admin" ON audit_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
-- Sem INSERT/UPDATE/DELETE para authenticated — só RPCs SECURITY DEFINER escrevem
```

---

## Headers de Segurança HTTP (`public/_headers`)

Aplicados a todas as rotas desde 2026-06-22 (originalmente em `vercel.json`;
migrados para a convenção do Cloudflare Pages, `public/_headers`, quando o
deploy saiu da Vercel — ver `docs/09-implantacao.md`):

| Header | Valor | Protege contra |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; ...` | Scripts de terceiros injetados (supply-chain, XSS) |
| `X-Frame-Options` | `DENY` | Clickjacking |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Downgrade HTTP / MITM |
| `X-Content-Type-Options` | `nosniff` | MIME-sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Leak de URL para terceiros |
| `Permissions-Policy` | câmara/microfone/geo desativados | Acesso indevido a hardware |

CSP permite `connect-src` apenas para `self` e `*.supabase.co` (REST/Auth/Realtime) — nenhum outro destino de rede é usado pela app.

---

## Variáveis de Ambiente

### O que usar no frontend

```env
VITE_SUPABASE_URL=https://wuruhxmbueeyhiqgvlxu.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

### O que NUNCA colocar no frontend

```env
# A chave de administrador da DB (prefixo sb_secret- no Supabase atual,
# ou a service-role key no formato antigo) — NUNCA aqui:
SUPABASE_JWT_SECRET=...           ← PROIBIDO NO VITE
DATABASE_URL=postgresql://...     ← PROIBIDO NO VITE
```

> Variáveis com prefixo `VITE_` ficam visíveis no browser. A `anon`/`publishable` key é segura para expor — a RLS + GRANTs garantem que cada utilizador só acede ao que tem permissão. Um pre-commit hook (`.git/hooks/pre-commit`) bloqueia commits com padrões de segredo (`sb_secret-`, `service-role`, JWTs longos).

---

## Dependências

`npm audit` limpo desde 2026-06-22. Histórico de correções:
- `react-router` 7.13.0 → 7.18.0 (corrigia RCE não-autenticado CVSS 8.1, XSS, open redirect, DoS)
- `vite` 6.3.5 → 6.4.3 (corrigia path traversal / leitura arbitrária de ficheiros)

Recomendação: correr `npm audit` periodicamente, idealmente em CI.

---

## Cuidados de Segurança

| Risco | Mitigação |
|-------|-----------|
| Acesso sem autenticação | RLS ativa + `AuthGuard` |
| Privilege escalation via update direto | GRANT a nível de coluna em `profiles` (ver secção acima) |
| Exposição de chaves secretas | Apenas `anon` key no frontend; pre-commit hook bloqueia segredos |
| Apagar dados de auditoria | Sem policy DELETE/UPDATE em `movimentos_stock` |
| Stock negativo | CHECK constraint na BD + validação na RPC |
| Clickjacking | `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` |
| Supply-chain (dependência comprometida) | CSP `script-src 'self'` restringe execução a scripts do próprio domínio |
| Dispositivo roubado/desbloqueado | Auto-logout após 30 min de inatividade |
| XSS | React escapa HTML por defeito; `dangerouslySetInnerHTML` usado só em `HelpPage.tsx` com conteúdo estático hardcoded (sem input de utilizador) |
| Injeção SQL | Supabase SDK usa queries parametrizadas; RPCs usam parâmetros tipados |
| Brute-force login | Rate limiting nativo do Supabase Auth |

---

## Pendente (requer Supabase Dashboard, não código)

- [ ] Confirmar "Allow new users to sign up" desativado (Authentication → Settings) — fecha o vetor de signup público
- [ ] Política de password mínima 10-12 caracteres (Authentication → Settings → Password requirements)
- [ ] MFA (TOTP) — indisponível no plano atual, requer Supabase Pro

---

## Backup e Exportação

- Supabase faz backup automático diário (plano Pro)
- Recomendado exportar `movimentos_stock` periodicamente em CSV como backup adicional
- No plano atual: exportação manual via Supabase Table Editor → Download CSV

---

## Checklist de Segurança para Deploy

- [x] RLS ativa em todas as tabelas
- [x] GRANTs a nível de coluna em `profiles` — role/email/id só-leitura para o próprio utilizador
- [x] Nenhuma `service-role` key no código ou variáveis de ambiente Vercel
- [x] HTTPS forçado (Vercel + HSTS)
- [x] Headers de segurança completos (CSP, X-Frame-Options, etc.)
- [x] Dependências sem CVEs conhecidos
- [x] Auto-logout por inatividade
- [x] Audit log para mudanças de role
- [x] Pre-commit hook contra segredos
- [ ] Signup público desativado no Dashboard (verificar)
- [ ] Política de password reforçada no Dashboard (verificar)
- [ ] MFA para contas admin (bloqueado por plano)
