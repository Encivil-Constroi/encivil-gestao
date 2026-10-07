# Utilizadores, PDFs, WhatsApp, Contabilidade e Ícones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin cria contas direto na app (email opcional, senha, papel); impressos com identidade; WhatsApp com número + PDF; contabilidade completa para o contabilista; ícones novos.

**Architecture:** 5 blocos independentes (A utilizadores, B impressos, C WhatsApp, D contabilidade, E ícones) executados em 3 vagas paralelas com ficheiros disjuntos. Lógica pura em `lib/` testada com Vitest; BD numa migration única testada com PGlite; Edge Function testada com Deno.

**Tech Stack:** React 18 + Vite + TS strict, Supabase (Postgres/RLS/Edge Deno), Vitest + PGlite, `jspdf` + `html2canvas-pro` (novos, carregados com `import()`), `sharp` (já em node_modules) para ícones.

**Spec:** `docs/superpowers/specs/2026-10-07-utilizadores-pdf-whatsapp-contabilidade-icones-design.md`

## Global Constraints

- Ler `CLAUDE.md` antes de começar. TS strict, **sem `as any`**, sem helpers genéricos de filtros, fetch só com `useAsync`/`useMutation`.
- Texto de UI, erros e comentários em **pt-PT**; datas `Europe/Lisbon`.
- **NÃO fazer commits** (o utilizador não pediu; há trabalho alheio por commitar na árvore). **NÃO reverter nem reformatar** alterações já existentes nos ficheiros (git status mostra muitos ficheiros modificados — preservá-los).
- `npm run dev` liga à PRODUÇÃO: nunca criar/alterar dados reais.
- Não aplicar migrations nem fazer deploy de Edge Functions.
- Nunca editar `src/integrations/supabase/types.ts`.
- Módulos de `src/features/*` só importam de `auth`, `@/app/lib`, `@/integrations`, `@/app/components` (+ exceções históricas existentes).
- Cores no ecrã: tokens semânticos (`bg-primary text-primary-foreground`…). Impressos: constantes de `printTheme.ts`.
- Domínio de contas internas: `contas.encivilconstroi.com`. Senha mínima: 8 caracteres.
- Migration nova: `supabase/migrations/20261007100000_contabilidade_rh.sql` (maior timestamp atual é `20261007000000`).
- Verificação por tarefa: testes da tarefa + `npm run typecheck`. Se o typecheck falhar **só** em ficheiros que a tua tarefa não toca, reporta-o em vez de corrigir.

## Review Focus

1. Utilizador digita login com maiúsculas/acentos/espaços ("João Silva") no login e na criação → ambos normalizam igual (`joao.silva`) e o login funciona.
2. Falha ao gravar o perfil depois de `createUser` → conta apagada; nunca fica conta com papel `gestor` por defeito.
3. Número de WhatsApp com espaços, `+351`, `00351` ou 9 dígitos → mesmo resultado `351XXXXXXXXX`; número inválido bloqueia o botão com mensagem.
4. Falta que atravessa fim de semana/feriado ou começa antes do período → só contam dias úteis dentro do período.
5. Papel `armazem`/`leitura` a chamar a RPC do mapa ou a ler dados laborais (NISS/IBAN) → recusado pela BD.

---

## Vaga 1 (paralelo): A1, A2, B1, C1, D1, E1

### Task A1: Edge Function — criar e redefinir senha

**Files:**
- Create: `supabase/functions/admin-utilizadores/regras.ts`
- Create: `supabase/functions/admin-utilizadores/regras_test.ts`
- Modify: `supabase/functions/admin-utilizadores/index.ts`

**Interfaces:**
- Produces (HTTP, body `{action, payload}`):
  - `criar` payload `{ email?: string, login?: string, senha: string, nome: string, role: Role, colaboradorId?: string, telemovel?: string, fotoPath?: string }` → `{ sucesso: true, userId: string, email: string }` ou `{ erro }` (status 400/500).
  - `redefinirSenha` payload `{ userId: string, senha: string }` → `{ sucesso: true }`.
  - `listar` passa a incluir `login: string | null` e `semEmail: boolean` em cada utilizador.

- [ ] **Step 1: Write the failing test** `regras_test.ts`

```ts
import { assertEquals } from 'jsr:@std/assert@1'
import { normalizarLogin, emailEfetivo, loginDeEmail, senhaValida, DOMINIO_CONTA_INTERNA } from './regras.ts'

Deno.test('normalizarLogin tira acentos, espaços e maiúsculas', () => {
  assertEquals(normalizarLogin('  João Silva '), 'joao.silva')
})
Deno.test('emailEfetivo prefere email válido', () => {
  assertEquals(emailEfetivo(' A@B.PT ', 'x'), 'a@b.pt')
})
Deno.test('emailEfetivo usa login interno sem email', () => {
  assertEquals(emailEfetivo('', '123'), `123@${DOMINIO_CONTA_INTERNA}`)
})
Deno.test('emailEfetivo recusa login curto e email inválido', () => {
  assertEquals(emailEfetivo('', 'ab'), null)
  assertEquals(emailEfetivo('nao-email', ''), null)
})
Deno.test('loginDeEmail', () => {
  assertEquals(loginDeEmail(`joao@${DOMINIO_CONTA_INTERNA}`), 'joao')
  assertEquals(loginDeEmail('a@b.pt'), null)
})
Deno.test('senhaValida exige 8', () => {
  assertEquals(senhaValida('1234567'), false)
  assertEquals(senhaValida('12345678'), true)
})
```

- [ ] **Step 2: Run** `npx -y deno test --no-lock --node-modules-dir=none --allow-env supabase/functions/admin-utilizadores/` → FAIL (módulo não existe).

- [ ] **Step 3: Implement** `regras.ts` (duplicado de `src/features/auth/lib/contaInterna.ts` porque a Edge Function não importa de `src/`):

```ts
// Espelho de src/features/auth/lib/contaInterna.ts — a Edge Function (Deno) não importa de src/.
export const DOMINIO_CONTA_INTERNA = 'contas.encivilconstroi.com'
export const SENHA_MIN = 8
const LOGIN_RE = /^[a-z0-9._-]{3,40}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizarLogin(v: string): string {
  return v.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, '.')
}
export function emailEfetivo(email?: string | null, login?: string | null): string | null {
  const e = (email ?? '').trim().toLowerCase()
  if (e) return EMAIL_RE.test(e) ? e : null
  const l = normalizarLogin(login ?? '')
  return LOGIN_RE.test(l) ? `${l}@${DOMINIO_CONTA_INTERNA}` : null
}
export function loginDeEmail(email: string): string | null {
  const suf = `@${DOMINIO_CONTA_INTERNA}`
  return email.toLowerCase().endsWith(suf) ? email.slice(0, -suf.length) : null
}
export function senhaValida(s: unknown): s is string {
  return typeof s === 'string' && s.length >= SENHA_MIN
}
```

- [ ] **Step 4: Modify `index.ts`**
  - `import { emailEfetivo, loginDeEmail, senhaValida, SENHA_MIN } from './regras.ts'`.
  - Em `listar`, cada utilizador ganha `login: loginDeEmail(u.email ?? '')`, `semEmail: loginDeEmail(u.email ?? '') !== null`.
  - Nova ação `criar` (antes de `alterarPapel`):

