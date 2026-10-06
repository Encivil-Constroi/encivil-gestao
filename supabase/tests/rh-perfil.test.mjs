// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { criarBanco, como } from './pg-harness.mjs'

let db, admin, joao, rui
async function novo(role, email) {
  const { rows } = await db.query(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [email])
  await db.query(`UPDATE public.profiles SET role = $1 WHERE id = $2`, [role, rows[0].id])
  return rows[0].id
}
const como_ = (uid, fn) => como(db, { papel: 'authenticated', uid }, fn)

beforeAll(async () => {
  db = await criarBanco()
  admin = await novo('admin', 'a@teste.pt')
  joao = await novo('motorista', 'joao@teste.pt')
  rui = await novo('leitura', 'rui@teste.pt')
  await db.query(`INSERT INTO public.colaboradores (nome, numero_mecan, cargo, user_id) VALUES ('João', 'ENC-J', 'Motorista', $1)`, [joao])
})

describe('nº mecanográfico automático', () => {
  it('gera ENC-nnnn quando vem vazio e não repete', async () => {
    const a = await db.query(`INSERT INTO public.colaboradores (nome, numero_mecan, cargo) VALUES ('A', '', 'X') RETURNING numero_mecan`)
    const b = await db.query(`INSERT INTO public.colaboradores (nome, numero_mecan, cargo) VALUES ('B', '', 'X') RETURNING numero_mecan`)
    expect(a.rows[0].numero_mecan).toMatch(/^ENC-\d{4}$/)
    expect(b.rows[0].numero_mecan).not.toBe(a.rows[0].numero_mecan)
  })
})

describe('atualizar_meu_perfil', () => {
  it('atualiza o perfil e a ficha ligada', async () => {
    await como_(joao, tx => tx.query(`SELECT public.atualizar_meu_perfil('João Silva', '+351 912 345 678', $1)`, [`perfis/${joao}/1.jpg`]))
    const p = (await db.query('SELECT nome, telemovel, foto_path FROM public.profiles WHERE id = $1', [joao])).rows[0]
    const c = (await db.query('SELECT nome, telemovel, foto_path FROM public.colaboradores WHERE user_id = $1', [joao])).rows[0]
    expect(p).toEqual({ nome: 'João Silva', telemovel: '+351 912 345 678', foto_path: `perfis/${joao}/1.jpg` })
    expect(c).toEqual(p)
  })
  it('rejeita foto de outro utilizador, telemóvel inválido e nome vazio', async () => {
    await expect(como_(joao, tx => tx.query(`SELECT public.atualizar_meu_perfil('J', null, $1)`, [`perfis/${rui}/1.jpg`]))).rejects.toThrow(/Foto inválida/)
    await expect(como_(joao, tx => tx.query(`SELECT public.atualizar_meu_perfil('J', 'abc', null)`))).rejects.toThrow(/Telemóvel inválido/)
    await expect(como_(joao, tx => tx.query(`SELECT public.atualizar_meu_perfil('  ', null, null)`))).rejects.toThrow(/nome é obrigatório/)
  })
  it('não afeta o papel nem a ficha de outros', async () => {
    await como_(rui, tx => tx.query(`SELECT public.atualizar_meu_perfil('Rui', null, null)`))
    expect((await db.query('SELECT role FROM public.profiles WHERE id = $1', [rui])).rows[0].role).toBe('leitura')
    expect((await db.query(`SELECT nome FROM public.colaboradores WHERE user_id = $1`, [joao])).rows[0].nome).toBe('João Silva')
  })
})

describe('email do perfil acompanha a conta', () => {
  it('sincroniza ao mudar auth.users.email', async () => {
    await db.query(`UPDATE auth.users SET email = 'novo@teste.pt' WHERE id = $1`, [admin])
    expect((await db.query('SELECT email FROM public.profiles WHERE id = $1', [admin])).rows[0].email).toBe('novo@teste.pt')
  })
})
