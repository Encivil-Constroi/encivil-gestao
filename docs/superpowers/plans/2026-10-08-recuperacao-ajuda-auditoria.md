# Recuperação de acesso, Ajuda e Auditoria — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recuperação de acesso por link do admin (WhatsApp) e email com entrada direta; Ajuda por perfil com instalação PWA; Auditoria legível com filtros e Excel.

**Architecture:** 5 tarefas com ficheiros disjuntos, executadas em paralelo (uma vaga). Lógica em funções puras testadas; Edge Function com validação por esquema; uma migration pequena opcional (site funciona sem ela).

**Tech Stack:** React 18 + Vite + TS strict, Supabase (Auth Admin API `generateLink`, Edge Deno, PGlite), Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-08-recuperacao-ajuda-auditoria-design.md`

## Global Constraints

- Ler `CLAUDE.md`. Sem `as any`; `useAsync`/`useMutation` para dados; regra de negócio fora dos componentes; pt-PT na UI; datas `Europe/Lisbon`.
- NÃO fazer commit; NÃO aplicar migrations nem deploy; NÃO criar/alterar dados reais (`npm run dev` é produção).
- Outros agentes editam outros ficheiros em paralelo: tocar **só** nos ficheiros da tarefa. Se o typecheck falhar só em ficheiros alheios, reportar.
- Site funciona com a BD antiga: falha de `_registar_evento` nunca bloqueia (`.then(() => {}, () => {})`).
- Ação nova da Edge Function: só admin (a verificação `auth_role() === 'admin'` já existente cobre todas as ações), esquema em `ESQUEMAS_PAYLOAD`, nome em `ACOES`.
- Migrations novas: idempotentes e terminam com bloco `-- ROLLBACK` (há teste-guarda).
- Texto da mensagem WhatsApp (verbatim): `Olá ${primeiroNome}, para criar a sua nova palavra-passe da ENCIVIL Gestão abra este link (pessoal, válido cerca de 1 hora):\n${link}`.
- Tipos de evento novos (verbatim): `link_recuperacao_admin`, `senha_redefinida_admin`. Rótulos: "Link de recuperação gerado pelo administrador", "Senha redefinida pelo administrador".

## Review Focus

1. Admin gera link para um utilizador sem telemóvel → diálogo abre com número vazio e o botão "Copiar link" funciona.
2. Funcionário abre um link já usado/expirado → mensagem clara e caminho de volta, nunca ecrã branco nem spinner eterno.
3. iPhone com a app já instalada (standalone) → a Ajuda diz "A app já está instalada", sem passos.
4. Registo de auditoria antigo (`role_change`, `validar_auto`, ações sem `tabela.op`) ou `details` nulo → frase de fallback, sem erro.
5. Filtro de período "hoje" à 00:30 de Lisboa no horário de verão → inclui registos desde 00:00 de Lisboa (não UTC).

---

## Vaga única (paralelo): R1, R2, R3, H1, A1

### Task R1: Edge Function `linkRecuperacao` + eventos + migration

**Files:**
- Modify: `supabase/functions/admin-utilizadores/index.ts`, `supabase/functions/admin-utilizadores/regras.ts`, `supabase/functions/admin-utilizadores/regras_test.ts`
- Create: `supabase/migrations/20261008090000_eventos_recuperacao.sql`, `supabase/tests/eventos-recuperacao.test.mjs`

**Interfaces:**
- Produces (HTTP): `action: 'linkRecuperacao'`, payload `{ userId }` → `{ link: string, nome: string, telemovel: string | null, login: string | null, email: string }`.
- Produces (Deno): `mensagemRecuperacao(nome: string, link: string): string` em `regras.ts`.

- [ ] **Step 1: Failing tests**
  `regras_test.ts`:

```ts
Deno.test('mensagemRecuperacao usa o primeiro nome e o link', () => {
  assertEquals(mensagemRecuperacao('  Rui Silva ', 'https://x/y'),
    'Olá Rui, para criar a sua nova palavra-passe da ENCIVIL Gestão abra este link (pessoal, válido cerca de 1 hora):\nhttps://x/y')
})
Deno.test('mensagemRecuperacao sem nome', () => {
  assertEquals(mensagemRecuperacao('', 'L').startsWith('Olá, para criar'), true)
})
```

  `supabase/tests/eventos-recuperacao.test.mjs` (copiar o arranque de `supabase/tests/contabilidade.test.mjs`; usar o superuser `db.query`):

```js
it('aceita os tipos novos', async () => {
  for (const t of ['link_recuperacao_admin', 'senha_redefinida_admin']) {
    await db.query(`SELECT public._registar_evento($1, NULL, '{}'::jsonb)`, [t])
  }
  const { rows } = await db.query(`SELECT tipo FROM public.eventos_seguranca WHERE tipo LIKE '%admin'`)
  expect(rows.map(r => r.tipo)).toEqual(expect.arrayContaining(['link_recuperacao_admin', 'senha_redefinida_admin']))
})
it('tipo desconhecido continua a falhar', async () => {
  await expect(db.query(`INSERT INTO public.eventos_seguranca (tipo) VALUES ('xpto')`)).rejects.toThrow(/check/i)
})
```

- [ ] **Step 2:** `npm run test:edge` e `npx vitest run supabase/tests/eventos-recuperacao.test.mjs` → FAIL.
- [ ] **Step 3: Implement**
  `regras.ts`:

```ts
export function mensagemRecuperacao(nome: string, link: string): string {
  const primeiro = nome.trim().split(/\s+/)[0] ?? ''
  const saud = primeiro ? `Olá ${primeiro}` : 'Olá'
  return `${saud}, para criar a sua nova palavra-passe da ENCIVIL Gestão abra este link (pessoal, válido cerca de 1 hora):\n${link}`
}
```

  `index.ts`: acrescentar `'linkRecuperacao'` a `ACOES`; `linkRecuperacao: { userId: { tipo: 'uuid', obrigatorio: true } }` em `ESQUEMAS_PAYLOAD`; handler:

```ts
  if (action === 'linkRecuperacao') {
    const { userId } = payload as { userId: string }
    const { data: u, error: gErr } = await admin.auth.admin.getUserById(userId)
    if (gErr || !u?.user?.email) return err('Utilizador não encontrado', 404)
    const email = u.user.email
    const { data: l, error: lErr } = await admin.auth.admin.generateLink({
      type: 'recovery', email, options: { redirectTo: `${APP_URL}/reset-password` },
    })
    const link = l?.properties?.action_link
    if (lErr || !link) return err(traduzErroAuth(lErr?.message ?? 'Não foi possível gerar o link'), 500)
    const { data: p } = await admin.from('profiles').select('nome, telemovel').eq('id', userId).maybeSingle()
    await admin.rpc('_registar_evento', {
      p_tipo: 'link_recuperacao_admin', p_utilizador: userId, p_detalhe: { por: dadosUser.user.id },
    }).then(() => {}, () => {})
    return ok({ link, nome: p?.nome ?? email.split('@')[0], telemovel: p?.telemovel ?? null, login: loginDeEmail(email), email })
  }
