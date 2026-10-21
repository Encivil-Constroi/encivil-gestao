// @vitest-environment node
// picagens_insert: próprio colaborador ou admin/gestor (20261020130000).
import { describe, it, expect, beforeAll } from 'vitest'
import { criarBanco, como } from './pg-harness.mjs'

let db, admin, gestor, joao, rui, colabJoao, colabOutro, obra
async function novo(role, email) {
  const { rows } = await db.query(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [email])
  await db.query(`UPDATE public.profiles SET role = $1 WHERE id = $2`, [role, rows[0].id])
  return rows[0].id
}
const comoU = (uid, fn) => como(db, { papel: 'authenticated', uid }, fn)
const picar = (uid, colab) => comoU(uid, tx => tx.query(
  `INSERT INTO public.picagens (colaborador_id, obra_id, tipo, timestamp_dispositivo) VALUES ($1,$2,'ENTRADA', now())`, [colab, obra]))

beforeAll(async () => {
  db = await criarBanco()
  admin = await novo('admin', 'a@t.pt')
  gestor = await novo('gestor', 'g@t.pt')
  joao = await novo('motorista', 'j@t.pt')
  rui = await novo('leitura', 'r@t.pt')
  colabJoao = (await db.query(`INSERT INTO public.colaboradores (nome, numero_mecan, cargo, user_id) VALUES ('João','M1','Motorista',$1) RETURNING id`, [joao])).rows[0].id
  colabOutro = (await db.query(`INSERT INTO public.colaboradores (nome, numero_mecan, cargo) VALUES ('Ana','M2','Servente') RETURNING id`)).rows[0].id
  obra = (await db.query(`INSERT INTO public.obras (nome) VALUES ('Obra T') RETURNING id`)).rows[0].id
}, 120_000)

describe('picagens_insert', () => {
  it('o colaborador pica por si', async () => { await picar(joao, colabJoao) })
  it('o colaborador não pica por outro', async () => { await expect(picar(joao, colabOutro)).rejects.toThrow(/row-level security/) })
  it('utilizador sem ficha não pica', async () => { await expect(picar(rui, colabOutro)).rejects.toThrow(/row-level security/) })
  it('gestor e admin picam em nome de outro', async () => {
    await picar(gestor, colabOutro)
    await picar(admin, colabOutro)
  })
})
