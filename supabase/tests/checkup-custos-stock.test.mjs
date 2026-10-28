// @vitest-environment node
// Checkup 2026-10-28, lote BD-5: custos e stock (A3-02, A3-09, A3-03 RPC, A3-06 + A1-06, A1-10 — 20261028120500).
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { criarBanco, como } from './pg-harness.mjs'

const MIGRATION = fileURLToPath(new URL('../migrations/20261028120500_checkup_custos_stock.sql', import.meta.url))

let db, admin, armazem

async function utilizador(role, email) {
  const { rows } = await db.query(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [email])
  await db.query(`UPDATE public.profiles SET role = $1, nome = $2 WHERE id = $3`, [role, email, rows[0].id])
  return rows[0].id
}
const u = (uid, fn) => como(db, { papel: 'authenticated', uid }, fn)
const q1 = async (uid, sql, p = []) => (await u(uid, tx => tx.query(sql, p))).rows[0]
const novaObra = async (nome) => (await db.query(`INSERT INTO public.obras (nome) VALUES ($1) RETURNING id`, [nome])).rows[0].id
const novoProduto = async (stock = 200) => (await db.query(`INSERT INTO public.produtos (codigo, nome, categoria, unidade, stock_atual, custo_unitario)
  VALUES ($1, 'Cimento 25kg', 'cimento', 'saco', $2, 5) RETURNING id`, [`P-${randomUUID().slice(0, 8)}`, stock])).rows[0].id
const mov = (uid, produto, subtipo, qtd, obra) => q1(uid,
  `SELECT * FROM public.registar_movimento_armazem($1, $2, $3, 'Zé', $4)`, [produto, subtipo, qtd, obra])
const materiais = async (obra, ini, fim) =>
  Number((await q1(admin, `SELECT public.custos_consolidados_por_obra($1, $2, $3) AS j`, [obra, ini, fim])).j.materiais)

beforeAll(async () => {
  db = await criarBanco()
  admin   = await utilizador('admin', 'admin@t.pt')
  armazem = await utilizador('armazem', 'arm@t.pt')
}, 120_000)

describe('A3-02 — custos consolidados descontam devoluções', () => {
  it('saída 100 + devolução 40 a 5 € → 300 €, igual a custos_materiais_por_obra', async () => {
    const obra = await novaObra('Devoluções'), produto = await novoProduto()
    await mov(armazem, produto, 'OBRA', 100, obra)
    await mov(armazem, produto, 'DEVOLUCAO_OBRA', 40, obra)
    expect(await materiais(obra, '2000-01-01', '2100-12-31')).toBe(300)
    const r = await q1(admin, `SELECT materiais FROM public.custos_materiais_por_obra() WHERE obra_id = $1`, [obra])
    expect(Number(r.materiais)).toBe(300)
  })

  it('o total também desce com a devolução (a forma do JSON não muda)', async () => {
    const obra = await novaObra('Total'), produto = await novoProduto()
    await mov(armazem, produto, 'OBRA', 10, obra)
    await mov(armazem, produto, 'DEVOLUCAO_OBRA', 4, obra)
    const j = (await q1(admin, `SELECT public.custos_consolidados_por_obra($1, '2000-01-01', '2100-12-31') AS j`, [obra])).j
    expect(Object.keys(j).sort()).toEqual(['combustivel', 'fornecedores', 'mao_de_obra', 'materiais', 'subempreiteiros', 'total'])
    expect(Number(j.materiais)).toBe(30)
    expect(Number(j.total)).toBe(30)
  })
})

describe('A3-09 — dias cortados em Europe/Lisbon', () => {
  it('saída às 23:30 UTC de 30/06 conta no dia 01/07', async () => {
    const obra = await novaObra('Fuso'), produto = await novoProduto()
    await db.query(`INSERT INTO public.movimentos_stock (produto_id, tipo, subtipo, quantidade, stock_antes, stock_depois, responsavel, obra_id, destino_obra, created_at)
      VALUES ($1, 'saida', 'OBRA', 10, 200, 190, 'Zé', $2, 'Fuso', '2026-06-30 23:30:00+00')`, [produto, obra])
    expect(await materiais(obra, '2026-07-01', '2026-07-31')).toBe(50)
    expect(await materiais(obra, '2026-06-01', '2026-06-30')).toBe(0)
  })

  it('p_data_fim por omissão é o dia de hoje em Lisboa', async () => {
    const { rows: [r] } = await db.query(
      `SELECT pg_get_function_arguments('public.custos_consolidados_por_obra(uuid, date, date)'::regprocedure) AS a`)
    expect(r.a).toMatch(/p_data_fim date DEFAULT _hoje_pt\(\)/)
  })
})

describe('A3-03 — armazem_materiais_por_obra com ordem estável (paginação)', () => {
  it('ORDER BY obra_nome, produto_nome, produto_id', async () => {
    const { rows: [r] } = await db.query(`SELECT pg_get_functiondef('public.armazem_materiais_por_obra(uuid)'::regprocedure) AS d`)
    expect(r.d).toMatch(/ORDER BY o\.nome, p\.nome, p\.id/)
  })

  it('devolve as linhas pela ordem obra → artigo', async () => {
    const b = await novaObra('ZZ Obra B'), a = await novaObra('ZZ Obra A'), p = await novoProduto()
    await mov(armazem, p, 'OBRA', 1, b)
    await mov(armazem, p, 'OBRA', 1, a)
    const { rows } = await u(admin, tx => tx.query(`SELECT obra_nome FROM public.armazem_materiais_por_obra() WHERE obra_nome LIKE 'ZZ %'`))
    expect(rows.map(r => r.obra_nome)).toEqual(['ZZ Obra A', 'ZZ Obra B'])
  })
})

