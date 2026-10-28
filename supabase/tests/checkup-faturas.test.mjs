// @vitest-environment node
// Checkup 2026-10-28, lote BD-4: lançamento de faturas atómico e fatura LANCADA imutável
// (A3-01, A3-04, A3-05, A3-07 parcial — 20261028120400).
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { criarBanco, como } from './pg-harness.mjs'

const MIGRATION = fileURLToPath(new URL('../migrations/20261028120400_checkup_faturas.sql', import.meta.url))

let db, gestor, produto
const q = async (sql, p = []) => (await como(db, { papel: 'authenticated', uid: gestor }, tx => tx.query(sql, p))).rows
const stock = async () => Number((await db.query(`SELECT stock_atual FROM public.produtos WHERE id = $1`, [produto])).rows[0].stock_atual)
const estado = async (id) => (await db.query(`SELECT estado FROM public.faturas_fornecedor WHERE id = $1`, [id])).rows[0].estado

// Fatura CLASSIFICADA com as linhas pedidas (por omissão, uma linha ARMAZEM de 10 unidades)
async function novaFatura(linhas = [{ destino: 'ARMAZEM', artigo: true, quantidade: 10 }]) {
  const id = (await db.query(`INSERT INTO public.faturas_fornecedor (fornecedor, numero_fatura, estado, criado_por)
    VALUES ('Leroy', 'FT ' || floor(random() * 1e6)::text, 'CLASSIFICADA', $1) RETURNING id`, [gestor])).rows[0].id
  for (const l of linhas) {
    await db.query(`INSERT INTO public.linhas_fatura (fatura_id, descricao, descricao_norm, quantidade, destino, artigo_id)
      VALUES ($1, 'Cimento', 'cimento', $2, $3, $4)`, [id, l.quantidade ?? null, l.destino, l.artigo ? produto : null])
  }
  return id
}
const lancar = (id) => q(`SELECT public.lancar_fatura($1, 'Zé')`, [id])

beforeAll(async () => {
  db = await criarBanco()
  const { rows } = await db.query(`INSERT INTO auth.users (email) VALUES ('g@t.pt') RETURNING id`)
  gestor = rows[0].id
  await db.query(`UPDATE public.profiles SET role = 'gestor', nome = 'Gestor' WHERE id = $1`, [gestor])
  produto = (await db.query(`INSERT INTO public.produtos (codigo, nome, categoria, unidade, stock_atual, custo_unitario)
    VALUES ('F-1', 'Cimento', 'cimento', 'saco', 0, 5) RETURNING id`)).rows[0].id
}, 120_000)

