// @vitest-environment node
// MFA obrigatório para admin/gestor, imposto no servidor via auth_role().
import { describe, it, expect, beforeAll } from 'vitest'
import { criarBanco, como } from './pg-harness.mjs'

let db, admin, gestor, armazem

async function novoUtilizador(role, email) {
  const { rows } = await db.query(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [email])
  await db.query(`UPDATE public.profiles SET role = $1 WHERE id = $2`, [role, rows[0].id])
  return rows[0].id
}
const papel = (uid, aal) => como(db, { papel: 'authenticated', uid, aal }, tx =>
  tx.query(`SELECT public.auth_role() AS r`)).then(r => r.rows[0].r)
const ligar = (ativo) => db.query(`UPDATE public.seguranca_config SET mfa_obrigatorio = $1`, [ativo])

beforeAll(async () => {
  db = await criarBanco()
  admin   = await novoUtilizador('admin', 'admin@teste.pt')
  gestor  = await novoUtilizador('gestor', 'gestor@teste.pt')
  armazem = await novoUtilizador('armazem', 'arm@teste.pt')
}, 120_000)

describe('interruptor desligado (estado na publicação)', () => {
  it('nasce desligado', async () => {
    const fresco = await criarBanco()
    const { rows } = await fresco.query(`SELECT mfa_obrigatorio FROM public.seguranca_config`)
    expect(rows).toEqual([{ mfa_obrigatorio: false }])
  }, 120_000)
  it('ninguém é afetado', async () => {
    await ligar(false)
    expect(await papel(admin, 'aal1')).toBe('admin')
    expect(await papel(gestor, null)).toBe('gestor')
  })
})

describe('interruptor ligado', () => {
  it.each([['admin'], ['gestor']])('%s com aal1 passa a leitura', async (r) => {
    await ligar(true)
    expect(await papel(r === 'admin' ? admin : gestor, 'aal1')).toBe('leitura')
  })
  it('admin com aal2 mantém o papel', async () => {
    await ligar(true)
    expect(await papel(admin, 'aal2')).toBe('admin')
  })
  it('gestor com aal2 mantém o papel', async () => {
    await ligar(true)
    expect(await papel(gestor, 'aal2')).toBe('gestor')
  })
  it('token sem claim aal conta como aal1', async () => {
    await ligar(true)
    expect(await papel(admin, null)).toBe('leitura')
  })
  it('outros papéis não são afetados', async () => {
    await ligar(true)
    expect(await papel(armazem, 'aal1')).toBe('armazem')
  })
  it('admin aal1 não consegue escrever (pode_escrever falso)', async () => {
    await ligar(true)
    const { rows } = await como(db, { papel: 'authenticated', uid: admin, aal: 'aal1' }, tx =>
      tx.query(`SELECT public.pode_escrever('obras') AS p`))
    expect(rows[0].p).toBe(false)
  })
  it('papel_real ignora o MFA', async () => {
    await ligar(true)
    const { rows } = await como(db, { papel: 'authenticated', uid: admin, aal: 'aal1' }, tx =>
      tx.query(`SELECT public.papel_real() AS r`))
    expect(rows[0].r).toBe('admin')
  })
})

// Ruling 5: verificações como `auth_role() NOT IN (...)` deixariam passar um NULL
describe('auth_role nunca devolve NULL', () => {
  const papelDe = (opts) => como(db, opts, tx =>
    tx.query(`SELECT public.auth_role() AS r`)).then(r => r.rows[0].r)

  it.each([[false], [true]])('interruptor %s: sem perfil, anon e papel de serviço → \'\'', async (ativo) => {
    await ligar(ativo)
    const semPerfil = '00000000-0000-4000-8000-000000000001'
    expect(await papelDe({ papel: 'authenticated', uid: semPerfil, aal: 'aal1' })).toBe('')
    expect(await papelDe({ papel: 'authenticated', uid: semPerfil, aal: 'aal2' })).toBe('')
    expect(await papelDe({ papel: 'anon' })).toBe('')
    expect(await papelDe({ papel: 'service_role' })).toBe('')
  })
})

describe('definir_mfa_obrigatorio', () => {
  const definir = (uid, aal, ativo) => como(db, { papel: 'authenticated', uid, aal }, tx =>
    tx.query(`SELECT mfa_obrigatorio FROM public.definir_mfa_obrigatorio($1)`, [ativo]))

  it('admin com aal2 liga e fica auditado', async () => {
    await ligar(false)
    const { rows } = await definir(admin, 'aal2', true)
    expect(rows[0].mfa_obrigatorio).toBe(true)
    const a = await db.query(`SELECT count(*)::int n FROM public.audit_log WHERE action = 'mfa_obrigatorio'`)
    expect(a.rows[0].n).toBeGreaterThan(0)
    const c = await db.query(`SELECT atualizado_por FROM public.seguranca_config`)
    expect(c.rows[0].atualizado_por).toBe(admin)
  })
  it('admin com aal1 é recusado', async () => {
    await ligar(false)
    await expect(definir(admin, 'aal1', true)).rejects.toThrow(/verificação em dois passos/)
  })
  it('gestor é recusado mesmo com aal2', async () => {
    await expect(definir(gestor, 'aal2', true)).rejects.toThrow(/Apenas administradores/)
  })
  it('authenticated não altera a tabela diretamente', async () => {
    await expect(como(db, { papel: 'authenticated', uid: admin, aal: 'aal2' }, tx =>
      tx.query(`UPDATE public.seguranca_config SET mfa_obrigatorio = false`))).rejects.toThrow()
  })
  it('authenticated lê a configuração', async () => {
    const { rows } = await como(db, { papel: 'authenticated', uid: armazem }, tx =>
      tx.query(`SELECT mfa_obrigatorio FROM public.seguranca_config`))
    expect(rows).toHaveLength(1)
  })
  it('anon não lê a configuração', async () => {
    await expect(como(db, { papel: 'anon' }, tx => tx.query(`SELECT * FROM public.seguranca_config`))).rejects.toThrow()
  })
  it('anon não executa a RPC', async () => {
    await expect(como(db, { papel: 'anon' }, tx =>
      tx.query(`SELECT public.definir_mfa_obrigatorio(true)`))).rejects.toThrow(/permission denied/)
  })
})

// A listagem da Admin API do GoTrue (GET /admin/users) não traz `factors`:
// a Edge Function admin-utilizadores lê quem tem MFA por esta RPC.
describe('utilizadores_com_mfa', () => {
  const listar = papel => como(db, { papel, uid: papel === 'authenticated' ? admin : null, aal: 'aal2' }, tx =>
    tx.query(`SELECT public.utilizadores_com_mfa() AS id`)).then(r => r.rows.map(x => x.id))
  beforeAll(async () => {
    await db.query(`INSERT INTO auth.mfa_factors (user_id, status) VALUES ($1, 'verified'), ($2, 'unverified')`, [admin, gestor])
  })
  it('o papel de serviço vê só quem tem um fator verificado', async () => {
    expect(await listar('service_role')).toEqual([admin])
  })
  it.each([['authenticated'], ['anon']])('%s não executa a RPC', async (p) => {
    await expect(listar(p)).rejects.toThrow(/permission denied/)
  })
})