```

  Em `redefinirSenha`, depois do sucesso: `await admin.rpc('_registar_evento', { p_tipo: 'senha_redefinida_admin', p_utilizador: userId, p_detalhe: { por: dadosUser.user.id } }).then(() => {}, () => {})`.

  Migration:

```sql
-- Eventos de segurança da recuperação de acesso pelo administrador.
ALTER TABLE public.eventos_seguranca DROP CONSTRAINT IF EXISTS eventos_seguranca_tipo_check;
ALTER TABLE public.eventos_seguranca ADD CONSTRAINT eventos_seguranca_tipo_check CHECK (tipo IN (
  'login_ok','login_falhado','mfa_registado','mfa_removido','mfa_removido_admin','mfa_falhado','rate_limit',
  'link_recuperacao_admin','senha_redefinida_admin'));

-- ROLLBACK
-- ALTER TABLE public.eventos_seguranca DROP CONSTRAINT IF EXISTS eventos_seguranca_tipo_check;
-- ALTER TABLE public.eventos_seguranca ADD CONSTRAINT eventos_seguranca_tipo_check CHECK (tipo IN (
--   'login_ok','login_falhado','mfa_registado','mfa_removido','mfa_removido_admin','mfa_falhado','rate_limit'));
```
  (Confirmar o nome real do constraint no PGlite: `SELECT conname FROM pg_constraint WHERE conrelid='public.eventos_seguranca'::regclass`; se for outro, usar esse.)
- [ ] **Step 4:** `npm run check:edge`, `npm run test:edge`, `npx vitest run supabase/tests` (inteiro) → PASS.

### Task R2: Página de nova senha (entra direto, guarda senha)

**Files:**
- Modify: `src/app/pages/ResetPasswordPage.tsx`, `src/app/pages/LoginPage.tsx` (só o texto do ecrã "Esqueceu a palavra-passe?")
- Test: `src/__tests__/pages/resetPassword.test.tsx` (criar; se já existir teste da página, estender)

**Interfaces:** Consumes `loginDeEmail` de `@/features/auth/lib/contaInterna`, `mensagemSenha/validarSenha/DICA_SENHA` de `@/features/auth/lib/politicaSenha`.

- [ ] **Step 1: Failing tests** (mock `@/integrations/supabase/client` com `auth.onAuthStateChange`, `auth.getSession`, `auth.updateUser`, `auth.signOut`; mock `react-router` `useNavigate`):
  1. Evento `PASSWORD_RECOVERY` com sessão `{ user: { email: '900@contas.encivilconstroi.com' } }` → mostra "Conta: 900".
  2. Senha válida `Abcdefgh1234` nos dois campos → `updateUser({ password })` chamado; `signOut` **não** chamado; `navigate('/', { replace: true })`.
  3. Sem evento em 4 s (fake timers) → texto `O link expirou ou já foi usado` e botão "Voltar ao login".
  4. Existe input `autocomplete="username"` com o email da conta e os campos de senha têm `autocomplete="new-password"`.
- [ ] **Step 2:** `npx vitest run src/__tests__/pages/resetPassword.test.tsx` → FAIL.
- [ ] **Step 3: Implement**
  - Ao receber `PASSWORD_RECOVERY` (callback recebe `(event, session)`), guardar `session?.user.email` em estado.
  - Mostrar `Conta: {loginDeEmail(email) ?? email}` acima do formulário.
  - Dentro do `<form>`: `<input type="text" name="username" autoComplete="username" value={email} readOnly className="sr-only" tabIndex={-1} aria-hidden="true" />`; campos de senha com `name="new-password"` e `autoComplete="new-password"`.
  - Sucesso:

```ts
    await guardarCredencial(email, password)
    toast.success('Palavra-passe guardada. Bem-vindo de volta!')
    navigate('/', { replace: true })
