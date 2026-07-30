import { vi, describe, it, expect, beforeEach } from 'vitest'
import { listarProdutos, criarProduto, buscarProduto } from '@/features/produtos/services/produtosService'

// vi.mock é hoistado — vi.hoisted() garante que o builder existe antes do hoist.
const b = vi.hoisted(() => {
  const builder = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    order:  vi.fn(),
    eq:     vi.fn(),
    single: vi.fn(),
  }
  builder.select.mockReturnValue(builder)
  builder.insert.mockReturnValue(builder)
  builder.update.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  return builder
})

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn().mockReturnValue(b) },
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
})

// ── listarProdutos ────────────────────────────────────────────────────────────
// listarProdutos chain:
//   apenasAtivos=true  → from().select().order().eq()  ← eq() é o terminal (await)
//   apenasAtivos=false → from().select().order()       ← order() é o terminal (await)

describe('listarProdutos', () => {
  it('retorna produtos mapeados para o domínio', async () => {
    b.eq.mockResolvedValue({ data: [produtoRow], error: null })

    const produtos = await listarProdutos()

    expect(produtos).toHaveLength(1)
    expect(produtos[0]).toMatchObject({
      id: 'uuid-1', code: 'P001', name: 'Cimento Portland',
      currentStock: 50, minStock: 10, unitCost: 12.5,
      status: 'normal',
    })
  })

  it('calcula status=baixo quando stock < mínimo', async () => {
    b.eq.mockResolvedValue({ data: [{ ...produtoRow, stock_atual: 5 }], error: null })
    const [p] = await listarProdutos()
    expect(p.status).toBe('baixo')
  })

  it('calcula status=sem-stock quando stock é zero', async () => {
    b.eq.mockResolvedValue({ data: [{ ...produtoRow, stock_atual: 0 }], error: null })
    const [p] = await listarProdutos()
    expect(p.status).toBe('sem-stock')
  })

  it('aplica filtro ativo=true por defeito', async () => {
    b.eq.mockResolvedValue({ data: [], error: null })
    await listarProdutos()
    expect(b.eq).toHaveBeenCalledWith('ativo', true)
  })

  it('não aplica filtro ativo quando apenasAtivos=false', async () => {
    // sem filtro → order() é o terminal
    b.order.mockResolvedValue({ data: [], error: null })
    await listarProdutos(false)
    expect(b.eq).not.toHaveBeenCalled()
  })

  it('propaga erro do Supabase', async () => {
    b.eq.mockResolvedValue({ data: null, error: { message: 'BD offline' } })
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
