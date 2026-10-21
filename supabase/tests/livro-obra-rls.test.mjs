// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { criarBanco, como } from './pg-harness.mjs'

let db, obra, sub
const users = {}
const sql = async (s, p = []) => (await db.query(s, p)).rows
const q = async (role, s, p = []) => (await como(db, { papel: 'authenticated', uid: users[role] }, tx => tx.query(s, p))).rows
const ROLES = ['admin', 'gestor', 'armazem', 'medicoes', 'mecanico', 'motorista', 'leitura']
const ESCREVEM = ['admin', 'gestor', 'armazem', 'medicoes']

const inserirRegisto = (role, autor = users[role]) => q(role,
  `INSERT INTO public.registos_obra (obra_id, data, categoria, descricao, autor_id)
   VALUES ($1, '2026-10-01', 'OCORRENCIA', 'Teste', $2) RETURNING id`, [obra, autor])
const inserirGuia = (role, numero) => q(role,
  `INSERT INTO public.guias_transporte (numero, obra_id) VALUES ($1, $2) RETURNING id`, [numero, obra])

beforeAll(async () => {
  db = await criarBanco()
  for (const role of ROLES) {
    const uid = (await sql('INSERT INTO auth.users (email) VALUES ($1) RETURNING id', [`${randomUUID()}@test.pt`]))[0].id
    await sql('UPDATE public.profiles SET role = $1 WHERE id = $2', [role, uid])
    users[role] = uid
  }
  obra = (await sql("INSERT INTO public.obras (nome, estado) VALUES ('Livro isolado', 'ativa') RETURNING id"))[0].id
  sub = (await sql("INSERT INTO public.subempreiteiros (obra_id, nome, tipo, estado) VALUES ($1, 'Contrato', 'unitario', 'validado') RETURNING id", [obra]))[0].id
}, 120000)
afterAll(async () => { await db?.close() })

describe('Livro de obra: escrita por papel', () => {
  it.each(ROLES)('registos_obra INSERT como %s', async role => {
    if (ESCREVEM.includes(role)) await expect(inserirRegisto(role)).resolves.toHaveLength(1)
    else await expect(inserirRegisto(role)).rejects.toThrow(/row-level security/)
  })

  it('gestor não regista em nome de outro autor', async () => {
    await expect(inserirRegisto('gestor', users.admin)).rejects.toThrow(/row-level security/)
  })

  it.each(ROLES)('registos_obra continua legível por %s', async role => {
    expect((await q(role, 'SELECT id FROM public.registos_obra WHERE obra_id = $1', [obra])).length).toBeGreaterThan(0)
  })

  it('leitura não edita registos de obra', async () => {
    const id = (await inserirRegisto('admin'))[0].id
    expect(await q('leitura', "UPDATE public.registos_obra SET descricao = 'x' WHERE id = $1 RETURNING id", [id])).toHaveLength(0)
  })

  it('armazem edita só os seus; gestor edita todos; mecanico/motorista nada', async () => {
    const meu = (await inserirRegisto('armazem'))[0].id
    const alheio = (await inserirRegisto('admin'))[0].id
    const upd = (role, id) => q(role, "UPDATE public.registos_obra SET descricao = 'y' WHERE id = $1 RETURNING id", [id])
    expect(await upd('armazem', meu)).toHaveLength(1)
    expect(await upd('armazem', alheio)).toHaveLength(0)
    expect(await upd('gestor', meu)).toHaveLength(1)
    for (const role of ['mecanico', 'motorista']) expect(await upd(role, meu)).toHaveLength(0)
  })

  it('armazem não passa a autoria do seu registo para outro utilizador; edição normal continua', async () => {
    const meu = (await inserirRegisto('armazem'))[0].id
    await expect(q('armazem', 'UPDATE public.registos_obra SET autor_id = $2 WHERE id = $1 RETURNING id', [meu, users.admin]))
      .rejects.toThrow(/row-level security/)
    expect(await q('armazem', "UPDATE public.registos_obra SET descricao = 'z' WHERE id = $1 RETURNING id", [meu])).toHaveLength(1)
    expect(await q('gestor', "UPDATE public.registos_obra SET descricao = 'w' WHERE id = $1 RETURNING id", [meu])).toHaveLength(1)
  })
})

