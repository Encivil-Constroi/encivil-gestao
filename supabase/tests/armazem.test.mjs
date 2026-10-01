// @vitest-environment node
// Armazém completo (20261001000000) num Postgres real com todas as migrations.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { criarBanco, como } from './pg-harness.mjs'

let db, admin, armazem, leitura, motorista, obraAtiva, obraConcluida, produto, ferr

async function utilizador(role, email) {
  const { rows } = await db.query(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [email])
  await db.query(`UPDATE public.profiles SET role = $1, nome = $2 WHERE id = $3`, [role, email, rows[0].id])
  return rows[0].id
}
const u = (uid, fn) => como(db, { papel: 'authenticated', uid }, fn)
const anon = fn => como(db, { papel: 'anon' }, fn)
const q1 = async (uid, sql, p = []) => (await u(uid, tx => tx.query(sql, p))).rows[0]
const stock = async () => Number((await db.query(`SELECT stock_atual FROM public.produtos WHERE id = $1`, [produto])).rows[0].stock_atual)

// subtipo, quantidade, { obra, fornecedor, fatura, cliente, preco, obs }
const mov = (uid, subtipo, qtd, o = {}) => q1(uid,
  `SELECT * FROM public.registar_movimento_armazem($1, $2, $3, 'Zé', $4, $5, $6, $7, $8, $9)`,
  [produto, subtipo, qtd, o.obra ?? null, o.fornecedor ?? null, o.fatura ?? null, o.cliente ?? null, o.preco ?? null, o.obs ?? null])

beforeAll(async () => {
  db = await criarBanco()
  admin     = await utilizador('admin', 'admin@t.pt')
  armazem   = await utilizador('armazem', 'arm@t.pt')
  leitura   = await utilizador('leitura', 'lei@t.pt')
  motorista = await utilizador('motorista', 'mot@t.pt')
  obraAtiva     = (await db.query(`INSERT INTO public.obras (nome) VALUES ('Moradia Sintra') RETURNING id`)).rows[0].id
  obraConcluida = (await db.query(`INSERT INTO public.obras (nome, estado) VALUES ('Antiga', 'concluida') RETURNING id`)).rows[0].id
  await db.query(`INSERT INTO storage.buckets (id, name, public) VALUES ('armazem', 'armazem', true) ON CONFLICT DO NOTHING`)
}, 120_000)

beforeEach(async () => {
  produto = (await db.query(`INSERT INTO public.produtos (codigo, nome, categoria, unidade, stock_atual, custo_unitario)
    VALUES ($1, 'Cimento 25kg', 'cimento', 'saco', 10, 5) RETURNING id`, [`P-${randomUUID().slice(0, 8)}`])).rows[0].id
  ferr = (await db.query(`INSERT INTO public.ferramentas (codigo, nome) VALUES ($1, 'Berbequim') RETURNING id`,
    [`F-${randomUUID().slice(0, 8)}`])).rows[0].id
})

describe('entradas', () => {
  it('compra: soma ao stock, guarda fornecedor/fatura/preço e atualiza o custo do artigo', async () => {
    const m = await mov(armazem, 'COMPRA', 20, { fornecedor: ' Leroy ', fatura: 'FT 2026/12', preco: 4.5, obs: 'palete' })
    expect(m).toMatchObject({ tipo: 'entrada', subtipo: 'COMPRA', fornecedor: 'Leroy', numero_fatura: 'FT 2026/12', observacoes: 'palete', obra_id: null })
    expect(Number(m.stock_antes)).toBe(10); expect(Number(m.stock_depois)).toBe(30)
    expect(Number(m.preco_unitario)).toBe(4.5)
    expect(Number((await db.query(`SELECT custo_unitario FROM public.produtos WHERE id = $1`, [produto])).rows[0].custo_unitario)).toBe(4.5)
  })

  it('compra sem fornecedor é recusada; compra sem preço não mexe no custo', async () => {
    await expect(mov(armazem, 'COMPRA', 1, { fornecedor: '  ' })).rejects.toThrow(/fornecedor/)
    await mov(armazem, 'COMPRA', 1, { fornecedor: 'ENCIVIL' })
    expect(Number((await db.query(`SELECT custo_unitario FROM public.produtos WHERE id = $1`, [produto])).rows[0].custo_unitario)).toBe(5)
  })

  it('devolução de obra: exige a obra e desconta no que está na obra', async () => {
    await expect(mov(armazem, 'DEVOLUCAO_OBRA', 1)).rejects.toThrow(/Escolha a obra/)
    await mov(armazem, 'OBRA', 6, { obra: obraAtiva })
    await mov(armazem, 'DEVOLUCAO_OBRA', 2, { obra: obraAtiva })
    expect(await stock()).toBe(6)
    const r = (await u(armazem, tx => tx.query(`SELECT * FROM public.armazem_materiais_por_obra($1) WHERE produto_id = $2`, [obraAtiva, produto]))).rows[0]
    expect({ e: Number(r.enviado), d: Number(r.devolvido), l: Number(r.liquido), v: Number(r.valor) }).toEqual({ e: 6, d: 2, l: 4, v: 20 })
  })

  it('stock próprio ENCIVIL e acerto não levam fornecedor nem obra', async () => {
    const m = await mov(armazem, 'PROPRIO_ENCIVIL', 3, { fornecedor: 'X' })
    expect(m.fornecedor).toBeNull()
    await expect(mov(armazem, 'ACERTO', 1, { obra: obraAtiva })).rejects.toThrow(/não leva obra/)
  })
})

