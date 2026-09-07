import { vi, describe, it, expect, beforeEach } from 'vitest'
import {
  listarMovimentos,
  listarMovimentosPaginados,
  registarMovimento,
} from '@/features/movimentos/services/movimentosService'

// ── Mock do cliente Supabase ──────────────────────────────────────────────────
// vi.mock é hoistado — vi.hoisted() garante que o builder existe antes do hoist.
const b = vi.hoisted(() => {
  const builder = {
    select: vi.fn(),
    order:  vi.fn(),
    eq:     vi.fn(),
    gte:    vi.fn(),
    lt:     vi.fn(),
    ilike:  vi.fn(),
    limit:  vi.fn(),
    range:  vi.fn(),
  }
  // Cada método retorna o builder para permitir encadeamento
  Object.values(builder).forEach(fn => fn.mockReturnValue(builder))
  return builder
})

const rpcMock = vi.hoisted(() => vi.fn())

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockReturnValue(b),
    rpc:  rpcMock,
  },
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

const movRow = {
  id: 'uuid-mov-1',
  produto_id: 'uuid-prod-1',
  tipo: 'saida' as const,
  quantidade: 10,
  stock_antes: 100,
  stock_depois: 90,
  responsavel: 'Manuel Costa',
  destino_obra: 'Moradia Cascais',
  obra_id: 'uuid-obra-1',
  observacoes: null,
  created_at: '2026-08-01T08:00:00Z',
  created_by: 'uuid-user-1',
  produtos: { nome: 'Cimento CEM II', unidade: 'saco' },
}

const movMapped = {
  id: 'uuid-mov-1',
  productId: 'uuid-prod-1',
  productName: 'Cimento CEM II',
  type: 'saida',
  quantity: 10,
  unit: 'saco',
  responsible: 'Manuel Costa',
  destination: 'Moradia Cascais',
  obraId: 'uuid-obra-1',
  previousStock: 100,
  newStock: 90,
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.values(b).forEach(fn => (fn as ReturnType<typeof vi.fn>).mockReturnValue(b))
})

// ── listarMovimentos ──────────────────────────────────────────────────────────
// chain sem filtros: from().select().order()   ← order() é terminal
// chain com filtros: ...order().eq() / .gte() / .lt() / .ilike()

describe('listarMovimentos', () => {
  it('retorna movimentos mapeados para o domínio', async () => {
    b.order.mockResolvedValue({ data: [movRow], error: null })

    const result = await listarMovimentos()

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject(movMapped)
  })

  it('converte created_at para Date', async () => {
    b.order.mockResolvedValue({ data: [movRow], error: null })
    const [m] = await listarMovimentos()
    expect(m.date).toBeInstanceOf(Date)
    expect(m.date.getFullYear()).toBe(2026)
  })

  it('mapeia destino_obra null para undefined', async () => {
    b.order.mockResolvedValue({
      data: [{ ...movRow, destino_obra: null }],
      error: null,
    })
    const [m] = await listarMovimentos()
    expect(m.destination).toBeUndefined()
  })

  it('aplica filtro por produto_id', async () => {
    b.eq.mockResolvedValue({ data: [movRow], error: null })

    await listarMovimentos({ produtoId: 'uuid-prod-1' })

    expect(b.eq).toHaveBeenCalledWith('produto_id', 'uuid-prod-1')
  })

  it('aplica filtro por tipo', async () => {
    b.eq.mockResolvedValue({ data: [], error: null })

    await listarMovimentos({ tipo: 'entrada' })

    expect(b.eq).toHaveBeenCalledWith('tipo', 'entrada')
  })

  it('aplica dataInicio com gte', async () => {
    b.gte.mockResolvedValue({ data: [], error: null })
    const inicio = new Date('2026-08-01')

    await listarMovimentos({ dataInicio: inicio })

    expect(b.gte).toHaveBeenCalledWith('created_at', inicio.toISOString())
  })

  it('aplica dataFim com lt no dia seguinte (inclusivo)', async () => {
    b.lt.mockResolvedValue({ data: [], error: null })
    const fim = new Date('2026-08-31')

    await listarMovimentos({ dataFim: fim })

    // A função adiciona +1 dia — espera-se 2026-09-01
    expect(b.lt).toHaveBeenCalledWith(
      'created_at',
      expect.stringContaining('2026-09-01'),
    )
  })

  it('aplica filtro de destino com ilike', async () => {
    b.ilike.mockResolvedValue({ data: [], error: null })

    await listarMovimentos({ destino: 'Cascais' })

    expect(b.ilike).toHaveBeenCalledWith('destino_obra', '%Cascais%')
  })

  it('propaga erro do Supabase', async () => {
    b.order.mockResolvedValue({ data: null, error: { message: 'BD offline' } })

    await expect(listarMovimentos()).rejects.toMatchObject({ message: 'BD offline' })
  })
})