```
    com, no mesmo ficheiro (fora do componente):

```ts
// Chrome/Edge: oferece guardar no gestor de palavras-passe; outros navegadores usam o autocomplete do formulário
async function guardarCredencial(id: string, password: string): Promise<void> {
  const PC = (window as unknown as { PasswordCredential?: new (d: { id: string; password: string }) => Credential }).PasswordCredential
  if (!PC || !navigator.credentials?.store) return
  try { await navigator.credentials.store(new PC({ id, password })) } catch { /* utilizador recusou ou sem suporte */ }
}
```
    Remover o `await supabase.auth.signOut()` e o estado `done` se deixar de ser usado.
  - Estado `invalid`: título "Link inválido", texto `O link expirou ou já foi usado. Peça um novo ao administrador ou use "Esqueceu a palavra-passe?" se tiver email.`, botão "Voltar ao login" → `navigate('/login')`.
  - `LoginPage`, ecrã de recuperação: texto de ajuda `Tem email na conta? Receba o link aqui. Entra com utilizador (sem email)? Peça ao administrador um link de recuperação.`
- [ ] **Step 4:** testes PASS + `npm run typecheck`.

### Task R3: Gestão de utilizadores — "Link de recuperação"

**Files:**
- Create: `src/features/auth/lib/recuperacao.ts`, `src/__tests__/features/auth/recuperacao.test.ts`
- Modify: `src/features/auth/services/utilizadoresService.ts`, `src/features/auth/hooks/useUtilizadores.ts`, `src/app/components/EnviarWhatsAppDialog.tsx`, `src/app/pages/GestaoUtilizadoresPage.tsx`
- Test: estender `src/__tests__/pages/gestaoUtilizadores.test.tsx`, `src/__tests__/components/EnviarWhatsAppDialog.test.tsx`

**Interfaces:**
- Consumes (R1, HTTP): `linkRecuperacao` → `{ link, nome, telemovel, login, email }`.
- Produces: `type LinkRecuperacao = { link: string; nome: string; telemovel: string | null; login: string | null; email: string }`; `gerarLinkRecuperacao(userId: string): Promise<LinkRecuperacao>`; `useLinkRecuperacao()` → `{ gerar: (userId: string) => Promise<LinkRecuperacao | null>, loading, error }`; `mensagemRecuperacao(nome, link)` (espelho exato do R1, comentário "Espelhado em supabase/functions/admin-utilizadores/regras.ts"); `EnviarWhatsAppDialog` prop `numeroInicial?: string`.

- [ ] **Step 1: Failing tests**
  - `recuperacao.test.ts`: os dois casos do R1 (`'  Rui Silva '` e nome vazio), mesmo texto exato.
  - Dialog: `numeroInicial="912345678"` → campo número começa preenchido e mostra `+351 912 345 678`.
  - Gestão: menu de um utilizador (não o próprio) tem "Link de recuperação"; clicar chama `gerar('u2')` (hook mockado devolve `{ link: 'https://l', nome: 'Rui', telemovel: '912345678', login: '900', email: '900@contas.encivilconstroi.com' }`) e abre um diálogo com o texto `válido cerca de 1 hora` e botão "Copiar link" (clicar chama `navigator.clipboard.writeText('https://l')` mockado) e botão "Enviar por WhatsApp".
  - Para o próprio utilizador o item não aparece.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement**
  - Service: `export async function gerarLinkRecuperacao(userId: string): Promise<LinkRecuperacao> { return chamarAdmin<LinkRecuperacao>('linkRecuperacao', { userId }) }`.
  - Hook com `useMutation(gerarLinkRecuperacao, 'Erro ao gerar o link de recuperação')` devolvendo `{ gerar: mutate, loading, error }`.
  - Dialog: `useState` do número inicializado/reiniciado ao abrir com `numeroInicial ?? ''` (seguir o padrão existente de reinício do texto ao abrir).
  - Gestão: novo componente local `LinkRecuperacaoDialog` (no mesmo ficheiro ou `src/app/pages/gestao-utilizadores/LinkRecuperacaoDialog.tsx`): mostra nome/login, aviso `Link pessoal, válido cerca de 1 hora. Quem o abrir define a nova palavra-passe.`, input só-leitura com o link, "Copiar link" (toast "Link copiado"), "Enviar por WhatsApp" → abre `EnviarWhatsAppDialog` com `texto={mensagemRecuperacao(nome, link)}` e `numeroInicial={telemovel ?? undefined}`. Erro do hook → toast com a mensagem.
  - Item de menu com ícone `Link2` (lucide), escondido quando `isSelf`.
- [ ] **Step 4:** `npx vitest run src/__tests__/pages/gestaoUtilizadores.test.tsx src/__tests__/components src/__tests__/features/auth` + typecheck → PASS.

### Task H1: Ajuda por perfil + instalação PWA

**Files:**
- Create: `src/app/pages/ajuda/conteudo.ts`, `src/app/pages/ajuda/instalacao.ts`, `src/app/pages/ajuda/useInstalarPwa.ts`
- Modify: `src/app/pages/HelpPage.tsx` (reescrever usando os dados; pode partir em componentes em `src/app/pages/ajuda/`)
- Test: `src/__tests__/pages/ajuda/conteudo.test.ts`, `src/__tests__/pages/ajuda/instalacao.test.ts`, `src/__tests__/pages/ajuda/helpPage.test.tsx`

**Interfaces:**
- Produces:
  - `type PassoGuia = string`; `type SecaoGuia = { id: string; titulo: string; resumo: string; rota?: string; passos: PassoGuia[] }`.
  - `GUIA_RAPIDO: SecaoGuia[]`, `GUIAS_POR_PAPEL: Record<RoleUtilizador, SecaoGuia[]>`, `FAQ: { pergunta: string; resposta: string }[]`, `RECUPERAR_ACESSO: SecaoGuia`.
  - `type Plataforma = 'ios' | 'android' | 'desktop' | 'instalada'`; `detetarPlataforma(ua: string, standalone: boolean, maxTouchPoints = 0): Plataforma` (iPadOS com UA "Macintosh" e `maxTouchPoints > 1` → `ios`); `PASSOS_INSTALACAO: Record<Exclude<Plataforma, 'instalada'>, string[]>`.
  - `useInstalarPwa(): { podeInstalar: boolean; instalar: () => Promise<void> }`.
  - `filtrarSecoes(secoes: SecaoGuia[], termo: string): SecaoGuia[]` (sem acentos, case-insensitive, em título/resumo/passos).

- [ ] **Step 1: Failing tests**

```ts
// instalacao
expect(detetarPlataforma('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari', false)).toBe('ios')
expect(detetarPlataforma('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari', false, 5)).toBe('ios')
expect(detetarPlataforma('Mozilla/5.0 (Linux; Android 14; SM-A54) Chrome/120 Mobile', false)).toBe('android')
expect(detetarPlataforma('Mozilla/5.0 (Windows NT 10.0) Chrome/120', false)).toBe('desktop')
expect(detetarPlataforma('qualquer', true)).toBe('instalada')
expect(PASSOS_INSTALACAO.ios.join(' ')).toMatch(/Partilhar/)
expect(PASSOS_INSTALACAO.ios.join(' ')).toMatch(/Adicionar ao ecrã principal/)
expect(PASSOS_INSTALACAO.android.join(' ')).toMatch(/Instalar/)
// conteudo
const PAPEIS = ['admin','gestor','armazem','medicoes','mecanico','motorista','leitura'] as const
it.each(PAPEIS)('%s tem pelo menos uma secção com passos', p => {
  expect(GUIAS_POR_PAPEL[p].length).toBeGreaterThan(0)
  GUIAS_POR_PAPEL[p].forEach(s => expect(s.passos.length).toBeGreaterThan(0))
})
it('todas as rotas citadas existem em routes.tsx', () => {
  const rotas = readFileSync('src/app/routes.tsx', 'utf8')
  const todas = [...GUIA_RAPIDO, ...Object.values(GUIAS_POR_PAPEL).flat()].map(s => s.rota).filter(Boolean) as string[]
  for (const r of todas) expect(rotas, r).toContain(`'${r.split('/')[1]}'`)
})
it('filtrarSecoes ignora acentos', () => {
  expect(filtrarSecoes([{ id: 'a', titulo: 'Saída', resumo: '', passos: ['x'] }], 'saida')).toHaveLength(1)
})
```
  `helpPage.test.tsx` (mock `useAuth`/`useRole` com papel): papel `armazem` → vê título de secção do guia de armazém e não vê o seletor de perfil; papel `admin` → vê seletor; mudar para `motorista` mostra o guia do motorista; com `navigator.userAgent` de iPhone mostra "Partilhar"; com `matchMedia('(display-mode: standalone)')` verdadeiro mostra `A app já está instalada`.
  (Ver em `src/features/auth` como obter o papel atual — `useRole`/`useAuth` — e mockar o mesmo.)
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement**
  - Conteúdo: reler o `HelpPage.tsx` atual, `routes.tsx` e `Sidebar.tsx` para saber que ecrãs existem por papel; escrever guias curtos (3–8 passos) por tarefa real de cada papel. Exemplos mínimos: armazém (saída, entrada, inventário, ferramentas), motorista (pedir abastecimento), mecânico (revisão/manutenção da frota), medições (autos), gestor (aprovar, relatórios, colaboradores), admin (utilizadores, recuperar acesso de alguém, auditoria, backup), leitura (consultar). `RECUPERAR_ACESSO`: com email → "Esqueceu a palavra-passe?"; sem email → pedir link ao administrador, abrir, definir senha, entra logo.
  - `useInstalarPwa`: `useEffect` regista `beforeinstallprompt` (guarda o evento, `preventDefault()`), `appinstalled` limpa; `instalar()` chama `prompt()` e aguarda `userChoice`. (Não é fetch — `useEffect` é adequado.)
  - Página: cabeçalho, pesquisa (`filtrarSecoes`), seletor de perfil só para admin (`Select` com os 7 papéis e rótulos pt), "Primeiros passos" (GUIA_RAPIDO), "O seu dia a dia", "Instalar no telemóvel" (plataforma detetada aberta, as outras num `<details>`; botão "Instalar app" quando `podeInstalar`; `instalada` → "A app já está instalada neste aparelho."), "Recuperar o acesso", FAQ. Tokens semânticos, mobile-first.
- [ ] **Step 4:** testes PASS + typecheck.

### Task A1: Auditoria legível + filtros + Excel

**Files:**
- Create: `src/app/lib/auditoria/descrever.ts`, `src/app/pages/auditoria/dados.ts`
- Modify: `src/app/pages/AuditoriaPage.tsx`, `src/app/pages/auditoria/EventosSegurancaPainel.tsx` (só os 2 rótulos novos)
- Test: `src/__tests__/lib/auditoria/descrever.test.ts`, `src/__tests__/pages/auditoria/dados.test.ts`, estender/criar `src/__tests__/pages/auditoriaPage.test.tsx` (ver testes existentes da auditoria: `grep -rln "AuditoriaPage\|labelAction" src/__tests__`)

**Interfaces:**
- Produces:
  - `type LogRow = { id: string; action: string; actor_id: string | null; created_at: string; details: Record<string, unknown> | null; target_id: string | null }`.
  - `camposAlterados(action: string, details: Record<string, unknown> | null): { campo: string; rotulo: string; antes: string; depois: string }[]`.
  - `descreverRegisto(row: LogRow, nomeAtor: string, nomeAlvo: string | null): string`.
  - `nomeDoAlvo(row: LogRow, nomesPerfis: Map<string, string>): string | null`.
  - `type FiltrosAuditoria = { atorId?: string; tabela?: string; operacao?: 'insert' | 'update' | 'delete'; desde?: string; ate?: string }` (datas `YYYY-MM-DD`), `listarAuditoria(f, pagina): Promise<{ rows: LogRow[]; total: number }>`, `exportarAuditoria(f): Promise<LogRow[]>`, `limitesPeriodo(periodo: 'hoje'|'semana'|'mes'|'todos', agora?: Date): { desde?: string; ate?: string }` (Lisboa).
  - Manter os exports existentes `labelAction` e `severidadeAction` de `AuditoriaPage.tsx` (há testes a importá-los) — podem passar a reexportar de `descrever.ts`.

- [ ] **Step 1: Failing tests**

```ts
const upd = { id: '1', action: 'profiles.update', actor_id: 'a', created_at: '2026-10-08T10:00:00Z',
  target_id: 'u2', details: { role: { antes: 'armazem', depois: 'gestor' }, nome: { antes: 'Rui', depois: 'Rui Silva' } } }