describe('A3-06 / A1-06 — stock só por movimentos; unidade fixa depois do 1.º movimento', () => {
  it('armazem: INSERT direto com stock_atual é recusado (42501)', async () => {
    await expect(u(armazem, tx => tx.query(`INSERT INTO public.produtos (nome, categoria, unidade, stock_atual)
      VALUES ('Fantasma', 'cimento', 'un', 500)`))).rejects.toMatchObject({ code: '42501' })
  })

  it('armazem: INSERT direto com codigo é recusado (o código vem da sequência)', async () => {
    await expect(u(armazem, tx => tx.query(`INSERT INTO public.produtos (codigo, nome, categoria, unidade)
      VALUES ('PX999', 'Fantasma', 'cimento', 'un')`))).rejects.toMatchObject({ code: '42501' })
  })

  it('armazem: INSERT sem stock_atual é aceite e nasce com 0', async () => {
    const r = await q1(armazem, `INSERT INTO public.produtos (id, nome, categoria, unidade, stock_minimo, custo_unitario, observacoes, foto_path, localizacao, ativo)
      VALUES (gen_random_uuid(), 'Areia', 'agregados', 'kg', 1, 2, 'o', NULL, 'A1', true) RETURNING stock_atual, codigo`)
    expect(Number(r.stock_atual)).toBe(0)
    expect(r.codigo).toBeTruthy()
  })

  it('criar_produto (RPC) continua a criar com stock inicial por movimento', async () => {
    const r = await q1(armazem, `SELECT * FROM public.criar_produto($1::jsonb)`,
      [JSON.stringify({ nome: 'Tijolo', categoria: 'alvenaria', unidade: 'un', stock_inicial: 12, responsavel: 'Zé' })])
    expect(Number(r.stock_atual)).toBe(12)
  })

  it('mudar a unidade depois de um movimento é recusado; o resto do artigo continua editável', async () => {
    const p = await novoProduto(0)
    await q1(armazem, `SELECT * FROM public.registar_movimento_armazem($1, 'COMPRA', 5, 'Zé', NULL, 'Leroy')`, [p])
    await expect(u(admin, tx => tx.query(`UPDATE public.produtos SET unidade = 'kg' WHERE id = $1`, [p])))
      .rejects.toThrow(/unidade não pode mudar depois do primeiro movimento/)
    await u(admin, tx => tx.query(`UPDATE public.produtos SET unidade = 'saco', nome = 'Cimento 35kg' WHERE id = $1`, [p]))
    expect((await db.query(`SELECT nome, unidade FROM public.produtos WHERE id = $1`, [p])).rows[0]).toEqual({ nome: 'Cimento 35kg', unidade: 'saco' })
  })

  it('sem movimentos, a unidade pode mudar', async () => {
    const p = await novoProduto(0)
    await u(admin, tx => tx.query(`UPDATE public.produtos SET unidade = 'kg' WHERE id = $1`, [p]))
    expect((await db.query(`SELECT unidade FROM public.produtos WHERE id = $1`, [p])).rows[0].unidade).toBe('kg')
  })
})

describe('A1-10 — movimentos_stock sem UPDATE/DELETE/TRUNCATE', () => {
  it('TRUNCATE como dono da tabela também é recusado (mesmo em CASCADE)', async () => {
    // Em transação: se o TRUNCATE passar (antes da correção) nada fica apagado
    await expect(db.transaction(async tx => {
      await tx.query(`TRUNCATE public.movimentos_stock CASCADE`)
      throw new Error('TRUNCATE passou')
    })).rejects.toThrow(/imutáveis/)
  })

  it('a porta do armazém continua a registar movimentos', async () => {
    const obra = await novaObra('Porta'), p = await novoProduto()
    const m = await mov(armazem, p, 'OBRA', 3, obra)
    expect(Number(m.stock_depois)).toBe(197)
  })
})

describe('A1-10 — privilégios concedidos por omissão no Supabase são retirados', () => {
  it.each(['authenticated', 'anon'])('%s fica sem UPDATE, DELETE e TRUNCATE em movimentos_stock', async (papel) => {
    // O PGlite não tem os default privileges do Supabase (ALL para anon/authenticated): simulam-se
    await db.exec(`GRANT UPDATE, DELETE, TRUNCATE ON public.movimentos_stock TO ${papel}`)
    await db.exec(readFileSync(MIGRATION, 'utf8'))
    const { rows: [r] } = await db.query(`SELECT has_table_privilege($1, 'public.movimentos_stock', 'UPDATE') AS u,
      has_table_privilege($1, 'public.movimentos_stock', 'DELETE') AS d,
      has_table_privilege($1, 'public.movimentos_stock', 'TRUNCATE') AS t,
      has_column_privilege($1, 'public.produtos', 'stock_atual', 'INSERT') AS s`, [papel])
    expect(r).toEqual({ u: false, d: false, t: false, s: false })
  })
})

describe('migration idempotente', () => {
  it('aplica uma 2.ª vez sem erro e as regras mantêm-se', async () => {
    await db.exec(readFileSync(MIGRATION, 'utf8'))
    await db.exec(readFileSync(MIGRATION, 'utf8'))
    await expect(db.transaction(tx => tx.query(`TRUNCATE public.movimentos_stock CASCADE`))).rejects.toThrow(/imutáveis/)
    const obra = await novaObra('Idem'), p = await novoProduto()
    await mov(armazem, p, 'OBRA', 2, obra)
    await mov(armazem, p, 'DEVOLUCAO_OBRA', 1, obra)
    expect(await materiais(obra, '2000-01-01', '2100-12-31')).toBe(5)
  })
})