describe('Guias de transporte: escrita por papel', () => {
  it.each(ROLES)('INSERT como %s', async role => {
    const numero = `GT-90${ROLES.indexOf(role)}`
    if (ESCREVEM.includes(role)) await expect(inserirGuia(role, numero)).resolves.toHaveLength(1)
    else await expect(inserirGuia(role, numero)).rejects.toThrow(/row-level security/)
  })

  it.each(ROLES)('SELECT como %s', async role => {
    expect((await q(role, 'SELECT id FROM public.guias_transporte')).length).toBeGreaterThan(0)
  })

  it.each(ROLES)('UPDATE como %s', async role => {
    const id = (await inserirGuia('admin', `GT-91${ROLES.indexOf(role)}`))[0].id
    const r = await q(role, "UPDATE public.guias_transporte SET estado = 'ENTREGUE' WHERE id = $1 RETURNING id", [id])
    expect(r).toHaveLength(ESCREVEM.includes(role) ? 1 : 0)
  })

  it.each(ROLES)('RPC criar_guia_transporte como %s', async role => {
    const chamada = () => q(role, "SELECT public.criar_guia_transporte($1, NULL, 'A', 'B', '2026-10-01', '[]'::jsonb) AS id", [obra])
    if (ESCREVEM.includes(role)) await expect(chamada()).resolves.toHaveLength(1)
    else await expect(chamada()).rejects.toThrow(/Sem permiss/)
  })
})

describe('Autos: numeração única e linhas atómicas', () => {
  it('índice único (subempreiteiro_id, numero) e criar_auto_rpc com search_path', async () => {
    await sql('INSERT INTO public.autos_medicao (subempreiteiro_id, numero, valor_periodo) VALUES ($1, 900, 1)', [sub])
    await expect(sql('INSERT INTO public.autos_medicao (subempreiteiro_id, numero, valor_periodo) VALUES ($1, 900, 1)', [sub]))
      .rejects.toThrow(/duplicate key|unique/i)
    const [f] = await sql(`SELECT proconfig FROM pg_proc WHERE proname = 'criar_auto_rpc' AND pronamespace = 'public'::regnamespace`)
    expect(f.proconfig).toContain('search_path=public')
  })

  const novoAuto = async () => (await sql(`INSERT INTO public.autos_medicao (subempreiteiro_id, numero, valor_periodo)
    VALUES ($1, (SELECT COALESCE(max(numero), 0) + 1 FROM public.autos_medicao WHERE subempreiteiro_id = $1), 100) RETURNING id`, [sub]))[0].id
  const linhas100 = JSON.stringify([{ descricao: 'L', unidade: 'un', preco_unitario: 10, quantidade: 10, is_extra: true, justificacao: 'Extra' }])
  const linhas = n => JSON.stringify(Array.from({ length: n }, (_, i) => ({
    artigo_id: null, descricao: `L${i}`, unidade: 'un', preco_unitario: 10, quantidade: i + 1,
    is_extra: true, qtd_pedida: null, justificacao: 'Extra',
  })))

  it('substitui as linhas de um rascunho de uma só vez', async () => {
    const a = await novoAuto()
    await q('medicoes', 'SELECT public.substituir_linhas_auto($1, $2::jsonb)', [a, linhas(3)])
    await q('medicoes', 'SELECT public.substituir_linhas_auto($1, $2::jsonb)', [a, linhas(2)])
    expect(await sql('SELECT descricao FROM public.auto_linhas WHERE auto_id = $1 ORDER BY descricao', [a])).toEqual([{ descricao: 'L0' }, { descricao: 'L1' }])
    await q('medicoes', "SELECT public.substituir_linhas_auto($1, '[]'::jsonb)", [a])
    expect(await sql('SELECT id FROM public.auto_linhas WHERE auto_id = $1', [a])).toHaveLength(0)
  })

  it('linha inválida reverte tudo: linhas antigas ficam', async () => {
    const a = await novoAuto()
    await q('medicoes', 'SELECT public.substituir_linhas_auto($1, $2::jsonb)', [a, linhas(2)])
    const mau = JSON.stringify([{ descricao: 'ok', unidade: 'un', preco_unitario: 1, quantidade: 1, is_extra: false }, { descricao: null, unidade: 'un', preco_unitario: 1, quantidade: 1, is_extra: false }])
    await expect(q('medicoes', 'SELECT public.substituir_linhas_auto($1, $2::jsonb)', [a, mau])).rejects.toThrow()
    expect(await sql('SELECT id FROM public.auto_linhas WHERE auto_id = $1', [a])).toHaveLength(2)
  })

  it('auto submetido e papéis sem permissão são recusados', async () => {
    const a = await novoAuto()
    await q('medicoes', 'SELECT public.substituir_linhas_auto($1, $2::jsonb)', [a, linhas100])
    await expect(q('leitura', 'SELECT public.substituir_linhas_auto($1, $2::jsonb)', [a, linhas100])).rejects.toThrow()
    await q('medicoes', 'SELECT public.auto_submeter($1)', [a])
    await expect(q('medicoes', 'SELECT public.substituir_linhas_auto($1, $2::jsonb)', [a, linhas(2)])).rejects.toThrow(/já foi submetido/)
    expect(await sql('SELECT id FROM public.auto_linhas WHERE auto_id = $1', [a])).toHaveLength(1)
  })
})

describe('Migration', () => {
  it('é idempotente', async () => {
    const m = readFileSync(new URL('../migrations/20261020120000_obras_livro_integridade.sql', import.meta.url), 'utf8')
    await db.exec(m)
    await db.exec(m)
    expect(m).toMatch(/-- ROLLBACK/)
  })
})
