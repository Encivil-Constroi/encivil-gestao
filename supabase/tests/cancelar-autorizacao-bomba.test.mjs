// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { criarBanco, como } from './pg-harness.mjs'

let db, admin, joao, rui, viatura
async function novo(role, email) {
  const { rows } = await db.query(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [email])
  await db.query(`UPDATE public.profiles SET role = $1 WHERE id = $2`, [role, rows[0].id])
  return rows[0].id
}
const como_ = (uid, fn) => como(db, { papel: 'authenticated', uid }, fn)
const poll = (relay = false) => como(db, { papel: 'service_role' }, tx => tx.query('SELECT public.pump_poll($1, $2, $3)', ['polo2', relay, false]))
const estado = async id => (await db.query('SELECT * FROM public.comb_abastecimentos_pendentes WHERE id = $1', [id])).rows[0]

async function pedidoLigado() {
  const id = randomUUID()
  await db.query(
    `INSERT INTO public.comb_abastecimentos_pendentes
       (id, veiculo_id, veiculo_nome, funcionario_nome, data, tipo_fonte, estado, solicitante_id, tipo_combustivel, contador_inicial)
     VALUES ($1, $2, 'Carrinha 1', 'João', CURRENT_DATE, 'POLO2', 'AGUARDA_AUTORIZACAO', $3, 'gasoleo', 1000)`, [id, viatura, joao])
  await como_(admin, tx => tx.query('SELECT public.autorizar_abastecimento($1)', [id]))
  await como_(joao, tx => tx.query('SELECT public.ligar_bomba($1)', [id]))
  return id
}

beforeAll(async () => {
  db = await criarBanco()
  admin = await novo('admin', 'a@teste.pt')
  joao = await novo('motorista', 'joao@teste.pt')
  rui = await novo('motorista', 'rui@teste.pt')
  const { rows } = await db.query(`INSERT INTO public.comb_veiculos (nome) VALUES ('Carrinha 1') RETURNING id`)
  viatura = rows[0].id
})

describe('cancelar_autorizacao_bomba', () => {
  it('limpa a autorização pendente e deixa ligar de novo', async () => {
    const id = await pedidoLigado()
    expect((await estado(id)).bomba_ligada_em).not.toBeNull()
    await como_(joao, tx => tx.query('SELECT public.cancelar_autorizacao_bomba($1)', [id]))
    const e = await estado(id)
    expect(e.pump_auth_token).toBeNull()
    expect(e.bomba_ligada_em).toBeNull()
    await como_(joao, tx => tx.query('SELECT public.ligar_bomba($1)', [id]))
    expect((await estado(id)).pump_auth_token).not.toBeNull()
  })

  it('só o dono do pedido cancela', async () => {
    const id = await pedidoLigado()
    await expect(como_(rui, tx => tx.query('SELECT public.cancelar_autorizacao_bomba($1)', [id]))).rejects.toThrow(/Pedido não encontrado/)
  })

  it('depois de a bomba ligar já não cancela', async () => {
    const id = await pedidoLigado()
    await db.query('UPDATE public.comb_abastecimentos_pendentes SET pump_auth_token = NULL WHERE id <> $1', [id])
    await poll(false)
    expect((await estado(id)).pump_activated_at).not.toBeNull()
    await expect(como_(joao, tx => tx.query('SELECT public.cancelar_autorizacao_bomba($1)', [id]))).rejects.toThrow(/já foi ligada/)
  })
})
