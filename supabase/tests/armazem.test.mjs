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

// ── Integridade do stock (20261020110000) ────────────────────────────────────
describe('integridade: reenvio idempotente (client_id)', () => {
  const movC = (uid, cid, qtd = 2) => q1(uid,
    `SELECT * FROM public.registar_movimento_armazem($1, 'COMPRA', $2, 'Zé', NULL, 'Leroy', NULL, NULL, NULL, NULL, $3)`,
    [produto, qtd, cid])

  it('o mesmo client_id devolve o movimento já gravado e não mexe outra vez no stock', async () => {
    const cid = randomUUID()
    const a = await movC(armazem, cid)
    const b = await movC(armazem, cid)
    expect(b.id).toBe(a.id)
    expect(a.client_id).toBe(cid)
    expect(await stock()).toBe(12)
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM public.movimentos_stock WHERE client_id = $1`, [cid])
    expect(rows[0].n).toBe(1)
  })

  it('client_id de outra pessoa é recusado (não devolve o registo alheio)', async () => {
    const cid = randomUUID()
    await movC(armazem, cid)
    await expect(movC(admin, cid)).rejects.toThrow(/já foi usado/)
    expect(await stock()).toBe(12)
  })

  it('sem client_id continua a registar sempre (chamada antiga)', async () => {
    await mov(armazem, 'COMPRA', 1, { fornecedor: 'F' })
    await mov(armazem, 'COMPRA', 1, { fornecedor: 'F' })
    expect(await stock()).toBe(12)
  })

  it('índice único impede dois movimentos com o mesmo client_id', async () => {
    const { rows } = await db.query(`SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_movimentos_client_id'`)
    expect(rows[0].indexdef).toMatch(/UNIQUE/)
  })
})

describe('integridade: stock_atual só por movimentos', () => {
  it('UPDATE direto de stock_atual é recusado; os outros campos continuam editáveis', async () => {
    for (const uid of [admin, armazem]) {
      await expect(u(uid, tx => tx.query(`UPDATE public.produtos SET stock_atual = 999 WHERE id = $1`, [produto])))
        .rejects.toThrow(/permission denied/)
    }
    await u(armazem, tx => tx.query(`UPDATE public.produtos SET nome = 'Cimento 35kg', stock_minimo = 3, custo_unitario = 6,
      categoria = 'c', unidade = 'saco', observacoes = 'o', foto_path = NULL, localizacao = 'A1', ativo = true WHERE id = $1`, [produto]))
    const r = (await db.query(`SELECT nome, stock_atual FROM public.produtos WHERE id = $1`, [produto])).rows[0]
    expect(r.nome).toBe('Cimento 35kg'); expect(Number(r.stock_atual)).toBe(10)
  })
})

describe('integridade: criar_produto com stock inicial', () => {
  const criar = (uid, p) => q1(uid, `SELECT * FROM public.criar_produto($1::jsonb)`, [JSON.stringify(p)])
  const movs = async id => (await db.query(`SELECT tipo, quantidade, stock_antes, stock_depois FROM public.movimentos_stock WHERE produto_id = $1`, [id])).rows

  it('stock inicial 5 gera um movimento de entrada de 5 (0 → 5)', async () => {
    const id = randomUUID()
    const p = await criar(armazem, { id, nome: 'Areia', categoria: 'agregados', unidade: 'm3', stock_inicial: 5, stock_minimo: 2, custo_unitario: 3, localizacao: 'B2' })
    expect(p).toMatchObject({ id, nome: 'Areia', localizacao: 'B2' })
    expect(Number(p.stock_atual)).toBe(5)
    const m = await movs(id)
    expect(m).toHaveLength(1)
    expect(m[0].tipo).toBe('entrada')
    expect([m[0].quantidade, m[0].stock_antes, m[0].stock_depois].map(Number)).toEqual([5, 0, 5])
  })

  it('sem stock inicial não cria movimento', async () => {
    const p = await criar(armazem, { nome: 'Tijolo', categoria: 'ceramica', unidade: 'un' })
    expect(Number(p.stock_atual)).toBe(0)
    expect(p.codigo).toBeTruthy()
    expect(await movs(p.id)).toHaveLength(0)
  })

  it('stock inicial negativo recusado; leitura não cria', async () => {
    await expect(criar(armazem, { nome: 'X', categoria: 'c', unidade: 'un', stock_inicial: -1 })).rejects.toThrow(/Stock inicial/)
    await expect(criar(leitura, { nome: 'X', categoria: 'c', unidade: 'un' })).rejects.toThrow(/Autorização negada/)
    await expect(anon(tx => tx.query(`SELECT public.criar_produto('{}'::jsonb)`))).rejects.toThrow(/permission denied/)
  })
})

