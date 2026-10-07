# Segurança e Controlo de Acesso — Controle Armazém ENCIVIL

> Última revisão: 2026-10-07 (entrega "Segurança 2026"). Operação, recuperação e incidentes: `docs/22-seguranca-operacao.md`. Auditoria anterior: 2026-06-22. Ver `TASKS/SEGURANÇA/` para o histórico de tarefas e `docs/adrs/ADR-007.md` para a decisão da correção crítica.

---

## Modelo de Segurança Atual

- Multiutilizador com 7 papéis (ver abaixo); login obrigatório (Supabase Auth, JWT)
- Senhas: mínimo 12 caracteres com maiúscula, minúscula e dígito
- **MFA (TOTP)** disponível para todos; obrigatório para `admin`/`gestor` quando o interruptor `seguranca_config.mfa_obrigatorio` está ligado (imposto na BD)
- **Auto-logout após 30 minutos de inatividade**; em cada logout limpa-se a cache de API do PWA e o `sessionStorage`; as filas offline só são enviadas por quem as criou
- RLS ativa em todas as tabelas + **GRANTs a nível de coluna** como segunda camada
- Todas as verificações de papel passam por `public.auth_role()` / `public.pode_escrever()`; um teste-guarda impede contornar
- RPCs sensíveis (`registar_movimento`, `promover_role`, `definir_mfa_obrigatorio`) verificam o papel no servidor
- Auditoria imutável (`audit_log`) em tabelas sensíveis e `eventos_seguranca` (1 ano) visíveis a admins na página Auditoria
- Rate limit nas Edge Functions; CORS com lista de origens; validação de corpo
- Backup noturno cifrado da BD (GitHub Actions) com restauro de teste
- Headers de segurança HTTP completos no Cloudflare Pages (CSP estrita, HSTS, COOP/CORP)
- `npm audit` (high, produção) e gitleaks no CI; Dependabot semanal
- Nenhuma chave secreta no frontend (só `sb_publishable_`)

---

## Modelo de Roles

Enum `role_utilizador`, 7 papéis:

| Role | Acesso |
|---|---|
| `admin` | Tudo: escrever em todos os módulos, eliminar, validar, promover/despromover papéis, ver auditoria e eventos de segurança, ligar o MFA obrigatório |
| `gestor` | Gestão e aprovação: armazém, ferramentas, combustível, obras, subempreitadas, frota, colaboradores; vê o NIF |
| `armazem` | Escreve em armazém, ferramentas e combustível |
| `medicoes` | Escreve em subempreitadas (autos/medições) |
| `mecanico` | Só Frota (escrita) |
| `motorista` | Só pede abastecimentos (aprovar é de `comb_aprovadores`) |
| `leitura` | Só consulta |

Escrita por módulo: `public.pode_escrever(modulo)`, espelhada na UI em `src/features/auth/useRole.ts` (`MATRIZ_ESCRITA`); `colaboradores` tem policy própria (admin/gestor). O NIF só é lido por admin, gestor e o próprio (RPC `colaborador_nif`; o SELECT da coluna está revogado — colunas novas em `colaboradores` precisam do seu próprio `GRANT SELECT`).

Papel em `profiles.role`. Promoção só por RPC `promover_role()` (nunca `UPDATE profiles SET role`).

**Quando o MFA obrigatório está ligado**, `auth_role()` devolve `leitura` a um `admin`/`gestor` cuja sessão não é `aal2`. Como todas as policies e RPCs usam `auth_role()`, a imposição cobre toda a BD.

**Aplicado em três camadas independentes** (defesa em profundidade):
1. **DB (RLS + GRANTs)** — a defesa real; nunca pode ser contornada pelo cliente
2. **RPC (`SECURITY DEFINER`, `SET search_path = public`, com verificação de papel)**
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
- Em todo o `SIGNED_OUT` corre `limparDadosLocais` (cache de API do service worker + `sessionStorage`); as filas offline (movimentos e picagens) guardam o `userId` e só o criador as envia (telemóveis partilhados em obra)

### MFA (TOTP)
- Registo em `/seguranca/mfa`; depois do login pede-se o código de 6 dígitos (desafio) e uma guarda leva ao registo quem tem de o ter
- Obrigatoriedade na BD: tabela `seguranca_config` (`mfa_obrigatorio`, começa **desligado**); RPC `definir_mfa_obrigatorio` (admin com aal2)
- Recuperação (telemóvel perdido): admin -> Gestão de utilizadores -> "Remover MFA". Único admin: ver `docs/22-seguranca-operacao.md` secção 2
- O plano Free do Supabase **suporta** TOTP (a nota anterior que dizia o contrário estava errada)

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