```ts
  if (action === 'criar') {
    const { email, login, senha, nome, role, colaboradorId, telemovel, fotoPath } = payload ?? {}
    if (!nome || typeof nome !== 'string' || !nome.trim()) return err('Nome obrigatório')
    if (!ROLES_VALIDOS.includes(role)) return err('Papel inválido')
    if (!senhaValida(senha)) return err(`A senha tem de ter pelo menos ${SENHA_MIN} caracteres`)
    const emailFinal = emailEfetivo(typeof email === 'string' ? email : '', typeof login === 'string' ? login : '')
    if (!emailFinal) return err('Indique um email válido ou um utilizador (3 a 40 letras, números, ponto, hífen)')

    const { data, error: cErr } = await admin.auth.admin.createUser({
      email: emailFinal, password: senha, email_confirm: true, user_metadata: { nome: nome.trim() },
    })
    if (cErr || !data?.user) {
      const m = cErr?.message ?? 'Erro ao criar a conta'
      return err(/already|registered|exists/i.test(m) ? 'Este email/utilizador já está registado no sistema.' : m)
    }
    const userId = data.user.id
    const extra: Record<string, string> = {}
    if (typeof telemovel === 'string' && telemovel.trim()) extra.telemovel = telemovel.trim()
    if (typeof fotoPath === 'string' && fotoPath.trim())   extra.foto_path = fotoPath.trim()
    const { error: pErr } = await admin.from('profiles').update({ nome: nome.trim(), role, ...extra }).eq('id', userId)
    let falha = pErr?.message ?? null
    if (!falha && typeof colaboradorId === 'string' && colaboradorId) {
      const { error: lErr } = await admin.from('colaboradores').update({ user_id: userId }).eq('id', colaboradorId)
      falha = lErr?.message ?? null
    }
    if (falha) {
      // Sem perfil correto a conta ficaria com o papel por defeito do trigger — apaga-se.
      await admin.auth.admin.deleteUser(userId)
      return err(`Conta não criada: ${falha}`, 500)
    }
    return ok({ sucesso: true, userId, email: emailFinal })
  }

  if (action === 'redefinirSenha') {
    const { userId, senha } = payload ?? {}
    if (!userId) return err('userId obrigatório')
    if (!senhaValida(senha)) return err(`A senha tem de ter pelo menos ${SENHA_MIN} caracteres`)
    const { error: sErr } = await admin.auth.admin.updateUserById(userId, { password: senha })
    if (sErr) return err(sErr.message, 500)
    return ok({ sucesso: true })
  }
```

- [ ] **Step 5: Run** `npm run test:edge` e `npm run check:edge` → PASS.

### Task A2: Frontend — conta interna, serviço e hooks

**Files:**
- Create: `src/features/auth/lib/contaInterna.ts`
- Create: `src/__tests__/features/auth/contaInterna.test.ts`
- Modify: `src/features/auth/services/utilizadoresService.ts`
- Modify: `src/features/auth/hooks/useUtilizadores.ts`
- Create: `src/__tests__/features/auth/utilizadoresService.test.ts`

**Interfaces:**
- Produces:
  - `contaInterna.ts`: `DOMINIO_CONTA_INTERNA`, `SENHA_MIN`, `normalizarLogin(v)`, `emailEfetivo(email?, login?) : string|null`, `loginDeEmail(email): string|null`, `senhaValida(s): boolean`, `paraEmailLogin(valor: string): string`, `gerarSenha(tamanho = 12): string`.
  - Service: `Utilizador` ganha `login: string | null; semEmail: boolean`. `type NovoUtilizador = { nome: string; role: RoleUtilizador; senha: string; email?: string; login?: string; colaboradorId?: string; telemovel?: string; fotoPath?: string }`. `criarUtilizador(d: NovoUtilizador): Promise<{ userId: string; email: string }>`, `redefinirSenha(userId: string, senha: string): Promise<void>`.
  - Hooks: `useCriarUtilizador()` → `{ criar, loading }`; `useRedefinirSenha()` → `{ redefinir, loading }` (seguir o formato de `useConvidarUtilizador`, invalidando a mesma chave de cache da lista).

- [ ] **Step 1: Failing tests** `contaInterna.test.ts` — mesmos casos de `regras_test.ts` (A1) em Vitest +:

```ts
it('paraEmailLogin mantém email e converte utilizador', () => {
  expect(paraEmailLogin(' A@B.pt ')).toBe('a@b.pt')
  expect(paraEmailLogin('João Silva')).toBe(`joao.silva@${DOMINIO_CONTA_INTERNA}`)
})
it('gerarSenha tem o tamanho pedido e é válida', () => {
  const s = gerarSenha(12)
  expect(s).toHaveLength(12)
  expect(senhaValida(s)).toBe(true)
  expect(gerarSenha()).not.toBe(gerarSenha())
})
```

`utilizadoresService.test.ts` — mock de `@/integrations/supabase/client` (ver padrão de mocks em `src/__tests__/features/*`):

```ts
it('mostra a mensagem do corpo quando a Edge Function devolve 400', async () => {
  invoke.mockResolvedValue({ data: null, error: { message: 'Edge Function returned a non-2xx status code',
    context: new Response(JSON.stringify({ erro: 'Este email/utilizador já está registado no sistema.' }), { status: 400 }) } })
  await expect(criarUtilizador({ nome: 'X', role: 'leitura', senha: '12345678', login: 'xx1' }))
    .rejects.toThrow('Este email/utilizador já está registado no sistema.')
})
it('criarUtilizador envia action criar', async () => {
  invoke.mockResolvedValue({ data: { sucesso: true, userId: 'u1', email: 'e' }, error: null })
  await criarUtilizador({ nome: 'X', role: 'leitura', senha: '12345678', login: 'xx1' })
  expect(invoke).toHaveBeenCalledWith('admin-utilizadores', { body: { action: 'criar', payload: expect.objectContaining({ login: 'xx1' }) } })
})
```

- [ ] **Step 2: Run** `npx vitest run src/__tests__/features/auth` → FAIL.
- [ ] **Step 3: Implement** `contaInterna.ts` = código de `regras.ts` (A1) com o comentário inverso ("espelhado em supabase/functions/admin-utilizadores/regras.ts") +:

```ts
export function paraEmailLogin(valor: string): string {
  const v = valor.trim()
  return v.includes('@') ? v.toLowerCase() : `${normalizarLogin(v)}@${DOMINIO_CONTA_INTERNA}`
}
// Sem caracteres ambíguos (0/O, 1/l/I) para ditar a senha em obra.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
export function gerarSenha(tamanho = 12): string {
  const bytes = crypto.getRandomValues(new Uint32Array(tamanho))
  return Array.from(bytes, b => ALFABETO[b % ALFABETO.length]).join('')
}
```

  Em `chamarAdmin`, ler o corpo do erro:

