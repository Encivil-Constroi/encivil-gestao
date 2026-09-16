import { vi, describe, it, expect, beforeEach } from 'vitest'
import { supabase } from '@/integrations/supabase/client'
import {
  custoObra,
  custosMateriaisCombustivelPorObra,
} from '@/features/custos/custosService'

// ── Supabase mock ─────────────────────────────────────────────────────────────

const b = vi.hoisted(() => {
  const builder = {
    select: vi.fn(),
    eq:     vi.fn(),
  }
  builder.select.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  return builder
})

const rpcMock = vi.hoisted(() => vi.fn())

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    rpc: rpcMock,
  },
}))

// ── Subempreiteiros service mock ──────────────────────────────────────────────

const listarSubsMock = vi.hoisted(() => vi.fn())

vi.mock('@/features/subempreiteiros/services/subempreiteirosService', () => ({
  listarSubempreiteirosComExecutado: listarSubsMock,
}))

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(supabase.from).mockReturnValue(b as never)
  b.select.mockReturnValue(b)
  b.eq.mockReturnValue(b)
})

// ── Helpers ───────────────────────────────────────────────────────────────────

type SubExec = { id: string; executed: number }

function setupCustoObra(
  matRows: { quantidade: number; produtos: { custo_unitario: number } | null }[],
  subs: SubExec[],
  fuelRows: { custo_total: number }[],
) {
  // Promise.all order in custoObra: [movimentos, subs, comb]
  // movimentos chain: .select().eq('obra_id',...).eq('tipo','saida')
  //   1st b.eq → chain (b), 2nd b.eq → resolves matRes
  // comb chain: .select().eq('obra_id',...)
  //   1st b.eq → resolves fuelRes (3rd overall b.eq call)
  b.eq
    .mockReturnValueOnce(b)                                                  // movimentos .eq('obra_id')
    .mockResolvedValueOnce({ data: matRows, error: null })                   // movimentos .eq('tipo','saida')
    .mockResolvedValueOnce({ data: fuelRows, error: null })                  // comb .eq('obra_id')
  listarSubsMock.mockResolvedValueOnce(subs)
}

// ── custoObra ─────────────────────────────────────────────────────────────────

describe('custoObra', () => {
  it('soma materiais (quantidade × custo_unitario)', async () => {
    setupCustoObra(
      [
        { quantidade: 10, produtos: { custo_unitario: 5 } },
        { quantidade: 3,  produtos: { custo_unitario: 20 } },
      ],
      [],
      [],
    )

    const r = await custoObra('obra-1')

    expect(r.materiais).toBeCloseTo(110)   // 10×5 + 3×20
    expect(r.subempreiteiros).toBe(0)
    expect(r.combustivel).toBe(0)
    expect(r.total).toBeCloseTo(110)
  })

  it('soma executed dos subempreiteiros', async () => {
    setupCustoObra(
      [],
      [
        { id: 's1', executed: 15000 },
        { id: 's2', executed: 8500 },
      ],
      [],
    )

    const r = await custoObra('obra-1')

    expect(r.subempreiteiros).toBeCloseTo(23500)
    expect(r.total).toBeCloseTo(23500)
  })

  it('soma custo_total do combustível', async () => {
    setupCustoObra([], [], [{ custo_total: 300 }, { custo_total: 150.50 }])

    const r = await custoObra('obra-1')
    expect(r.combustivel).toBeCloseTo(450.50)
  })

  it('agrega as 3 fontes de custo corretamente', async () => {
    setupCustoObra(
      [{ quantidade: 5, produtos: { custo_unitario: 100 } }],
      [{ id: 's1', executed: 20000 }],
      [{ custo_total: 1200 }],
    )

    const r = await custoObra('obra-1')

    expect(r.materiais).toBeCloseTo(500)
    expect(r.subempreiteiros).toBeCloseTo(20000)
    expect(r.combustivel).toBeCloseTo(1200)
    expect(r.total).toBeCloseTo(21700)
  })

  it('ignora materiais sem produto (custo_unitario implícito 0)', async () => {
    setupCustoObra([{ quantidade: 5, produtos: null }], [], [])

    const r = await custoObra('obra-1')
    expect(r.materiais).toBe(0)
  })

  it('calcula margem quando orçamento é fornecido', async () => {
    setupCustoObra(
      [{ quantidade: 10, produtos: { custo_unitario: 100 } }],
      [],
      [],
    )

    const r = await custoObra('obra-1', 5000)

    expect(r.orcamento).toBe(5000)
    expect(r.margem).toBeCloseTo(4000)
  })

  it('não calcula margem quando orçamento não é fornecido', async () => {
    setupCustoObra([], [], [])

    const r = await custoObra('obra-1')

    expect(r.orcamento).toBeUndefined()
    expect(r.margem).toBeUndefined()
  })

  it('margem negativa quando custos superam orçamento', async () => {
    setupCustoObra([], [{ id: 's1', executed: 12000 }], [])

    const r = await custoObra('obra-1', 10000)
    expect(r.margem).toBeCloseTo(-2000)
  })

  it('propaga erro quando listarSubempreiteirosComExecutado falha', async () => {
    // matRes and fuelRes use default b.eq.mockReturnValue(b) — no error check in the service
    b.eq.mockReturnValueOnce(b)  // movimentos .eq('obra_id') — chains
    // second eq for movimentos and third eq for comb left as default (return b, no error)
    listarSubsMock.mockRejectedValueOnce(new Error('RLS block'))

    await expect(custoObra('obra-1')).rejects.toMatchObject({ message: 'RLS block' })
  })
})

// ── custosMateriaisCombustivelPorObra ─────────────────────────────────────────

describe('custosMateriaisCombustivelPorObra', () => {
  it('mapeia resultado da RPC para Record por obra_id', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        { obra_id: 'o1', materiais: '1500',   combustivel: '300'  },
        { obra_id: 'o2', materiais: '8000.5', combustivel: '1200' },
      ],
      error: null,
    })

    const map = await custosMateriaisCombustivelPorObra()

    expect(map['o1']).toEqual({ materiais: 1500, combustivel: 300 })
    expect(map['o2']).toEqual({ materiais: 8000.5, combustivel: 1200 })
    expect(rpcMock).toHaveBeenCalledWith('custos_materiais_por_obra')
  })

  it('devolve objeto vazio quando RPC retorna array vazio', async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null })
    const map = await custosMateriaisCombustivelPorObra()
    expect(Object.keys(map)).toHaveLength(0)
  })

  it('converte strings numéricas para Number', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ obra_id: 'o1', materiais: '999', combustivel: '0' }],
      error: null,
    })
    const map = await custosMateriaisCombustivelPorObra()
    expect(typeof map['o1'].materiais).toBe('number')
    expect(typeof map['o1'].combustivel).toBe('number')
  })

  it('propaga erro da RPC', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })
    await expect(custosMateriaisCombustivelPorObra()).rejects.toMatchObject({ message: 'timeout' })
  })
})