> **Histórico (2026-06):** os exemplos abaixo mostram o desenho original. Hoje as policies e RPCs usam `public.auth_role()` / `public.pode_escrever()` (migration `20261008000000`); nunca `auth.jwt()->>'role'` nem consultas diretas a `profiles`. A definição vigente está na migration mais recente que redefine cada função.

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
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; ...; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests` | Scripts injetados (XSS, supply-chain), plugins, formulários para fora |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Downgrade HTTP / MITM |
| `Cross-Origin-Opener-Policy` / `Cross-Origin-Resource-Policy` | `same-origin` | Fugas entre janelas/origens |
| `X-Frame-Options` | `DENY` | Clickjacking |
| `X-Content-Type-Options` | `nosniff` | MIME-sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Leak de URL para terceiros |
| `Permissions-Policy` | câmara/microfone/pagamentos/USB desativados; geolocalização só da própria origem | Acesso indevido a hardware |

`script-src 'self'` sem inline nem eval: o script anti-FOUC do tema está em `public/tema-inicial.js`. `style-src` mantém `'unsafe-inline'` (Radix/Recharts).

CSP permite `connect-src` apenas para `self`, `*.supabase.co` (REST/Auth/Realtime) e Sentry — nenhum outro destino de rede é usado pela app.

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
# ou a chave de papel de serviço no formato antigo) — NUNCA aqui:
SUPABASE_JWT_SECRET=...           ← PROIBIDO NO VITE
DATABASE_URL=postgresql://...     ← PROIBIDO NO VITE
```

> Variáveis com prefixo `VITE_` ficam visíveis no browser. A `anon`/`publishable` key é segura para expor — a RLS + GRANTs garantem que cada utilizador só acede ao que tem permissão. Um pre-commit hook (`.git/hooks/pre-commit`) bloqueia commits com padrões de segredo (`sb_secret-`, papel de serviço, JWTs longos).

---

## Dependências

`npm audit` (high, produção) corre no CI (job "Segurança"); Dependabot semanal. Em 2026-10: `react-router` 7.18.4; `xlsx` substituído pelo SheetJS oficial 0.20.3 (cdn.sheetjs.com), pois o pacote do npm não tem correção. Histórico anterior:
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
| XSS | React escapa HTML por defeito; sem `dangerouslySetInnerHTML`; CSP `script-src 'self'`; exportações CSV/Excel neutralizam fórmulas |
| Injeção SQL | Supabase SDK usa queries parametrizadas; RPCs usam parâmetros tipados |
| Brute-force login | Rate limiting nativo do Supabase Auth + eventos `login_falhado` + MFA |
| Abuso das Edge Functions | Rate limit por utilizador/IP, CORS com lista de origens, validação de corpo |
| Telemóvel partilhado | Limpeza de cache e `sessionStorage` no logout; filas offline por utilizador |

---

## Pendente (requer Supabase Dashboard ou ação manual)

- [ ] Confirmar "Allow new users to sign up" desativado (Authentication -> Settings)
- [ ] Política de senha no Dashboard igual à da UI (12 + maiúscula/minúscula/dígito); `secure_password_change` ligado; MFA TOTP ativado
- [ ] Aplicar as 6 migrations `20261008*` (ordem em `docs/22-seguranca-operacao.md` secção 7) e ligar `mfa_obrigatorio` depois de admins/gestores registarem o MFA
- [ ] Secrets do GitHub `SUPABASE_DB_URL` e `BACKUP_AGE_PUBLIC_KEY` (backup noturno)
- [ ] Só no plano Pro: senhas vazadas, timebox/inatividade de sessão no servidor, PITR

Resolvido no código: política de senha mínima (UI e `config.toml`), MFA (disponível no Free), HSTS e CSP estrita.

---

## Backup e Exportação

- Backup noturno cifrado (`pg_dump` dos schemas `public` e `privado`) por GitHub Actions, com restauro de teste, retenção 30 dias — ver `docs/22-seguranca-operacao.md` secção 3. Não inclui contas de `auth.users` nem ficheiros do Storage
- Exportação manual de tabelas de negócio: página `/backup` (admin)
- Fotos do Storage: exportação manual trimestral

---

## Checklist de Segurança para Deploy

- [x] RLS ativa em todas as tabelas
- [x] GRANTs a nível de coluna em `profiles` — role/email/id só-leitura para o próprio utilizador
- [x] Nenhuma chave de papel de serviço no código ou nas variáveis do Cloudflare Pages
- [x] HTTPS forçado (Cloudflare + HSTS)
- [x] Headers de segurança completos (CSP, X-Frame-Options, etc.)
- [x] Dependências sem CVEs high conhecidos (`npm audit` no CI)
- [x] Auto-logout por inatividade
- [x] Audit log para mudanças de role
- [x] Pre-commit hook contra segredos + gitleaks no CI
- [x] MFA TOTP implementado (interruptor na BD)
- [x] Backup noturno cifrado configurado no repositório (falta criar os secrets)
- [ ] Signup público desativado no Dashboard (verificar)
- [ ] Política de password reforçada no Dashboard (verificar)
- [ ] MFA obrigatório ligado para admin/gestor (depois de registarem)