```ts
async function mensagemErro(error: { message: string; context?: unknown }): Promise<string> {
  const ctx = error.context
  if (ctx instanceof Response) {
    try {
      const corpo = (await ctx.clone().json()) as { erro?: string }
      if (corpo?.erro) return corpo.erro
    } catch { /* corpo não-JSON */ }
  }
  return error.message.includes('non-2xx') ? 'Erro no servidor de contas. Tente novamente.' : error.message
}
// em chamarAdmin: if (error) throw new Error(await mensagemErro(error))
```

  Adicionar `criarUtilizador`, `redefinirSenha`, campos `login`/`semEmail` e os hooks.
- [ ] **Step 4: Run** testes → PASS; `npm run typecheck`.

### Task B1: Componentes partilhados de impressão

**Files:**
- Create: `src/app/components/print/printTheme.ts`, `CabecalhoImpresso.tsx`, `RodapeImpresso.tsx`, `estiloPagina.ts`, `index.ts`
- Test: `src/__tests__/components/print.test.tsx`

**Interfaces:**
- Produces (exportados de `@/app/components/print`):
  - `PRINT = { TINTA: '#04090F', MARCA: '#001C7D', SUAVE: '#64748b', LINHA: '#e2e8f0', FUNDO: '#f8fafc', FONTE: "'Geist', system-ui, -apple-system, 'Segoe UI', sans-serif", FONTE_MONO: "'Geist Mono', ui-monospace, monospace" } as const`
  - `dataHoraLisboa(d = new Date()): string` → `"07/10/2026 14:05"` (Intl pt-PT, `timeZone: 'Europe/Lisbon'`).
  - `<CabecalhoImpresso titulo: string subtitulo?: string direita?: ReactNode />` — logo `/icone_oficial.png` 40px, "ENCIVIL" (bold, MARCA, letter-spacing), título (TINTA 18px 700), subtítulo (SUAVE), à direita `direita` ou "Emitido em {dataHoraLisboa()}"; borda inferior 3px MARCA.
  - `<RodapeImpresso nota?: string />` — linha LINHA no topo, texto SUAVE 9px: `ENCIVIL Gestão · gerado em {dataHoraLisboa()} · {nota ?? 'Documento interno'}`.
  - `estiloPaginaImpressa(rootId: string): string` — CSS:

```ts
export function estiloPaginaImpressa(rootId: string): string {
  return `
@page { size: A4; margin: 14mm 12mm 16mm; @bottom-right { content: "Pág. " counter(page) " / " counter(pages); font: 9px ${PRINT.FONTE}; color: ${PRINT.SUAVE}; } }
@media print {
  #${rootId} { font-family: ${PRINT.FONTE}; color: ${PRINT.TINTA}; background: #fff; }
  #${rootId} * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  #${rootId} .no-print { display: none !important; }
}`
}
```