describe('saídas', () => {
  it('para obra em execução: tira do stock e regista a obra', async () => {
    const m = await mov(armazem, 'OBRA', 4, { obra: obraAtiva, fatura: 'GT-1' })
    expect(m).toMatchObject({ tipo: 'saida', subtipo: 'OBRA', obra_id: obraAtiva, destino_obra: 'Moradia Sintra', numero_fatura: 'GT-1' })
    expect(await stock()).toBe(6)
  })

  it('obra concluída ou sem obra: recusado', async () => {
    await expect(mov(armazem, 'OBRA', 1, { obra: obraConcluida })).rejects.toThrow(/concluída/)
    await expect(mov(armazem, 'OBRA', 1)).rejects.toThrow(/Escolha a obra/)
  })

  it('venda comercial: exige cliente; guarda preço de venda e não conta como custo de obra', async () => {
    await expect(mov(armazem, 'VENDA', 1)).rejects.toThrow(/cliente/)
    const m = await mov(armazem, 'VENDA', 2, { cliente: 'Construções Lda', preco: 9, fatura: 'FV 7' })
    expect(m).toMatchObject({ subtipo: 'VENDA', cliente: 'Construções Lda', obra_id: null, destino_obra: 'Venda: Construções Lda' })
    expect(Number(m.preco_unitario)).toBe(9)
    expect(Number((await db.query(`SELECT custo_unitario FROM public.produtos WHERE id = $1`, [produto])).rows[0].custo_unitario)).toBe(5)
  })

  it('stock insuficiente é recusado', async () => {
    await expect(mov(armazem, 'QUEBRA', 11)).rejects.toThrow(/Stock insuficiente/)
  })

  it('custo da obra desconta devoluções; vendas e compras com obra não entram', async () => {
    const o = (await db.query(`INSERT INTO public.obras (nome) VALUES ('Custos') RETURNING id`)).rows[0].id
    await mov(armazem, 'OBRA', 5, { obra: o })
    await mov(armazem, 'DEVOLUCAO_OBRA', 1, { obra: o })
    await mov(armazem, 'VENDA', 1, { cliente: 'C' })
    await db.query(`INSERT INTO public.movimentos_stock (produto_id, tipo, quantidade, stock_antes, stock_depois, responsavel, obra_id)
                    VALUES ($1, 'entrada', 50, 0, 50, 'fatura', $2)`, [produto, o])
    const r = (await u(admin, tx => tx.query(`SELECT * FROM public.custos_materiais_por_obra() WHERE obra_id = $1`, [o]))).rows[0]
    expect(Number(r.materiais)).toBe(20)  // (5 − 1) × 5 €
  })
})

describe('inventário e validações', () => {
  it('acerto de inventário fixa o stock contado', async () => {
    const m = await mov(armazem, 'INVENTARIO', 7)
    expect(m).toMatchObject({ tipo: 'ajuste', subtipo: 'INVENTARIO' })
    expect(await stock()).toBe(7)
    await expect(mov(armazem, 'INVENTARIO', 0)).rejects.toThrow(/Quantidade/)
  })

  it.each([['tipo inventado', 'OUTRO', 1, /Tipo de movimento/], ['quantidade 0', 'COMPRA', 0, /Quantidade/], ['negativa', 'QUEBRA', -1, /Quantidade/]])(
    'recusa %s', async (_n, s, q, e) => { await expect(mov(armazem, s, q, { fornecedor: 'F' })).rejects.toThrow(e) })

  it('preço negativo recusado', async () => {
    await expect(mov(armazem, 'COMPRA', 1, { fornecedor: 'F', preco: -1 })).rejects.toThrow(/Preço/)
  })

  it('sem permissão: leitura e motorista não movimentam; anónimo nem chega', async () => {
    for (const uid of [leitura, motorista]) await expect(mov(uid, 'COMPRA', 1, { fornecedor: 'F' })).rejects.toThrow(/Autorização negada/)
    await expect(anon(tx => tx.query(`SELECT public.registar_movimento_armazem($1, 'COMPRA', 1, 'x')`, [produto]))).rejects.toThrow(/permission denied/)
    expect(await stock()).toBe(10)
  })

  it('subtipo incoerente com o tipo é barrado pela própria tabela', async () => {
    await expect(db.query(`INSERT INTO public.movimentos_stock (produto_id, tipo, quantidade, stock_antes, stock_depois, responsavel, subtipo)
      VALUES ($1, 'entrada', 1, 0, 1, 'x', 'VENDA')`, [produto])).rejects.toThrow(/ck_mov_subtipo/)
  })
})