describe('A3-01 — lançamento serializado por fatura', () => {
  it('_lancar_fatura_impl bloqueia a fatura (FOR UPDATE) antes de validar o estado', async () => {
    const { rows: [r] } = await db.query(`SELECT pg_get_functiondef('public._lancar_fatura_impl(uuid, text)'::regprocedure) AS d`)
    expect(r.d).toMatch(/FOR UPDATE/)
    expect(r.d.indexOf('FOR UPDATE')).toBeLessThan(r.d.indexOf('CLASSIFICADA'))
  })

  it('2.º lançamento da mesma fatura é recusado e o stock só entra uma vez', async () => {
    const id = await novaFatura()
    const antes = await stock()
    await lancar(id)
    await expect(lancar(id)).rejects.toThrow(/não está no estado CLASSIFICADA/)
    expect(await stock()).toBe(antes + 10)
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM public.linhas_fatura l
      JOIN public.movimentos_stock m ON m.id = l.movimento_id WHERE l.fatura_id = $1`, [id])
    expect(rows[0].n).toBe(1)
  })
})

describe('A3-04 / A3-07 — linhas ARMAZEM inválidas e ligação ao movimento', () => {
  it('linha ARMAZEM sem artigo: erro, fatura continua CLASSIFICADA e nenhum stock entra', async () => {
    const id = await novaFatura([
      { destino: 'ARMAZEM', artigo: true, quantidade: 3 },
      { destino: 'ARMAZEM', artigo: false, quantidade: 2 },
    ])
    const antes = await stock()
    await expect(lancar(id)).rejects.toThrow(/sem artigo/)
    expect(await estado(id)).toBe('CLASSIFICADA')
    expect(await stock()).toBe(antes)
  })

  it('linha ARMAZEM sem quantidade: erro (já não entra como 1)', async () => {
    const id = await novaFatura([{ destino: 'ARMAZEM', artigo: true, quantidade: null }])
    const antes = await stock()
    await expect(lancar(id)).rejects.toThrow(/quantidade/)
    expect(await estado(id)).toBe('CLASSIFICADA')
    expect(await stock()).toBe(antes)
  })

  it('linhas OBRA/SERVICO sem artigo não impedem o lançamento', async () => {
    const id = await novaFatura([
      { destino: 'ARMAZEM', artigo: true, quantidade: 1 },
      { destino: 'OBRA', artigo: false, quantidade: null },
      { destino: 'SERVICO', artigo: false, quantidade: 1 },
    ])
    await lancar(id)
    expect(await estado(id)).toBe('LANCADA')
  })

  it('lançar liga cada linha ARMAZEM ao seu movimento', async () => {
    const id = await novaFatura([
      { destino: 'ARMAZEM', artigo: true, quantidade: 4 },
      { destino: 'ARMAZEM', artigo: true, quantidade: 6 },
    ])
    await lancar(id)
    const { rows } = await db.query(`SELECT l.quantidade, l.lancado, m.quantidade AS mq, m.tipo FROM public.linhas_fatura l
      LEFT JOIN public.movimentos_stock m ON m.id = l.movimento_id WHERE l.fatura_id = $1 ORDER BY l.quantidade`, [id])
    expect(rows.map(r => [Number(r.quantidade), r.lancado, Number(r.mq), r.tipo]))
      .toEqual([[4, true, 4, 'entrada'], [6, true, 6, 'entrada']])
  })
})

describe('A3-05 — fatura LANCADA imutável', () => {
  let id, linha
  beforeAll(async () => {
    id = await novaFatura()
    await lancar(id)
    linha = (await db.query(`SELECT id FROM public.linhas_fatura WHERE fatura_id = $1`, [id])).rows[0].id
  })

  it('gestor não desmarca nem altera linhas', async () => {
    await expect(q(`UPDATE public.linhas_fatura SET lancado = false WHERE id = $1`, [linha])).rejects.toThrow(/LANCADA/)
    await expect(q(`UPDATE public.linhas_fatura SET quantidade = 99 WHERE id = $1`, [linha])).rejects.toThrow(/LANCADA/)
  })
  it('gestor não acrescenta nem apaga linhas', async () => {
    await expect(q(`INSERT INTO public.linhas_fatura (fatura_id, descricao, quantidade, destino, artigo_id)
      VALUES ($1, 'Extra', 1, 'ARMAZEM', $2)`, [id, produto])).rejects.toThrow(/LANCADA/)
    await expect(q(`DELETE FROM public.linhas_fatura WHERE id = $1`, [linha])).rejects.toThrow(/LANCADA/)
  })
  it('gestor não volta a pôr a fatura em CLASSIFICADA nem muda o fornecedor', async () => {
    await expect(q(`UPDATE public.faturas_fornecedor SET estado = 'CLASSIFICADA' WHERE id = $1`, [id])).rejects.toThrow(/LANCADA/)
    await expect(q(`UPDATE public.faturas_fornecedor SET fornecedor = 'Outro' WHERE id = $1`, [id])).rejects.toThrow(/LANCADA/)
    expect(await estado(id)).toBe('LANCADA')
  })
  it('classificar_e_aprender recusa fatura LANCADA', async () => {
    await expect(q(`SELECT public.classificar_e_aprender($1, $2::jsonb)`,
      [id, JSON.stringify([{ id: linha, destino: 'OBRA', artigo_id: '', confianca: 1 }])])).rejects.toThrow(/não pode ser classificada/)
    const { rows } = await db.query(`SELECT destino FROM public.linhas_fatura WHERE id = $1`, [linha])
    expect(rows[0].destino).toBe('ARMAZEM')
  })
  it('dados fiscais continuam editáveis depois do lançamento (atualizarDadosFiscaisFatura)', async () => {
    const rows = await q(`UPDATE public.faturas_fornecedor SET nif_fornecedor = '500000000', base_tributavel = 100,
      valor_iva = 23, observacoes = 'ok' WHERE id = $1 RETURNING valor_iva`, [id])
    expect(Number(rows[0].valor_iva)).toBe(23)
  })
  it('apagar a obra de uma fatura LANCADA continua possível (ON DELETE SET NULL)', async () => {
    const obra = (await db.query(`INSERT INTO public.obras (nome) VALUES ('Obra apagável') RETURNING id`)).rows[0].id
    // Sem linhas ARMAZEM: uma obra com movimentos de stock já não se pode apagar (FK de movimentos_stock)
    const f = await novaFatura([{ destino: 'SERVICO', artigo: false, quantidade: 1 }])
    await db.query(`UPDATE public.faturas_fornecedor SET obra_id = $1 WHERE id = $2`, [obra, f])
    await lancar(f)
    await db.query(`DELETE FROM public.obras WHERE id = $1`, [obra])
    const { rows } = await db.query(`SELECT obra_id, estado FROM public.faturas_fornecedor WHERE id = $1`, [f])
    expect(rows[0]).toEqual({ obra_id: null, estado: 'LANCADA' })
  })
})

describe('A3-05 — classificar_e_aprender só mexe nas linhas da própria fatura', () => {
  it('linha de outra fatura no payload não é alterada', async () => {
    const a = await novaFatura()
    const b = await novaFatura()
    await db.query(`UPDATE public.faturas_fornecedor SET estado = 'EXTRAIDA' WHERE id = $1`, [a])
    const linhaB = (await db.query(`SELECT id FROM public.linhas_fatura WHERE fatura_id = $1`, [b])).rows[0].id
    await q(`SELECT public.classificar_e_aprender($1, $2::jsonb)`,
      [a, JSON.stringify([{ id: linhaB, destino: 'SERVICO', artigo_id: '', confianca: 1 }])])
    const { rows } = await db.query(`SELECT destino FROM public.linhas_fatura WHERE id = $1`, [linhaB])
    expect(rows[0].destino).toBe('ARMAZEM')
    expect(await estado(a)).toBe('CLASSIFICADA')
  })
  it('reclassificação de fatura CLASSIFICADA continua a funcionar', async () => {
    const a = await novaFatura()
    const l = (await db.query(`SELECT id FROM public.linhas_fatura WHERE fatura_id = $1`, [a])).rows[0].id
    await q(`SELECT public.classificar_e_aprender($1, $2::jsonb)`,
      [a, JSON.stringify([{ id: l, destino: 'OBRA', artigo_id: '', confianca: 1 }])])
    const { rows } = await db.query(`SELECT destino FROM public.linhas_fatura WHERE id = $1`, [l])
    expect(rows[0].destino).toBe('OBRA')
  })
})

describe('migration idempotente', () => {
  it('aplica uma 2.ª vez sem erro e o lançamento continua a funcionar', async () => {
    await db.exec(readFileSync(MIGRATION, 'utf8'))
    const id = await novaFatura()
    await lancar(id)
    expect(await estado(id)).toBe('LANCADA')
  })
})
