import { vi, describe, it, expect, beforeEach } from 'vitest'
import { listarProdutos, criarProduto, buscarProduto } from '@/features/produtos/services/produtosService'
import { parseSupabaseError } from '@/app/lib/parseSupabaseError'

// vi.mock é hoistado — vi.hoisted() garante que o builder existe antes do hoist.
const b = vi.hoisted(() => {
  const builder = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    order:  vi.fn(),
    eq:     vi.fn(),
    single: vi.fn(),
    range:  vi.fn(),
  }
  builder.select.mockReturnValue(builder)
  builder.insert.mockReturnValue(builder)
  builder.update.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  return builder
})

const rpc = vi.hoisted(() => vi.fn())

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn().mockReturnValue(b), rpc },
}))

// ── Dados de teste ────────────────────────────────────────────────────────────
const produtoRow = {
  id: 'uuid-1',
  codigo: 'P001',
  nome: 'Cimento Portland',
  categoria: 'cimento',
  unidade: 'saco',
  stock_atual: 50,
  stock_minimo: 10,
  custo_unitario: 12.5,
  ativo: true,
  observacoes: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  // Re-aplicar encadeamento após clearAllMocks
  b.select.mockReturnValue(b)
  b.insert.mockReturnValue(b)
  b.update.mockReturnValue(b)
  b.order.mockReturnValue(b)
  b.eq.mockReturnValue(b)
  b.range.mockResolvedValue({ data: [], error: null })
})

// ── listarProdutos ────────────────────────────────────────────────────────────
// listarProdutos chain:
//   from().select().order().order()[.eq()].range()  ← lê por páginas; range() é o terminal

describe('listarProdutos', () => {
  it('retorna produtos mapeados para o domínio', async () => {
    b.range.mockResolvedValueOnce({ data: [produtoRow], error: null }).mockResolvedValue({ data: [], error: null })

    const produtos = await listarProdutos()

    expect(produtos).toHaveLength(1)
    expect(produtos[0]).toMatchObject({
      id: 'uuid-1', code: 'P001', name: 'Cimento Portland',
      currentStock: 50, minStock: 10, unitCost: 12.5,
      status: 'normal',
    })
  })

  it('calcula status=baixo quando stock < mínimo', async () => {
    b.range.mockResolvedValueOnce({ data: [{ ...produtoRow, stock_atual: 5 }], error: null }).mockResolvedValue({ data: [], error: null })
    const [p] = await listarProdutos()
    expect(p.status).toBe('baixo')
  })

  it('calcula status=sem-stock quando stock é zero', async () => {
    b.range.mockResolvedValueOnce({ data: [{ ...produtoRow, stock_atual: 0 }], error: null }).mockResolvedValue({ data: [], error: null })
    const [p] = await listarProdutos()
    expect(p.status).toBe('sem-stock')
  })

  it('aplica filtro ativo=true por defeito', async () => {
    b.range.mockResolvedValue({ data: [], error: null })
    await listarProdutos()
    expect(b.eq).toHaveBeenCalledWith('ativo', true)
  })

  it('não aplica filtro ativo quando apenasAtivos=false', async () => {
    // sem filtro de ativo
    b.range.mockResolvedValue({ data: [], error: null })
    await listarProdutos(false)
    expect(b.eq).not.toHaveBeenCalled()
  })

  it('propaga erro do Supabase', async () => {
    b.range.mockResolvedValue({ data: null, error: { message: 'BD offline' } })
    await expect(listarProdutos()).rejects.toMatchObject({ message: 'BD offline' })
  })
})

// ── buscarProduto ─────────────────────────────────────────────────────────────
// chain: from().select().eq().single()  ← single() é o terminal
describe('buscarProduto', () => {
  it('retorna o produto pelo id', async () => {
    b.single.mockResolvedValue({ data: produtoRow, error: null })
    const p = await buscarProduto('uuid-1')
    expect(p.id).toBe('uuid-1')
    expect(b.eq).toHaveBeenCalledWith('id', 'uuid-1')
  })

  it('propaga erro quando não encontrado', async () => {
    b.single.mockResolvedValue({ data: null, error: { message: 'not found' } })
    await expect(buscarProduto('x')).rejects.toMatchObject({ message: 'not found' })
  })
})

// ── criarProduto ──────────────────────────────────────────────────────────────
// chain: from().insert({...}).select().single()  ← single() é o terminal
describe('criarProduto', () => {
  it('usa a RPC criar_produto: o stock inicial vai como movimento, não como stock_atual', async () => {
    rpc.mockResolvedValue({ data: produtoRow, error: null })
    const p = await criarProduto({
      id: 'uuid-1', name: 'Cimento Portland', category: 'cimento', unit: 'saco',
      currentStock: 50, minStock: 10, unitCost: 12.5, localizacao: 'A1',
    })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('criar_produto', { p: {
      id: 'uuid-1', nome: 'Cimento Portland', categoria: 'cimento', unidade: 'saco',
      stock_inicial: 50, stock_minimo: 10, custo_unitario: 12.5,
      observacoes: null, foto_path: null, localizacao: 'A1',
    } })
    expect(b.insert).not.toHaveBeenCalled()
    expect(p).toMatchObject({ id: 'uuid-1', currentStock: 50 })
  })

  it('erro de negócio da RPC sobe sem cair no fluxo antigo', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'Indique o nome do artigo' } })
    await expect(criarProduto({ name: '', category: 'outro', unit: 'unidade', currentStock: 0, minStock: 0 }))
      .rejects.toMatchObject({ message: 'Indique o nome do artigo' })
    expect(b.insert).not.toHaveBeenCalled()
  })

  it('dado mal escrito (22P02) vira mensagem em pt-PT e não cai no fluxo antigo', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '22P02', message: 'invalid input syntax for type numeric: "abc"' } })
    const e = await criarProduto({ name: 'X', category: 'outro', unit: 'unidade', currentStock: 0, minStock: 0 }).catch((x: unknown) => x)
    expect(parseSupabaseError(e)).toBe('Dados do artigo inválidos: verifique os números e a foto.')
    expect(b.insert).not.toHaveBeenCalled()
  })
})

// BD antiga (migration 20261020110000 por aplicar): criar_produto não existe
describe('criarProduto sem a RPC (fluxo antigo)', () => {
  beforeEach(() => rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }))

  it('envia os campos corretos e retorna produto criado', async () => {
    b.single.mockResolvedValue({ data: produtoRow, error: null })

    const p = await criarProduto({
      name: 'Cimento Portland', category: 'cimento', unit: 'saco',
      currentStock: 50, minStock: 10, unitCost: 12.5,
    })

    expect(b.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        nome: 'Cimento Portland', categoria: 'cimento', unidade: 'saco',
        stock_atual: 50, stock_minimo: 10, custo_unitario: 12.5,
      })
    )
    expect(p.name).toBe('Cimento Portland')
  })

  it('propaga erro de insert', async () => {
    b.single.mockResolvedValue({ data: null, error: { message: 'unique violation' } })
    await expect(
      criarProduto({ name: 'X', category: 'outro', unit: 'unidade', currentStock: 0, minStock: 0 })
    ).rejects.toMatchObject({ message: 'unique violation' })
  })
})
