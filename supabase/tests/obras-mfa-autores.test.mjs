// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { criarBanco, como } from './pg-harness.mjs'

let db
const users = {}
const sql = async (s, p = []) => (await db.query(s, p)).rows
const q = async (uid, aal, s, p = []) => (await como(db, { papel: 'authenticated', uid, aal }, tx => tx.query(s, p))).rows
const guardar = (uid, aal, obra, id = null, trabalhos = 'Trabalhos iniciais') => q(uid, aal,
  `SELECT public.obra_guardar_relatorio(p_id => $1, p_obra_id => $2, p_clima => 'SOL',
    p_equipa_outros => 'Equipa local', p_trabalhos => $3) AS id`, [id, obra, trabalhos])

beforeAll(async () => {
  db = await criarBanco()
  for (const role of ['admin', 'gestor', 'leitura', 'medicoes', 'motorista']) {
    const uid = (await sql('INSERT INTO auth.users (email) VALUES ($1) RETURNING id', [`${randomUUID()}@test.pt`]))[0].id
    await sql('UPDATE public.profiles SET role = $1 WHERE id = $2', [role, uid])
    users[role] = uid
  }
}, 120000)
afterAll(async () => { await db?.close() })

async function fixture(uid, designado = true) {
  await sql('UPDATE public.seguranca_config SET mfa_obrigatorio = false')
  const obra = (await sql("INSERT INTO public.obras (nome, estado) VALUES ('MFA isolada', 'ativa') RETURNING id"))[0].id
  if (designado) await sql('INSERT INTO public.obra_autores (obra_id, user_id) VALUES ($1, $2)', [obra, uid])
  return obra
}

describe('Obras: designação de autor respeita MFA da sessão real', () => {
  const matriz = ['admin', 'gestor'].flatMap(role => [false, true].flatMap(ativo =>
    ['aal1', 'aal2'].map(aal => [role, ativo, aal, !(ativo && aal === 'aal1')])))

  it.each(matriz)('%s designado, MFA=%s, %s: escrita=%s', async (role, ativo, aal, permitido) => {
    const uid = users[role], obra = await fixture(uid)
    const draft = (await guardar(uid, 'aal2', obra))[0].id
    const outraObra = await fixture(uid)
    await sql('UPDATE public.seguranca_config SET mfa_obrigatorio = $1', [ativo])
    expect((await q(uid, aal, 'SELECT public.pode_relatar_obra($1) AS permitido', [obra]))[0].permitido).toBe(permitido)

    if (permitido) {
      await expect(guardar(uid, aal, outraObra)).resolves.toHaveLength(1)
      await expect(guardar(uid, aal, obra, draft, 'Revisto')).resolves.toHaveLength(1)
      await expect(q(uid, aal, 'SELECT public.obra_submeter_relatorio($1)', [draft])).resolves.toHaveLength(1)
      expect((await sql('SELECT estado, trabalhos FROM public.obra_relatorios_diarios WHERE id = $1', [draft]))[0])
        .toMatchObject({ estado: 'submetido', trabalhos: 'Revisto' })
    } else {
      await expect(guardar(uid, aal, outraObra)).rejects.toThrow(/Sem permissão/)
      await expect(guardar(uid, aal, obra, draft, 'Revisto')).rejects.toThrow(/Só o autor/)
      await expect(q(uid, aal, 'SELECT public.obra_submeter_relatorio($1)', [draft])).rejects.toThrow(/Só o autor/)
      expect((await sql('SELECT estado, trabalhos FROM public.obra_relatorios_diarios WHERE id = $1', [draft]))[0])
        .toMatchObject({ estado: 'rascunho', trabalhos: 'Trabalhos iniciais' })
      expect(await sql('SELECT id FROM public.obra_relatorios_diarios WHERE obra_id = $1', [outraObra])).toHaveLength(0)
    }
  })

  it.each(['aal1', 'aal2'])('leitura real designada conserva criação/edição/submissão com %s e MFA ligado', async aal => {
    const uid = users.leitura, obra = await fixture(uid)
    await sql('UPDATE public.seguranca_config SET mfa_obrigatorio = true')
    const draft = (await guardar(uid, aal, obra))[0].id
    await guardar(uid, aal, obra, draft, 'Revisto por autor de leitura')
    await q(uid, aal, 'SELECT public.obra_submeter_relatorio($1)', [draft])
    expect((await sql('SELECT estado, autor_id FROM public.obra_relatorios_diarios WHERE id = $1', [draft]))[0])
      .toMatchObject({ estado: 'submetido', autor_id: uid })
  })

  it('medicoes não exige MFA; leitura sem designação e motorista designado continuam negados', async () => {
    for (const [role, designado, permitido] of [['medicoes', false, true], ['leitura', false, false], ['motorista', true, false]]) {
      const obra = await fixture(users[role], designado)
      await sql('UPDATE public.seguranca_config SET mfa_obrigatorio = true')
      expect((await q(users[role], 'aal1', 'SELECT public.pode_relatar_obra($1) AS permitido', [obra]))[0].permitido).toBe(permitido)
      if (permitido) await expect(guardar(users[role], 'aal1', obra)).resolves.toHaveLength(1)
      else await expect(guardar(users[role], 'aal1', obra)).rejects.toThrow(/Sem permissão/)
    }
  })
})