describe('integridade: movimentos imutáveis', () => {
  it('UPDATE e DELETE em movimentos_stock são recusados mesmo ao dono da BD', async () => {
    const m = await mov(armazem, 'COMPRA', 1, { fornecedor: 'F' })
    await expect(db.query(`UPDATE public.movimentos_stock SET quantidade = 99 WHERE id = $1`, [m.id])).rejects.toThrow(/imutáve/)
    await expect(db.query(`DELETE FROM public.movimentos_stock WHERE id = $1`, [m.id])).rejects.toThrow(/imutáve/)
  })

  it('a porta do armazém grava tudo no INSERT (fornecedor, fatura, preço, subtipo)', async () => {
    const m = await mov(armazem, 'VENDA', 1, { cliente: 'Cli', preco: 2, fatura: 'FV 1', obs: 'x' })
    expect(m).toMatchObject({ subtipo: 'VENDA', cliente: 'Cli', numero_fatura: 'FV 1', observacoes: 'x' })
    expect(Number(m.preco_unitario)).toBe(2)
  })
})

describe('integridade: devolução de obra limitada ao que lá está', () => {
  it('não devolve mais do que o líquido enviado para a obra', async () => {
    const o = (await db.query(`INSERT INTO public.obras (nome) VALUES ('Dev') RETURNING id`)).rows[0].id
    await expect(mov(armazem, 'DEVOLUCAO_OBRA', 1, { obra: o })).rejects.toThrow(/Só pode devolver/)
    await mov(armazem, 'OBRA', 4, { obra: o })
    await mov(armazem, 'DEVOLUCAO_OBRA', 3, { obra: o })
    await expect(mov(armazem, 'DEVOLUCAO_OBRA', 2, { obra: o })).rejects.toThrow(/Só pode devolver até 1/)
    await mov(armazem, 'DEVOLUCAO_OBRA', 1, { obra: o })
    expect(await stock()).toBe(10)
  })

  it('conta saídas antigas só com o nome da obra em texto (sem obra_id)', async () => {
    const o = (await db.query(`INSERT INTO public.obras (nome) VALUES ('Legado Lisboa') RETURNING id`)).rows[0].id
    await db.query(`INSERT INTO public.movimentos_stock (produto_id, tipo, quantidade, stock_antes, stock_depois, responsavel, destino_obra)
      VALUES ($1, 'saida', 10, 20, 10, 'Zé', '  legado LISBOA ')`, [produto])
    await expect(mov(armazem, 'DEVOLUCAO_OBRA', 11, { obra: o })).rejects.toThrow(/Só pode devolver até 10/)
    await mov(armazem, 'DEVOLUCAO_OBRA', 4, { obra: o })
    await expect(mov(armazem, 'DEVOLUCAO_OBRA', 7, { obra: o })).rejects.toThrow(/Só pode devolver até 6/)
  })
})

describe('integridade: empréstimos de ferramentas', () => {
  it('não pode haver dois empréstimos ativos da mesma ferramenta', async () => {
    const ins = () => db.query(`INSERT INTO public.emprestimos_ferramentas (ferramenta_id, funcionario_nome, responsavel_entrega, estado)
      VALUES ($1, 'Rui', 'Zé', 'ativo')`, [ferr])
    await ins()
    await expect(ins()).rejects.toThrow(/uq_emprestimo_ativo_ferramenta/)
  })

  it('authenticated não escreve diretamente em emprestimos_ferramentas (só pelas RPCs)', async () => {
    await expect(u(armazem, tx => tx.query(`INSERT INTO public.emprestimos_ferramentas (ferramenta_id, funcionario_nome, responsavel_entrega)
      VALUES ($1, 'Rui', 'Zé')`, [ferr]))).rejects.toThrow(/permission denied/)
    await expect(u(admin, tx => tx.query(`UPDATE public.emprestimos_ferramentas SET funcionario_nome = 'X'`))).rejects.toThrow(/permission denied/)
    const { rows } = await db.query(`SELECT privilege_type FROM information_schema.role_table_grants
      WHERE grantee = 'authenticated' AND table_schema = 'public' AND table_name = 'emprestimos_ferramentas' ORDER BY 1`)
    expect(rows.map(r => r.privilege_type)).toEqual(['SELECT'])
  })
})

describe('integridade: produtos_em_alerta', () => {
  it('devolve stock com casas decimais (numeric)', async () => {
    await db.query(`UPDATE public.produtos SET stock_atual = 2.5, stock_minimo = 3.25 WHERE id = $1`, [produto])
    const r = (await u(armazem, tx => tx.query(`SELECT * FROM public.produtos_em_alerta() WHERE id = $1`, [produto]))).rows[0]
    expect(Number(r.stock_atual)).toBe(2.5)
    expect(Number(r.stock_minimo)).toBe(3.25)
  })
})
