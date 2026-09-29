// @vitest-environment node
// Limite de pedidos anónimos por viatura (policy pend_anon_insert): o erro que o
// banco devolve tem de ser reconhecido pela página do motorista.
import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { criarBanco, como } from './pg-harness.mjs'
import { mensagemErroPedido } from '../../src/features/combustivel/lib/erroPedido.ts'

let db, viatura, outra

const anon = fn => como(db, { papel: 'anon' }, fn)
const pedir = (v) => anon(tx => tx.query(
  `INSERT INTO public.comb_abastecimentos_pendentes
     (id, veiculo_id, veiculo_nome, funcionario_nome, data, tipo_fonte, estado)
   VALUES ($1, $2, 'Carrinha', 'Rui', '2026-09-29', 'POLO2', 'AGUARDA_AUTORIZACAO')`,
  [randomUUID(), v]))

beforeAll(async () => {
  db = await criarBanco()
  viatura = (await db.query(`INSERT INTO public.comb_veiculos (nome) VALUES ('Carrinha 1') RETURNING id`)).rows[0].id
  outra   = (await db.query(`INSERT INTO public.comb_veiculos (nome) VALUES ('Carrinha 2') RETURNING id`)).rows[0].id
}, 60_000)

describe('limite de pedidos por viatura', () => {
  it('3 pedidos passam; o 4.º em 5 min é recusado pela RLS e a página reconhece-o', async () => {
    for (let i = 0; i < 3; i++) await pedir(viatura)
    const erro = await pedir(viatura).then(() => null, e => e)
    expect(erro).not.toBeNull()
    expect(erro.code).toBe('42501')
    expect(erro.message).toMatch(/row-level security/)
    expect(mensagemErroPedido({ code: erro.code, message: erro.message })).toMatch(/5 minutos/)
  })

  it('o limite é por viatura', async () => {
    await expect(pedir(outra)).resolves.toBeDefined()
  })

  it('pedidos com mais de 5 min deixam de contar', async () => {
    await db.query(`UPDATE public.comb_abastecimentos_pendentes SET criado_em = now() - interval '6 minutes' WHERE veiculo_id = $1`, [viatura])
    await expect(pedir(viatura)).resolves.toBeDefined()
  })
})