- [ ] **Step 1: Failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { CabecalhoImpresso, RodapeImpresso, estiloPaginaImpressa, dataHoraLisboa, PRINT } from '@/app/components/print'
it('cabeçalho mostra título, marca e logo', () => {
  render(<CabecalhoImpresso titulo="Relatório X" subtitulo="Out 2026" />)
  expect(screen.getByText('Relatório X')).toBeInTheDocument()
  expect(screen.getByText('ENCIVIL')).toBeInTheDocument()
  expect(screen.getByRole('img')).toHaveAttribute('src', '/icone_oficial.png')
})
it('rodapé com nota', () => {
  render(<RodapeImpresso nota="Confidencial" />)
  expect(screen.getByText(/Confidencial/)).toBeInTheDocument()
})
it('dataHoraLisboa usa fuso de Lisboa', () => {
  expect(dataHoraLisboa(new Date('2026-07-01T23:30:00Z'))).toBe('02/07/2026, 00:30'.replace(',', ''))
})
it('estilo inclui A4, numeração e cor de tinta', () => {
  const css = estiloPaginaImpressa('x')
  expect(css).toContain('size: A4'); expect(css).toContain('counter(pages)'); expect(css).toContain(PRINT.TINTA)
})
```
(Se o formato Intl tiver vírgula, a implementação remove-a: `.replace(',', '')`.)
- [ ] **Step 2–4:** run (FAIL) → implementar → run (PASS) + typecheck.

### Task C1: Lógica WhatsApp e geração de PDF

**Files:**
- Create: `src/app/lib/whatsapp.ts`, `src/app/lib/pdf/gerarPdf.ts`
- Test: `src/__tests__/lib/whatsapp.test.ts`, `src/__tests__/lib/gerarPdf.test.ts`
- Modify: `package.json` / `package-lock.json` (`npm i jspdf html2canvas-pro`)

**Interfaces:**
- Produces:
  - `normalizarNumero(input: string): string | null`, `formatarNumero(n: string): string` (`351912345678` → `+351 912 345 678`; outros → `+` + dígitos), `linkWhatsApp(numero: string, texto: string): string` (`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`), `numerosRecentes(): string[]`, `guardarNumeroRecente(n: string): void` (chave localStorage `encivil:wa-recentes`, máx. 5, mais recente primeiro, sem duplicados, try/catch).
  - `gerarPdfDeElemento(el: HTMLElement, nomeFicheiro: string): Promise<File>` (nome termina em `.pdf`, `type: 'application/pdf'`).
  - `partilharOuDescarregarPdf(ficheiro: File, texto: string): Promise<'partilhado' | 'descarregado'>` — `navigator.canShare?.({ files: [ficheiro] })` → `navigator.share({ files, text })`; senão descarrega via `URL.createObjectURL` + `<a download>`.

- [ ] **Step 1: Failing test** `whatsapp.test.ts`

```ts
it.each([
  ['912 345 678', '351912345678'], ['+351 912345678', '351912345678'], ['00351912345678', '351912345678'],
  ['212345678', '351212345678'], ['+33 6 12 34 56 78', '33612345678'],
])('normaliza %s', (i, o) => expect(normalizarNumero(i)).toBe(o))
it.each(['', '123', '812345678', '+351 81234', 'abc'])('recusa %s', i => expect(normalizarNumero(i)).toBeNull())
it('link', () => expect(linkWhatsApp('351912345678', 'Olá & até')).toBe('https://wa.me/351912345678?text=Ol%C3%A1%20%26%20at%C3%A9'))
it('recentes: máx 5, sem duplicados, mais recente primeiro', () => {
  localStorage.clear()
  ;['1','2','3','4','5','6','3'].forEach(guardarNumeroRecente)
  expect(numerosRecentes()).toEqual(['3','6','5','4','2'])
})
it('formatar', () => expect(formatarNumero('351912345678')).toBe('+351 912 345 678'))
```

  `gerarPdf.test.ts`: `vi.mock('html2canvas-pro', ...)` devolvendo canvas fake (`{ width: 800, height: 2400, toDataURL: () => 'data:image/jpeg;base64,AA' }`) e `vi.mock('jspdf', ...)` com classe que regista `addImage`/`addPage` e `output('blob')` → `new Blob(['x'])`. Esperar `File` com nome `relatorio.pdf`, tipo `application/pdf`, e `addPage` chamado ≥ 1 vez (imagem mais alta que uma página A4).

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement**

```ts
export function normalizarNumero(input: string): string | null {
  let s = input.trim().replace(/[\s().-]/g, '')
  if (s.startsWith('+')) s = s.slice(1)
  else if (s.startsWith('00')) s = s.slice(2)
  else if (/^[29]\d{8}$/.test(s)) s = `351${s}`
  if (!/^\d+$/.test(s)) return null
  if (s.startsWith('351')) return /^351[29]\d{8}$/.test(s) ? s : null
  return /^[1-9]\d{7,14}$/.test(s) ? s : null
}
```

  `gerarPdf.ts`:

```ts
export async function gerarPdfDeElemento(el: HTMLElement, nomeFicheiro: string): Promise<File> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')])
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const larg = 210, alt = 297
  const altImg = (canvas.height * larg) / canvas.width
  const img = canvas.toDataURL('image/jpeg', 0.92)
  let y = 0
  pdf.addImage(img, 'JPEG', 0, y, larg, altImg)
  while (altImg + y > alt) {
    y -= alt
    pdf.addPage()
    pdf.addImage(img, 'JPEG', 0, y, larg, altImg)
  }
  const nome = nomeFicheiro.endsWith('.pdf') ? nomeFicheiro : `${nomeFicheiro}.pdf`
  return new File([pdf.output('blob')], nome, { type: 'application/pdf' })
}
```
  (Antes de capturar, `el` deve estar visível; a função não altera o DOM.)
- [ ] **Step 4:** run → PASS; `npm run typecheck`. CSP (`public/_headers`) já permite `img-src data: blob:` — não alterar.

### Task D1: Migration contabilidade/RH + testes de BD

**Files:**
- Create: `supabase/migrations/20261007100000_contabilidade_rh.sql`
- Create: `supabase/tests/contabilidade.test.mjs` (copiar estrutura de `supabase/tests/rh-perfil.test.mjs`)

**Interfaces:**
- Produces: tabela `colaboradores_dados_laborais(colaborador_id, niss, iban, data_admissao, tipo_contrato, data_fim_contrato, categoria_profissional, updated_at)`; colunas `faturas_fornecedor.nif_fornecedor text, base_tributavel numeric(12,2), valor_iva numeric(12,2)`; RPC `contabilidade_mapa_assiduidade(p_inicio date, p_fim date)` com as colunas listadas abaixo.

- [ ] **Step 1: Failing test** `contabilidade.test.mjs` — com `criarBanco()`, criar utilizadores admin/gestor/armazem (helper `novoUtilizador` como em `frota.test.mjs`), uma obra se necessário, colaborador C (`numero_mecan '900'`, `nif '123456789'`, `cargo 'Pedreiro'`). Inserir (direto como superuser, papel de serviço) em `resumo_assiduidade_dia` para o período 2026-09-01..2026-09-30:
  - 2026-09-01 (ter): previstas 8, efetivas 10.5, supl_validadas 2.5 → 1 h @25, 1.5 h @37,5, normais 8.
  - 2026-09-02 (qua): previstas 8, efetivas 3 → não conta subsídio; normais 3.
  - 2026-09-06 (dom): previstas 0, efetivas 4, supl_validadas 4 → 4 h @50, conta dia trabalhado e subsídio.
  - 2026-09-03: previstas 8, efetivas 9, supl_propostas 1, validadas NULL → 0 extra.
  - Falta JUSTIFICADA tipo "Consulta médica" 2026-09-10 periodo MANHA (0,5); falta INJUSTIFICADA tipo "Falta injustificada" de 2026-09-11 (sex) a 2026-09-14 (seg) periodo DIA → 2 dias úteis; falta COMUNICADA 2026-09-15 DIA → só no detalhe; falta INJUSTIFICADA 2026-08-31..2026-09-01 → conta só 1 dia (01/09).
  Expectativas (como gestor): `dias_trabalhados 4`, `horas_normais 19` (8+3+8), `horas_extra_util_25 1`, `horas_extra_util_375 1.5`, `horas_extra_descanso_50 4`, `horas_extra_total 6.5`, `dias_subsidio_alimentacao 3` (01, 03, 06), `faltas_justificadas_dias 0.5`, `faltas_injustificadas_dias 3`, `faltas_descontaveis_dias 3`, `faltas_detalhe` contém um elemento com `estado 'COMUNICADA'`.
  Permissões: armazem a chamar a RPC → rejeita (`/permissão/`); armazem `SELECT * FROM colaboradores_dados_laborais` → 0 linhas; armazem INSERT → erro; gestor INSERT + SELECT → ok; `tipo_contrato 'XPTO'` → erro de CHECK.
  Nota: confirmar no harness como os testes existentes inserem em `resumo_assiduidade_dia`/`faltas` (pode haver triggers, ex. `prazo_prova_ate`); confirmar valores de `estado` e o nome da coluna de data em `feriados_excecoes` (`data`).
- [ ] **Step 2:** `npx vitest run supabase/tests/contabilidade.test.mjs` → FAIL.
- [ ] **Step 3: Implement migration**

```sql
-- Contabilidade/RH: dados laborais (RGPD: só admin/gestor), campos fiscais das faturas
-- e mapa mensal de assiduidade para processamento salarial (CT art. 268.º).

CREATE TABLE IF NOT EXISTS public.colaboradores_dados_laborais (
  colaborador_id         uuid PRIMARY KEY REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  niss                   text CHECK (niss IS NULL OR niss ~ '^\d{11}$'),
  iban                   text CHECK (iban IS NULL OR iban ~ '^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$'),
  data_admissao          date,
  tipo_contrato          text CHECK (tipo_contrato IS NULL OR tipo_contrato IN
                           ('SEM_TERMO','TERMO_CERTO','TERMO_INCERTO','TEMPORARIO','ESTAGIO','OUTRO')),
  data_fim_contrato      date,
  categoria_profissional text,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dados_laborais_datas CHECK (data_fim_contrato IS NULL OR data_admissao IS NULL OR data_fim_contrato >= data_admissao)
);
ALTER TABLE public.colaboradores_dados_laborais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dados_laborais_sel" ON public.colaboradores_dados_laborais;
DROP POLICY IF EXISTS "dados_laborais_ins" ON public.colaboradores_dados_laborais;
DROP POLICY IF EXISTS "dados_laborais_upd" ON public.colaboradores_dados_laborais;
CREATE POLICY "dados_laborais_sel" ON public.colaboradores_dados_laborais FOR SELECT TO authenticated
  USING (public.auth_role() IN ('admin','gestor'));
CREATE POLICY "dados_laborais_ins" ON public.colaboradores_dados_laborais FOR INSERT TO authenticated
  WITH CHECK (public.auth_role() IN ('admin','gestor'));
CREATE POLICY "dados_laborais_upd" ON public.colaboradores_dados_laborais FOR UPDATE TO authenticated
  USING (public.auth_role() IN ('admin','gestor')) WITH CHECK (public.auth_role() IN ('admin','gestor'));
GRANT SELECT, INSERT, UPDATE ON TABLE public.colaboradores_dados_laborais TO authenticated;

ALTER TABLE public.faturas_fornecedor
  ADD COLUMN IF NOT EXISTS nif_fornecedor  text CHECK (nif_fornecedor IS NULL OR nif_fornecedor ~ '^\d{9}$'),
  ADD COLUMN IF NOT EXISTS base_tributavel numeric(12,2),
  ADD COLUMN IF NOT EXISTS valor_iva       numeric(12,2);