describe('ferramentas: garantia e n.º de série', () => {
  it('garantia antes da compra é recusada', async () => {
    await expect(db.query(`UPDATE public.ferramentas SET data_compra = '2026-05-01', garantia_ate = '2026-01-01' WHERE id = $1`, [ferr]))
      .rejects.toThrow(/ck_ferr_garantia/)
  })

  it('n.º de série repetido (ignora maiúsculas e espaços) é recusado', async () => {
    await db.query(`UPDATE public.ferramentas SET numero_serie = 'AB-123' WHERE id = $1`, [ferr])
    await expect(db.query(`INSERT INTO public.ferramentas (codigo, nome, numero_serie) VALUES ('F-dup', 'Outra', ' ab-123 ')`))
      .rejects.toThrow(/uq_ferramentas_numero_serie/)
  })
})

describe('fotos (storage)', () => {
  const enviar = (uid, nome, bucket = 'armazem') => u(uid, tx => tx.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ($1, $2)`, [bucket, nome]))

  it('armazém envia fotos de produtos e de ferramentas; caminhos livres não', async () => {
    await enviar(armazem, `produtos/${randomUUID()}/1727.jpg`)
    await enviar(armazem, `ferramentas/${randomUUID()}/entrega_1727.webp`)
    for (const n of ['qualquer.jpg', `produtos/${randomUUID()}/x.html`, `produtos/../${randomUUID()}/1.jpg`, `outros/${randomUUID()}/1.jpg`])
      await expect(enviar(armazem, n)).rejects.toThrow(/row-level security/)
  })

  it('leitura, motorista e anónimo não enviam', async () => {
    for (const uid of [leitura, motorista]) await expect(enviar(uid, `produtos/${randomUUID()}/1.jpg`)).rejects.toThrow(/row-level security/)
    await expect(anon(tx => tx.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('armazem', $1)`, [`produtos/${randomUUID()}/1.jpg`])))
      .rejects.toThrow(/row-level security|permission denied/)
  })
})

describe('empréstimos com foto', () => {
  const foto = async (tipo = 'entrega', id = ferr) => {
    const n = `ferramentas/${id}/${tipo}_${Date.now()}${Math.floor(Math.random() * 1000)}.jpg`
    await u(armazem, tx => tx.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('armazem', $1)`, [n]))
    return n
  }
  const emprestar = (f, ferramenta = ferr) => q1(armazem,
    `SELECT * FROM public.registar_emprestimo_ferramenta($1, 'Rui', 'Zé', NULL, NULL, NULL, NULL, NULL, $2, NULL, NULL, $3)`, [ferramenta, obraAtiva, f])
  const devolver = (id, condicao, f) => q1(armazem,
    `SELECT * FROM public.registar_devolucao_ferramenta($1, $2, 'Zé', NULL, NULL, NULL, $3)`, [id, condicao, f])

  it('sem foto não empresta; foto de outra ferramenta ou inexistente também não', async () => {
    await expect(emprestar(null)).rejects.toThrow(/foto do estado/)
    await expect(emprestar(`ferramentas/${ferr}/entrega_1.jpg`)).rejects.toThrow(/foto do estado/)
    const outra = (await db.query(`INSERT INTO public.ferramentas (codigo, nome) VALUES ($1, 'X') RETURNING id`, [`F-${randomUUID().slice(0, 8)}`])).rows[0].id
    await expect(emprestar(await foto('entrega', outra))).rejects.toThrow(/foto do estado/)
  })

  it('empresta com foto; em uso não volta a emprestar e diz quem a tem', async () => {
    const e = await emprestar(await foto())
    expect(e).toMatchObject({ estado: 'ativo', obra_id: obraAtiva })
    expect(e.foto_entrega_path).toMatch(new RegExp(`^ferramentas/${ferr}/entrega_`))
    await expect(emprestar(await foto())).rejects.toThrow(/em uso por Rui/)
  })

  it('devolução exige foto (exceto perdida) e guarda-a', async () => {
    const e = await emprestar(await foto())
    await expect(devolver(e.id, 'bom_estado', null)).rejects.toThrow(/foto do estado em que/)
    const d = await devolver(e.id, 'danificada', await foto('devolucao'))
    expect(d.foto_devolucao_path).toMatch(/devolucao_/)
    expect((await db.query(`SELECT estado FROM public.ferramentas WHERE id = $1`, [ferr])).rows[0].estado).toBe('manutencao')
  })

  it('perdida dispensa a foto e inativa a ferramenta', async () => {
    const e = await emprestar(await foto())
    const d = await devolver(e.id, 'perdida', null)
    expect(d.foto_devolucao_path).toBeNull()
    expect((await db.query(`SELECT estado FROM public.ferramentas WHERE id = $1`, [ferr])).rows[0].estado).toBe('inativa')
  })

  it('leitura não empresta', async () => {
    await expect(q1(leitura, `SELECT * FROM public.registar_emprestimo_ferramenta($1, 'Rui', 'Zé')`, [ferr])).rejects.toThrow(/Autorização negada/)
  })
})