// ── listarMovimentosPaginados ─────────────────────────────────────────────────
// chain: from().select({count:'exact'}).order().range()  ← range() é terminal (base)
// + filtros opcionais encadeados após range()

describe('listarMovimentosPaginados', () => {
  it('retorna dados e contagem total', async () => {
    b.range.mockResolvedValue({ data: [movRow], error: null, count: 42 })

    const result = await listarMovimentosPaginados({}, 0)

    expect(result.data).toHaveLength(1)
    expect(result.count).toBe(42)
    expect(result.data[0]).toMatchObject(movMapped)
  })

  it('calcula o range correto para a página 2', async () => {
    b.range.mockResolvedValue({ data: [], error: null, count: 0 })

    await listarMovimentosPaginados({}, 2)

    // PAGE_SIZE = 50 → página 2 começa em 100
    expect(b.range).toHaveBeenCalledWith(100, 149)
  })

  it('retorna count 0 quando Supabase retorna null', async () => {
    b.range.mockResolvedValue({ data: [], error: null, count: null })

    const result = await listarMovimentosPaginados()
    expect(result.count).toBe(0)
  })

  it('propaga erro', async () => {
    b.range.mockResolvedValue({ data: null, error: { message: 'timeout' }, count: null })

    await expect(listarMovimentosPaginados()).rejects.toMatchObject({ message: 'timeout' })
  })
})

// ── registarMovimento ─────────────────────────────────────────────────────────
// Usa supabase.rpc() — não usa from() nem builder.

describe('registarMovimento', () => {
  it('chama registar_movimento com os argumentos corretos', async () => {
    rpcMock.mockResolvedValue({ error: null })

    await registarMovimento({
      produtoId:   'uuid-prod-1',
      tipo:        'saida',
      quantidade:  5,
      responsavel: 'Manuel Costa',
      destinoObra: 'Obra A',
      obraId:      'uuid-obra-1',
    })

    expect(rpcMock).toHaveBeenCalledWith('registar_movimento', {
      p_produto_id:   'uuid-prod-1',
      p_tipo:         'saida',
      p_quantidade:   5,
      p_responsavel:  'Manuel Costa',
      p_destino_obra: 'Obra A',
      p_observacoes:  undefined,
      p_obra_id:      'uuid-obra-1',
    })
  })

  it('funciona sem campos opcionais (destino, obra, observacoes)', async () => {
    rpcMock.mockResolvedValue({ error: null })

    await expect(
      registarMovimento({
        produtoId:   'uuid-prod-1',
        tipo:        'entrada',
        quantidade:  20,
        responsavel: 'Ana Lopes',
      })
    ).resolves.toBeUndefined()

    expect(rpcMock).toHaveBeenCalledWith(
      'registar_movimento',
      expect.objectContaining({ p_tipo: 'entrada', p_quantidade: 20 }),
    )
  })

  it('propaga erro de stock insuficiente', async () => {
    rpcMock.mockResolvedValue({
      error: { message: 'stock insuficiente para este movimento' },
    })

    await expect(
      registarMovimento({
        produtoId:   'uuid-prod-1',
        tipo:        'saida',
        quantidade:  9999,
        responsavel: 'Teste',
      })
    ).rejects.toMatchObject({ message: 'stock insuficiente para este movimento' })
  })

  it('propaga erro genérico de base de dados', async () => {
    rpcMock.mockResolvedValue({ error: { message: 'connection refused' } })

    await expect(
      registarMovimento({
        produtoId:   'uuid-prod-X',
        tipo:        'ajuste',
        quantidade:  1,
        responsavel: 'Admin',
      })
    ).rejects.toMatchObject({ message: 'connection refused' })
  })
})