CREATE OR REPLACE FUNCTION public.contabilidade_mapa_assiduidade(p_inicio date, p_fim date)
RETURNS TABLE (
  colaborador_id uuid, numero_mecan text, nome text, nif text, niss text, cargo text,
  dias_trabalhados int, horas_normais numeric, horas_extra_util_25 numeric, horas_extra_util_375 numeric,
  horas_extra_descanso_50 numeric, horas_extra_total numeric, dias_subsidio_alimentacao int,
  faltas_justificadas_dias numeric, faltas_injustificadas_dias numeric, faltas_descontaveis_dias numeric,
  faltas_detalhe jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF COALESCE(public.auth_role()::text, '') NOT IN ('admin','gestor') THEN
    RAISE EXCEPTION 'Sem permissão para o mapa de assiduidade' USING ERRCODE = '42501';
  END IF;
  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim < p_inicio THEN
    RAISE EXCEPTION 'Período inválido';
  END IF;

  RETURN QUERY
  WITH dia AS (
    SELECT r.colaborador_id AS cid, COALESCE(r.horas_previstas,0) AS prev,
           COALESCE(r.horas_efetivas,0) AS efe, COALESCE(r.horas_supl_validadas,0) AS supl
    FROM public.resumo_assiduidade_dia r WHERE r.data BETWEEN p_inicio AND p_fim
  ), ag AS (
    SELECT cid,
      count(*) FILTER (WHERE efe > 0)::int                                       AS d_trab,
      sum(CASE WHEN prev > 0 THEN LEAST(efe, prev) ELSE 0 END)                   AS h_norm,
      sum(CASE WHEN prev > 0 THEN LEAST(supl, 1) ELSE 0 END)                     AS x25,
      sum(CASE WHEN prev > 0 THEN GREATEST(supl - 1, 0) ELSE 0 END)              AS x375,
      sum(CASE WHEN prev = 0 THEN supl ELSE 0 END)                               AS x50,
      count(*) FILTER (WHERE (prev > 0 AND efe >= 0.5 * prev) OR (prev = 0 AND efe > 0))::int AS d_sub
    FROM dia GROUP BY cid
  ), uteis AS (
    SELECT g::date AS d FROM generate_series(p_inicio, p_fim, interval '1 day') g
    WHERE extract(isodow FROM g) < 6
      AND NOT EXISTS (SELECT 1 FROM public.feriados_excecoes fe WHERE fe.data = g::date AND fe.tipo = 'FERIADO')
  ), fd AS (
    SELECT f.colaborador_id AS cid, f.estado, COALESCE(tf.designacao, 'Sem tipo') AS tipo,
           COALESCE(tf.descontavel, true) AS descontavel,
           CASE f.periodo WHEN 'MANHA' THEN 0.5 WHEN 'TARDE' THEN 0.5 WHEN 'HORAS' THEN 0 ELSE 1 END::numeric AS peso
    FROM public.faltas f
    LEFT JOIN public.tipos_falta tf ON tf.id = f.tipo_falta_id
    JOIN uteis u ON u.d BETWEEN f.data_inicio AND f.data_fim
  ), fa AS (
    SELECT cid,
      COALESCE(sum(peso) FILTER (WHERE estado = 'JUSTIFICADA'), 0)   AS fj,
      COALESCE(sum(peso) FILTER (WHERE estado = 'INJUSTIFICADA'), 0) AS fi,
      COALESCE(sum(peso) FILTER (WHERE estado = 'INJUSTIFICADA' OR (estado = 'JUSTIFICADA' AND descontavel)), 0) AS fdesc
    FROM fd GROUP BY cid
  ), fdet AS (
    SELECT cid, jsonb_agg(jsonb_build_object('tipo', tipo, 'estado', estado, 'dias', dias) ORDER BY tipo, estado) AS det
    FROM (SELECT cid, tipo, estado, sum(peso) AS dias FROM fd GROUP BY cid, tipo, estado) x GROUP BY cid
  )
  SELECT c.id, c.numero_mecan, c.nome, c.nif, dl.niss, c.cargo,
    COALESCE(ag.d_trab, 0), round(COALESCE(ag.h_norm, 0), 2), round(COALESCE(ag.x25, 0), 2),
    round(COALESCE(ag.x375, 0), 2), round(COALESCE(ag.x50, 0), 2),
    round(COALESCE(ag.x25, 0) + COALESCE(ag.x375, 0) + COALESCE(ag.x50, 0), 2),
    COALESCE(ag.d_sub, 0), COALESCE(fa.fj, 0), COALESCE(fa.fi, 0), COALESCE(fa.fdesc, 0),
    COALESCE(fdet.det, '[]'::jsonb)
  FROM public.colaboradores c
  LEFT JOIN ag   ON ag.cid = c.id
  LEFT JOIN fa   ON fa.cid = c.id
  LEFT JOIN fdet ON fdet.cid = c.id
  LEFT JOIN public.colaboradores_dados_laborais dl ON dl.colaborador_id = c.id
  WHERE c.ativo OR ag.cid IS NOT NULL OR fa.cid IS NOT NULL
  ORDER BY c.nome;
END $$;
REVOKE ALL ON FUNCTION public.contabilidade_mapa_assiduidade(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contabilidade_mapa_assiduidade(date, date) TO authenticated;
```
  (Atenção à expectativa: "Falta injustificada" tem `descontavel=true` no seed; pendentes não entram em `fdesc`.)
- [ ] **Step 4:** run → PASS; correr também `npx vitest run supabase/tests` inteiro (uma migration partida parte a suite).

### Task E1: Ícones com logo branco sobre preto

**Files:**
- Modify: `public/icon.svg`
- Create: `scripts/gerar-icones.mjs`
- Regenerar: `public/favicon.ico`, `public/pwa-64x64.png`, `public/pwa-192x192.png`, `public/pwa-512x512.png`, `public/maskable-icon-512x512.png`, `public/apple-touch-icon-180x180.png`
- Modify: `index.html` (links de ícone), `vite.config.ts` só se o manifest precisar (confirmar `purpose` `any`/`maskable`)

**Interfaces:** nenhuma (assets).

- [ ] **Step 1:** Logo vetorizado (coordenadas medidas em `public/icone_oficial.png`, 1081×1081; centro da forma ≈ 540,540):

```js
const LOGO = `
<polygon points="359,424 512,300 722,423 722,449 512,330 370,449"/>
<polygon points="513,368 720,474 720,497 513,402"/>
<polygon points="513,429 720,518 720,542 513,465"/>
<polygon points="513,490 720,567 720,590 513,523"/>
<polygon points="513,549 720,606 720,631 513,587"/>
<polygon points="513,614 720,656 720,685 513,654"/>
<polygon points="513,683 720,707 720,734 513,719"/>
<polygon points="360,751 720,754 720,781 360,779"/>`
const svg = ({ escala, raio }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<rect width="512" height="512" rx="${raio}" fill="#04090F"/>
<g fill="#FFFFFF" transform="translate(256 256) scale(${escala}) translate(-540.5 -540.5)">${LOGO}</g></svg>`
```
  `scripts/gerar-icones.mjs` (Node ESM, usa `sharp`): escreve `public/icon.svg` = `svg({ escala: 0.68, raio: 96 })`; gera com `sharp(Buffer.from(...)).resize(n).png()`:
  `pwa-64x64` (svg 0.68/96), `pwa-192x192` (0.68/96), `pwa-512x512` (0.68/96), `maskable-icon-512x512` (escala 0.58, raio 0 — zona segura), `apple-touch-icon-180x180` (0.62, raio 0), `favicon.ico` = PNG 32×32 (0.74, raio 6) gravado com esse nome (já é assim hoje).
- [ ] **Step 2:** `node scripts/gerar-icones.mjs`; abrir (Read) `public/pwa-512x512.png` e `public/maskable-icon-512x512.png` e confirmar visualmente: logo branco centrado, nada cortado, fundo preto.
- [ ] **Step 3:** `index.html`: `<link rel="icon" href="/icon.svg" type="image/svg+xml" />` antes do png 64; manter apple-touch; `<meta name="theme-color" content="#04090F">` se existir outro valor.
- [ ] **Step 4:** `npm run build` → PASS (o plugin PWA inclui os ícones).

---

## Vaga 2 (paralelo, depois da vaga 1): A3, B2a, B2b, D2

### Task A3: UI — novo utilizador, redefinir senha, login por utilizador, ficha

**Files:**
- Modify: `src/app/pages/GestaoUtilizadoresPage.tsx`, `src/app/pages/LoginPage.tsx`, `src/features/colaboradores/services/contaFicha.ts`, `src/features/colaboradores/components/ColaboradorForm.tsx` e/ou `PermissoesSwitches.tsx` (onde estão os campos da conta)
- Test: `src/__tests__/pages/gestaoUtilizadores.test.tsx`, `src/__tests__/features/colaboradores/contaFicha.test.ts` (se já existir teste de contaFicha, estendê-lo)

**Interfaces:**
- Consumes (A2): `criarUtilizador`, `redefinirSenha`, `useCriarUtilizador`, `useRedefinirSenha`, `emailEfetivo`, `paraEmailLogin`, `gerarSenha`, `senhaValida`, `normalizarLogin`, `Utilizador.login/semEmail`.
- Produces: `PedidoConta` ganha `login: string` e `senha: string` (vazios = não criar).

- [ ] **Step 1: Failing tests**
  - Página: renderizar `NovoUtilizadorModal` (exportar o componente) com hook mockado; preencher nome "Ana", deixar email vazio, utilizador "Ana Costa", senha "abc" → botão "Criar conta" desativado + texto "pelo menos 8 caracteres"; senha "abcdefgh" → submit chama `criar` com `{ nome: 'Ana', login: 'ana.costa', senha: 'abcdefgh', role: 'leitura' }` e a pré-visualização mostra "Entra com: ana.costa".
  - Botão "Gerar" preenche a senha com 12 caracteres e mostra-a.
  - `contaFicha`: sem email e sem login → mensagem `'Ficha guardada, mas a conta não foi criada: indique email ou utilizador e uma senha.'`; com login + senha → `criarUtilizador` chamado com `colaboradorId`.
  - Login: `paraEmailLogin` usado no submit — teste do `LoginPage` com `signIn` mockado: escrever "123" → `signIn('123@contas.encivilconstroi.com', …)`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement**
  - Renomear `ConvidarModal` → `NovoUtilizadorModal`: campos Nome*, Email (opcional), Utilizador (obrigatório se sem email; sugestão automática `normalizarLogin(nome)` só enquanto o campo não foi editado), Senha* com botões "Mostrar" e "Gerar", Papel (default `leitura`). Linha de ajuda: "Entra com: {email || login normalizado}". Após sucesso mostrar toast "Conta criada. Entra com {login/email}" e manter um painel com credenciais + botão "Copiar" (texto `Utilizador: … / Senha: …`) até fechar.
  - Botão do topo "Novo utilizador" (ícone `UserPlus`). Remover uso de `useConvidarUtilizador` da página (o hook pode ficar).
  - Por linha: ação "Redefinir senha" → mini-diálogo (senha + Gerar + Mostrar) → `redefinir(userId, senha)`; toast "Senha atualizada".
  - Lista: coluna email mostra `login` com badge "sem email" quando `semEmail`.
  - `LoginPage`: label "Email ou utilizador", `type="text"`, `autoComplete="username"`, submit usa `paraEmailLogin(email)`. A recuperação de senha por email: se o valor não tiver `@`, mostrar `toast.info('Contas sem email: peça ao administrador para redefinir a senha.')` e não chamar a API.
  - `contaFicha.sincronizarConta`: se não há conta e `contaAtiva`: exigir `emailEfetivo(p.email, p.login)` e `senhaValida(p.senha)`; chamar `criarUtilizador({ nome, role, senha, email: p.email || undefined, login: p.login || undefined, colaboradorId, telemovel, fotoPath })`.
  - Na ficha (componente onde estão email/papel/conta ativa): campos "Utilizador" (default nº mecanográfico) e "Senha" (com Gerar/Mostrar) visíveis só quando ainda não existe conta ligada e a conta está ativa. Passar `login`/`senha` em `PedidoConta` (atualizar todos os chamadores — `grep -rn "sincronizarConta" src`).
- [ ] **Step 4:** testes PASS; `npm run typecheck`.

### Task B2a: Identidade nos relatórios (página Relatórios)

**Files:** Modify `src/app/pages/ReportsPage.tsx` (3 blocos de impressão ~linhas 195, 737, 1007), `src/app/pages/relatorios/RelatorioImpressao.tsx`, `src/app/pages/RelatorioSemanalPage.tsx`, `src/app/pages/ObraRelatorioPage.tsx`.

**Interfaces:** Consumes B1 (`CabecalhoImpresso`, `RodapeImpresso`, `estiloPaginaImpressa`, `PRINT`).

- [ ] **Step 1:** Em cada impresso: substituir o cabeçalho artesanal (logo + título) por `<CabecalhoImpresso titulo=… subtitulo=… />`, o rodapé por `<RodapeImpresso />`, o `<style>` `@media print` por `estiloPaginaImpressa(ID)` (manter regras específicas que existam além das genéricas), e as constantes locais de cor (`NAVY`, `SLATE`, …) por `PRINT.*` (`NAVY` → `PRINT.MARCA`, `SLATE` → `PRINT.SUAVE`, `BORDER` → `PRINT.LINHA`, `LIGHT` → `PRINT.FUNDO`; texto escuro → `PRINT.TINTA`). Raiz do impresso com `fontFamily: PRINT.FONTE`.
- [ ] **Step 2:** Não mexer em dados, cálculos nem nas alterações por commitar já existentes nesses ficheiros.
- [ ] **Step 3:** `npx vitest run src/__tests__/pages src/__tests__/lib/relatorios` + `npm run typecheck` → PASS (ajustar só asserts de texto de cabeçalho que mudaram, se houver).

### Task B2b: Identidade nos restantes impressos

**Files:** Modify `src/features/obras/components/RelatorioDiarioPage.tsx`, `src/features/obras/components/subempreitadas/AutoPdfPage.tsx`, `src/features/frota/components/FichaViaturaPrintPage.tsx`, `src/app/components/ToolLoanTermPrint.tsx`, `src/features/livro-obra/components/GuiaPrintView.tsx`.

- [ ] Mesmos passos da B2a para estes ficheiros. Testes: `npx vitest run src/__tests__/features/obras src/__tests__/features/frota src/__tests__/features/livro-obra` + typecheck.

### Task D2: Serviço da contabilidade + validações laborais

**Files:**
- Create: `src/features/contabilidade/db.ts`, `src/features/contabilidade/lib/periodo.ts`, `src/app/lib/validacoesFiscais.ts`, `src/features/colaboradores/services/dadosLaboraisService.ts` (tipos em `src/features/colaboradores/db.ts`, já existente)
- Modify: `src/features/contabilidade/contabilidadeService.ts`, `src/app/lib/exportXlsx.ts`
- Test: `src/__tests__/features/contabilidade/periodo.test.ts`, `src/__tests__/lib/validacoesFiscais.test.ts`, estender `contabilidadeService.test.ts`, `src/__tests__/lib/exportXlsx.test.ts` (criar se não existir)

**Interfaces:**
- Produces:
  - `periodo.ts`: `limitesLisboa(dataInicio?: string, dataFim?: string): { desde?: string; ate?: string }` — ISO UTC do início do dia `dataInicio` em Lisboa e do início do dia seguinte a `dataFim` (usar com `.gte(desde)` e `.lt(ate)`); `mesAtual(hoje = new Date()): { dataInicio: string; dataFim: string }` (calendário de Lisboa); `mesAnterior(hoje = new Date())`.
  - `src/app/lib/validacoesFiscais.ts`: `nissValido(s): boolean` (11 dígitos, dígito de controlo SS: pesos `[29,23,19,17,13,11,7,5,3,2]` sobre os 10 primeiros, `controlo = 9 - (soma % 10)`), `ibanValido(s): boolean` (remove espaços, maiúsculas, `^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$`, mod-97 = 1; PT exige 25 caracteres), `nifValido(s): boolean` (9 dígitos, 1.º ∈ 1,2,3,5,6,7,8,9; pesos 9..2; `c = 11 - soma%11; c >= 10 → 0`), `formatarIban(s)` (grupos de 4).
  - `contabilidade/db.ts`: tipos `LinhaMapaAssiduidade` (colunas da RPC D1), `FaturaExportRow`; cliente tipado no padrão de `src/features/frota/db.ts` para `colaboradores_dados_laborais` e as colunas novas de `faturas_fornecedor`.
  - `colaboradores/services/dadosLaboraisService.ts` (+ tipos `DadosLaborais`, `TipoContrato` em `colaboradores/db.ts`; a contabilidade NÃO importa daqui — a sua query de export embebe `colaboradores_dados_laborais` com tipos próprios em `contabilidade/db.ts`): `buscarDadosLaborais(colaboradorId): Promise<DadosLaborais | null>`, `guardarDadosLaborais(d: DadosLaborais): Promise<DadosLaborais>` (upsert `onConflict: 'colaborador_id'` + `.select().single()`).
  - `contabilidadeService.ts`: existentes sem `as any`, com `limitesLisboa`; `exportarAutos` com `subempreiteiros!inner(nome, percentagem_retencao, obra_id, obras(nome))` e `.eq('subempreiteiros.obra_id', obraId)` (remover o filtro client-side falso); novos `exportarMapaAssiduidade(f)`, `exportarFaltas(f)` (uma linha por elemento de `faltas_detalhe` com nº/nome), `exportarDadosLaborais()`, `exportarFaturas(f)` (colunas: Nº Fatura, Fornecedor, NIF Fornecedor, Data Fatura, Data Receção, Base Tributável (€), IVA (€), Total (€), Obra, Estado, Lançada Em), `exportarFechoMes(f): Promise<FolhaExport[]>` com folhas `Assiduidade, Faltas, Dados laborais, Faturas, Materiais, Combustível, Autos, P&L, Notas`. `NOTAS_LEGAIS: ExportRow[]` com as regras (CT art. 268.º escalões; subsídio de alimentação ≥ 50 % das horas previstas ou trabalho em descanso; horas extra só validadas; faltas em dias úteis; pendentes não descontam; dados pessoais RGPD — circulação restrita).
  - `exportXlsx.ts`: nova `exportarXlsxMultiFolha(folhas: { nome: string; linhas: Record<string, unknown>[] }[], nomeArquivo: string)` — reutiliza a formatação existente (extrair a construção do worksheet para uma função interna partilhada); folhas vazias levam uma linha `{ Aviso: 'Sem dados no período' }`; nomes de folha cortados a 31 caracteres. `type FolhaExport = { nome: string; linhas: ExportRow[] }` exportado de `contabilidadeService`.
  - Colunas do mapa (ordem): Nº Mecanográfico, Nome, NIF, NISS, Cargo, Dias Trabalhados, Horas Normais, Extra Dia Útil +25% (h), Extra Dia Útil +37,5% (h), Extra Descanso/Feriado +50% (h), Total Horas Extra, Dias Subsídio Alimentação, Faltas Justificadas (dias), Faltas Injustificadas (dias), Faltas Descontáveis (dias). Números com vírgula decimal ficam como `number` (o Excel formata).
- [ ] **Step 1: Failing tests**

```ts
// periodo
expect(limitesLisboa('2026-07-01', '2026-07-31')).toEqual({ desde: '2026-06-30T23:00:00.000Z', ate: '2026-07-31T23:00:00.000Z' })
expect(limitesLisboa('2026-01-01', '2026-01-31')).toEqual({ desde: '2026-01-01T00:00:00.000Z', ate: '2026-02-01T00:00:00.000Z' })
expect(mesAtual(new Date('2026-09-30T23:30:00Z'))).toEqual({ dataInicio: '2026-10-01', dataFim: '2026-10-31' }) // 00:30 de 1/10 em Lisboa (UTC+1)
// validacoes
expect(nifValido('123456789')).toBe(true); expect(nifValido('123456780')).toBe(false)
expect(ibanValido('PT50 0002 0123 1234 5678 9015 4')).toBe(true); expect(ibanValido('PT50000201231234567890155')).toBe(false)
expect(nissValido('12345678901')).toBe(false) // calcula o controlo no teste e confirma um válido gerado
```
  (Para NISS, o teste constrói um número válido a partir de 10 dígitos com a mesma fórmula e confirma `true`, e o mesmo com o último dígito trocado → `false`.)
  Serviço (mock do client como no teste existente): `exportarAutos({ obraId: 'o1' })` chama `.eq('subempreiteiros.obra_id', 'o1')`; `exportarMapaAssiduidade` mapeia uma linha RPC para as colunas acima; `exportarFechoMes` devolve 9 folhas com os nomes certos.
- [ ] **Step 2:** run → FAIL. **Step 3:** implementar. **Step 4:** `npx vitest run src/__tests__/features/contabilidade src/__tests__/lib` + typecheck → PASS.

---

## Vaga 3 (paralelo, depois da vaga 2): C2, D3

### Task C2: Diálogo WhatsApp e integração

**Files:**
- Create: `src/app/components/EnviarWhatsAppDialog.tsx`
- Test: `src/__tests__/components/EnviarWhatsAppDialog.test.tsx`
- Modify: `src/app/pages/ReportsPage.tsx` (`partilharSemanalWhatsApp`, ~l.1112–1173), `src/app/pages/RelatorioSemanalPage.tsx` (`partilharWhatsApp`, ~l.140–158), `src/app/pages/relatorios/RelatorioImpressao.tsx` (botão na barra `.no-print`)

**Interfaces:**
- Consumes (C1): `normalizarNumero`, `formatarNumero`, `linkWhatsApp`, `numerosRecentes`, `guardarNumeroRecente`, `gerarPdfDeElemento`, `partilharOuDescarregarPdf`.
- Produces: `<EnviarWhatsAppDialog open onOpenChange texto: string obterElementoPdf?: () => HTMLElement | null nomePdf?: string />`.

- [ ] **Step 1: Failing test**
  - Abre com número vazio; "Abrir conversa" desativado; escrever "912 345 678" → mostra "+351 912 345 678"; clicar → `window.open` chamado com `https://wa.me/351912345678?text=…` e `numerosRecentes()[0] === '351912345678'`.
  - Número "123" → texto de erro "Número inválido" e botões desativados.
  - Recentes aparecem como chips e preenchem o campo ao clicar.
  - "Enviar PDF" (com `obterElementoPdf`) chama `gerarPdfDeElemento` (mock) e `partilharOuDescarregarPdf`; quando devolve `'descarregado'` também abre o `wa.me` e mostra toast "PDF descarregado — anexe-o na conversa".
  - Sem `obterElementoPdf` o botão PDF não aparece.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** com `Dialog` de `@/app/components/ui/dialog`, `Input`, `Textarea`, `Button`; o texto é editável (`useState(texto)` reiniciado ao abrir). Estado `aGerar` mostra "A gerar PDF…". Erros → `toast.error('Não foi possível gerar o PDF')`. Integração:
  - `ReportsPage`: a função atual monta o texto; passa a guardar o texto em estado e abrir o diálogo (manter a montagem do texto); `obterElementoPdf` devolve o elemento raiz do impresso semanal se estiver montado, senão omitir.
  - `RelatorioSemanalPage`: idem; `obterElementoPdf = () => document.getElementById(<id da raiz imprimível>)`.
  - `RelatorioImpressao`: botão "WhatsApp" (ícone `MessageCircle`) ao lado de "Imprimir", texto = resumo curto (título + período + 3–5 KPIs que o componente já recebe), `obterElementoPdf` = raiz `encivil-print-root-relatorio` (o conteúdo, sem a barra `.no-print` — capturar o contentor do documento abaixo da barra; dar-lhe um id).
- [ ] **Step 4:** testes PASS + typecheck.

### Task D3: UI da contabilidade, dados laborais na ficha, campos fiscais das faturas

**Files:**
- Modify: `src/app/pages/ExportacaoContabilidadePage.tsx`
- Create: `src/features/colaboradores/components/DadosLaboraisSecao.tsx` (serviço e validações já criados na D2) — **contexto à regra de módulos**: `colaboradores` não pode importar de `contabilidade`. Portanto `dadosLaboraisService`, `db` (tipos `DadosLaborais`) e `validacoes` usados pela ficha devem ser movidos/criados em `src/features/colaboradores/` (`services/dadosLaboraisService.ts`, `lib/validacoesLaborais.ts`) e a contabilidade (que é agregadora? não — é um módulo) obtém os dados laborais via o embed `colaboradores_dados_laborais` na sua própria query. Ajustar D2 em conformidade se necessário (o serviço de dados laborais vive em colaboradores; a contabilidade tem a sua query de export).
- Modify: componente da ficha (`ColaboradorForm.tsx` ou `ColaboradorDrawer.tsx`) para incluir `<DadosLaboraisSecao colaboradorId=… />` só para admin/gestor (`useRole`) e só quando a ficha já existe (tem id).
- Modify: formulário de edição de fatura em `src/features/faturas/` (encontrar com `grep -rn "numero_fatura" src/features/faturas/components`) + `faturasService.ts` tipos — campos NIF fornecedor (valida `nifValido` — para não importar de contabilidade nem colaboradores, colocar `nifValido` em `src/app/lib/validacoesFiscais.ts` e reexportar/usar daí em todos), Base tributável, IVA.
- Test: `src/__tests__/pages/exportacaoContabilidade.test.tsx`, `src/__tests__/features/colaboradores/dadosLaboraisSecao.test.tsx`

> Decisão de localização (aplica-se a D2 e D3, sobrepõe-se aos caminhos indicados em D2): `nifValido`, `nissValido`, `ibanValido`, `formatarIban` em **`src/app/lib/validacoesFiscais.ts`** (teste `src/__tests__/lib/validacoesFiscais.test.ts`); `DadosLaborais` + `buscarDadosLaborais`/`guardarDadosLaborais` em **`src/features/colaboradores/services/dadosLaboraisService.ts`** (tipos declarados em `src/features/colaboradores/db.ts`, que já existe). D2 não cria `contabilidade/lib/validacoes.ts` nem `contabilidade/dadosLaboraisService.ts`.

- [ ] **Step 1: Failing tests**
  - Página: render com serviços mockados; existe atalho "Mês atual"/"Mês anterior" que preenche as datas; cards "Assiduidade e horas (salários)", "Faltas", "Dados laborais", "Faturas de fornecedor" + os 4 antigos; botão "Fecho do mês (Excel)" chama `exportarFechoMes` e `exportarXlsxMultiFolha`; export vazio → toast "Sem dados no período".
  - Secção dados laborais: NISS inválido mostra erro e não grava; IBAN válido grava com `guardarDadosLaborais` (mock) normalizado sem espaços.
- [ ] **Step 2:** FAIL. **Step 3:** implementar — a página usa `useMutation` para cada export (sem `useEffect` manual); `useObras` mantém-se; lista de cards gerada por array como hoje. A secção usa `useAsync(() => buscarDadosLaborais(id), [id])` + `useMutation(guardarDadosLaborais, 'Erro ao guardar dados laborais')`; tipo de contrato com `Select` (Sem termo, Termo certo, Termo incerto, Temporário, Estágio, Outro); data fim visível só para termo certo/incerto/temporário/estágio. **Step 4:** PASS + typecheck.

---

## Vaga final: verificação (executada pelo controlador)

- [ ] `npm run typecheck` → 0 erros.
- [ ] `npm test` → tudo verde (incluindo `supabase/tests`).
- [ ] `npm run check:edge && npm run test:edge`.
- [ ] `npm run build`.
- [ ] `agent-browser` sobre `npm run dev` (http://localhost:5173): `/login` mostra "Email ou utilizador" e ícones novos (favicon); consola sem erros. Com credenciais do utilizador (se dadas): `/gestao-utilizadores` abre o modal novo (sem submeter), `/exportacao-contabilidade` mostra cards novos, `/relatorios` abre o diálogo WhatsApp e o impresso com o cabeçalho novo. Nada é gravado.
- [ ] Revisão final de todo o diff (subagente revisor).
- [ ] Atualizar `docs/12-plano-v3.md`? Não — só registar os passos manuais no relatório final.