expect(camposAlterados(upd.action, upd.details)).toEqual([
  { campo: 'nome', rotulo: 'Nome', antes: 'Rui', depois: 'Rui Silva' },
  { campo: 'role', rotulo: 'Papel', antes: 'Armazém', depois: 'Gestor' },
])
expect(descreverRegisto(upd, 'Ana', 'Rui Silva')).toBe('Ana alterou o utilizador Rui Silva (Nome, Papel)')
const del = { ...upd, action: 'faturas_fornecedor.delete', details: { id: 'f', numero_fatura: 'FT 123', fornecedor: 'X' } }
expect(nomeDoAlvo(del, new Map())).toBe('FT 123')
expect(descreverRegisto(del, 'Ana', 'FT 123')).toBe('Ana eliminou a fatura de fornecedor FT 123')
const ins = { ...upd, action: 'obras.insert', details: { id: 'o', nome: 'Escola X', ativo: true } }
expect(descreverRegisto(ins, 'Rui', 'Escola X')).toBe('Rui criou a obra Escola X')
expect(camposAlterados(ins.action, ins.details).find(c => c.campo === 'id')).toBeUndefined()
expect(camposAlterados(ins.action, ins.details).find(c => c.campo === 'ativo')?.depois).toBe('Sim')
const antigo = { ...upd, action: 'role_change', details: null }
expect(descreverRegisto(antigo, 'Ana', null)).toBe('Ana: Alteração de papel')
expect(camposAlterados('role_change', null)).toEqual([])
// período Lisboa (verão, UTC+1)
expect(limitesPeriodo('hoje', new Date('2026-07-01T23:30:00Z'))).toEqual({ desde: '2026-07-01T23:00:00.000Z' })
```
  Ordenação dos campos: alfabética pelo `rotulo`. Artigos/nomes por tabela: `profiles` → "o utilizador", `colaboradores` → "o colaborador", `obras` → "a obra", `faturas_fornecedor` → "a fatura de fornecedor", `comb_aprovadores` → "o aprovador de combustível", `configuracoes_empresa` → "as configurações da empresa", `seguranca_config` → "a configuração de segurança". Verbos: insert "criou", update "alterou", delete "eliminou". Sem nome do alvo → só o artigo+entidade. `update` acrescenta ` (rótulos dos campos)`.
  `dados.test.ts` (mock do client com builder encadeável): `listarAuditoria({ atorId: 'a', tabela: 'obras', operacao: 'update', desde: '2026-10-01', ate: '2026-10-07' }, 1)` chama `.eq('actor_id','a')`, `.like('action','obras.update')`, `.gte('created_at', <início de 1/10 Lisboa>)`, `.lt('created_at', <início de 8/10 Lisboa>)`, `.range(50, 99)`; só `operacao` → `.like('action', '%.update')`; só `tabela` → `.like('action', 'obras.%')`.
  Página: renderiza frase legível (mock de `dados.ts`), "Ver detalhes" mostra tabela Antes/Depois; botão Exportar chama `exportarXlsx` com colunas `Data/Hora`, `Utilizador`, `Ação`, `Módulo`, `Campos alterados`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement**
  - `ROTULO_CAMPO` com os campos comuns das 7 tabelas (nome, email, role→Papel, telemovel→Telemóvel, ativo, cargo, numero_mecan→Nº mecanográfico, obra_id→Obra, estado, total_fatura→Total, numero_fatura→Nº fatura, fornecedor, data_fatura, orcamento→Orçamento, cliente, localizacao→Local, mfa_obrigatorio→MFA obrigatório, …); campo sem rótulo → nome com `_` trocado por espaço e 1.ª maiúscula. Ocultos: `id`, `created_at`, `updated_at`, `atualizado_em`, `user_id`, campos que terminam em `_path`, `nif` (dado pessoal: mostrar "(alterado)" em vez do valor).
  - Formatação: `true/false` → Sim/Não; papéis com rótulos pt (admin Administrador, gestor Gestor, armazem Armazém, medicoes Medições, mecanico Mecânico, motorista Motorista, leitura Leitura); ISO datas → `dd/mm/aaaa`; null/'' → "—"; objetos → JSON curto (máx. 80 caracteres).
  - `dados.ts`: query `supabase.from('audit_log').select('id, action, actor_id, created_at, details, target_id', { count: 'exact' })` com filtros inline; `exportarAuditoria` sem range, limite 5000. Perfis para nomes: `supabase.from('profiles').select('id, nome')`.
  - Página: filtros (Pessoa: select dos perfis; Módulo: tabelas auditadas; Tipo: Criação/Alteração/Eliminação; Período: hoje/7 dias/30 dias/todos ou datas), lista agrupada por dia (cabeçalho "Hoje", "Ontem", ou data pt-PT), cada item: hora, ator, frase, selo de severidade, botão "Ver detalhes" (tabela Campo/Antes/Depois). Paginação 50. Exportar Excel com as colunas acima ("Campos alterados" = `rotulo: antes → depois; …`).
  - `EventosSegurancaPainel` `ROTULOS`: `link_recuperacao_admin: 'Link de recuperação gerado pelo administrador'`, `senha_redefinida_admin: 'Senha redefinida pelo administrador'`.
- [ ] **Step 4:** `npx vitest run src/__tests__/lib/auditoria src/__tests__/pages` + typecheck → PASS.

---

## Verificação final (controlador)
- [ ] `npm run typecheck` 0 erros; `npm test`; `npm run check:edge && npm run test:edge`; `npm run build`.
- [ ] agent-browser em `http://localhost:5173`: `/login` → "Esqueceu a palavra-passe?" mostra o texto das duas vias; `/reset-password` sem token → "Link inválido" em ≤ 5 s com "Voltar ao login"; consola sem erros.
- [ ] Revisão final (subagente) de todo o diff; correções numa só vaga.
- [ ] Commit/push só se o utilizador pedir (mensagem sugerida: `feat(auth): recuperação de acesso por link do administrador, ajuda por perfil e auditoria legível`).
