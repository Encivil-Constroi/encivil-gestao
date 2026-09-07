import { vi, describe, it, expect, beforeEach } from 'vitest'
import {
  listarAutos,
  buscarAuto,
  criarAuto,
  atualizarAuto,
  eliminarAuto,
  validarAuto,
} from '@/features/autos/services/autosService'

// ── Mock do cliente Supabase ──────────────────────────────────────────────────
const b = vi.hoisted(() => {
  const builder = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    eq:     vi.fn(),
    order:  vi.fn(),
    single: vi.fn(),
  }
  builder.select.mockReturnValue(builder)
  builder.insert.mockReturnValue(builder)
  builder.update.mockReturnValue(builder)
  builder.delete.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  return builder
})

const rpc = vi.hoisted(() => vi.fn())

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn().mockReturnValue(b), rpc },
}))

// ── Dados de teste ────────────────────────────────────────────────────────────
const linhaRow = {
  id: 'linha-1',
  auto_id: 'auto-1',
  artigo_id: 'artigo-1',
  descricao: 'Alvenaria',
  unidade: 'm²',
  preco_unitario: 25.0,
  quantidade: 100,
  is_extra: false,
}

const autoRow = {
  id: 'auto-1',
  subempreiteiro_id: 'sub-1',
  numero: 1,
  data_medicao: '2026-07-01',
  percentagem_periodo: 40,
  valor_periodo: 8000,
  observacoes: null,
  estado: 'rascunho',
  created_at: '2026-07-01T10:00:00Z',
  validado_em: null,
  auto_linhas: [linhaRow],
}

const autoValidadoRow = { ...autoRow, estado: 'validado', validado_em: '2026-07-02T09:00:00Z' }

beforeEach(() => {
  vi.clearAllMocks()
  b.select.mockReturnValue(b)
  b.insert.mockReturnValue(b)
  b.update.mockReturnValue(b)
  b.delete.mockReturnValue(b)
  b.eq.mockReturnValue(b)
  b.order.mockReturnValue(b)
})

// ── listarAutos ───────────────────────────────────────────────────────────────
// chain: from().select().eq().order()  ← order() é o terminal
describe('listarAutos', () => {
  it('mapeia linhas para o domínio e ordena por número', async () => {
    b.order.mockResolvedValue({ data: [autoRow], error: null })
    const autos = await listarAutos('sub-1')

    expect(autos).toHaveLength(1)
    expect(autos[0]).toMatchObject({
      id: 'auto-1', number: 1, periodValue: 8000, status: 'rascunho',
    })
    expect(b.eq).toHaveBeenCalledWith('subempreiteiro_id', 'sub-1')
  })

  it('devolve lista vazia sem erros quando não há autos', async () => {
    b.order.mockResolvedValue({ data: [], error: null })
    expect(await listarAutos('sub-x')).toEqual([])
  })

  it('propaga erro do Supabase', async () => {
    b.order.mockResolvedValue({ data: null, error: { message: 'BD offline' } })
    await expect(listarAutos('sub-1')).rejects.toMatchObject({ message: 'BD offline' })
  })
})

// ── buscarAuto ────────────────────────────────────────────────────────────────
// chain: from().select().eq().single()  ← single() é o terminal
describe('buscarAuto', () => {
  it('retorna o auto com as suas linhas', async () => {
    b.single.mockResolvedValue({ data: autoRow, error: null })
    const auto = await buscarAuto('auto-1')
    expect(auto.id).toBe('auto-1')
    expect(auto.lines).toHaveLength(1)
    expect(auto.lines?.[0]).toMatchObject({ description: 'Alvenaria', unitPrice: 25, quantity: 100 })
  })

  it('propaga erro quando não encontrado', async () => {
    b.single.mockResolvedValue({ data: null, error: { message: 'not found' } })
    await expect(buscarAuto('x')).rejects.toMatchObject({ message: 'not found' })
  })
})

// ── criarAuto ─────────────────────────────────────────────────────────────────
// usa RPC criar_auto_rpc (atómica) → depois buscarAuto
describe('criarAuto', () => {
  it('chama o RPC com os parâmetros corretos e devolve o auto criado', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'auto-1', numero: 1 }], error: null })
    b.single.mockResolvedValue({ data: autoRow, error: null })

    const auto = await criarAuto({
      subcontractorId: 'sub-1',
      date: '2026-07-01',
      periodPercentage: 40,
      periodValue: 8000,
    })

    expect(rpc).toHaveBeenCalledWith('criar_auto_rpc', expect.objectContaining({
      p_sub_id: 'sub-1',
      p_data:   '2026-07-01',
      p_valor:  8000,
      p_percentagem: 40,
    }))
    expect(auto.id).toBe('auto-1')
  })

  it('insere linhas após criar o auto quando fornecidas', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'auto-1', numero: 1 }], error: null })
    // insert de linhas → terminal é o próprio insert (sem .select/.single)
    b.insert.mockResolvedValue({ data: null, error: null })
    b.single.mockResolvedValue({ data: autoRow, error: null })

    await criarAuto({
      subcontractorId: 'sub-1',
      date: '2026-07-01',
      periodValue: 8000,
      lines: [{ description: 'Alvenaria', unit: 'm²', unitPrice: 25, quantity: 100 }],
    })

    expect(b.insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ descricao: 'Alvenaria', preco_unitario: 25, quantidade: 100 }),
      ])
    )
  })

  it('propaga erro do RPC sem criar linhas', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'lock timeout' } })
    await expect(
      criarAuto({ subcontractorId: 'sub-1', date: '2026-07-01', periodValue: 1000 })
    ).rejects.toMatchObject({ message: 'lock timeout' })
    expect(b.insert).not.toHaveBeenCalled()
  })
})

// ── atualizarAuto ─────────────────────────────────────────────────────────────
// chain update: from().update({}).eq()  ← eq() terminal (sem select/single aqui)
// depois buscarAuto: from().select().eq().single()
describe('atualizarAuto', () => {
  it('actualiza valor e devolve o auto actualizado', async () => {
    // 1ª chamada a eq() termina o update; 2ª chamada a eq() faz parte de buscarAuto
    b.eq.mockResolvedValueOnce({ data: null, error: null }) // update terminal
    b.eq.mockReturnValue(b)                                 // select chain (para single())
    b.single.mockResolvedValue({ data: autoRow, error: null })

    const auto = await atualizarAuto('auto-1', { periodValue: 9000 })

    expect(b.update).toHaveBeenCalledWith(expect.objectContaining({ valor_periodo: 9000 }))
    expect(auto.periodValue).toBe(8000) // valor que vem do mock row
  })

  it('propaga erro de update sem chamar buscarAuto', async () => {
    b.eq.mockResolvedValueOnce({ data: null, error: { message: 'rls denied' } })
    await expect(atualizarAuto('auto-1', { periodValue: 1 })).rejects.toMatchObject({ message: 'rls denied' })
    // single() não deve ter sido chamado (buscarAuto não foi chamado)
    expect(b.single).not.toHaveBeenCalled()
  })
})

// ── eliminarAuto ──────────────────────────────────────────────────────────────
// chain: from().delete().eq()  ← eq() é o terminal
describe('eliminarAuto', () => {
  it('elimina o auto pelo id', async () => {
    b.eq.mockResolvedValue({ data: null, error: null })
    await eliminarAuto('auto-1')
    expect(b.delete).toHaveBeenCalled()
    expect(b.eq).toHaveBeenCalledWith('id', 'auto-1')
  })

  it('propaga erro de delete', async () => {
    b.eq.mockResolvedValue({ data: null, error: { message: 'auto validado' } })
    await expect(eliminarAuto('auto-1')).rejects.toMatchObject({ message: 'auto validado' })
  })
})

// ── validarAuto ───────────────────────────────────────────────────────────────
// usa RPC validar_auto → depois buscarAuto
describe('validarAuto', () => {
  it('chama o RPC de validação e devolve o auto validado', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    b.single.mockResolvedValue({ data: autoValidadoRow, error: null })

    const auto = await validarAuto('auto-1')

    expect(rpc).toHaveBeenCalledWith('validar_auto', { p_id: 'auto-1' })
    expect(auto.status).toBe('validado')
    expect(auto.validatedAt).toBeInstanceOf(Date)
  })

  it('propaga erro do RPC de validação sem chamar buscarAuto', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'já validado' } })
    await expect(validarAuto('auto-1')).rejects.toMatchObject({ message: 'já validado' })
    expect(b.single).not.toHaveBeenCalled()
  })
})

// ── toMeasurement — mapeamento de campos ──────────────────────────────────────
describe('mapeamento do domínio', () => {
  it('converte datas ISO em objetos Date', async () => {
    b.order.mockResolvedValue({ data: [autoValidadoRow], error: null })
    const [auto] = await listarAutos('sub-1')
    expect(auto.date).toBeInstanceOf(Date)
    expect(auto.createdAt).toBeInstanceOf(Date)
    expect(auto.validatedAt).toBeInstanceOf(Date)
  })

  it('ordena linhas: não-extra antes de extra', async () => {
    const extraLinha = { ...linhaRow, id: 'linha-2', is_extra: true, descricao: 'Extra' }
    const rowComExtra = { ...autoRow, auto_linhas: [extraLinha, linhaRow] }
    b.order.mockResolvedValue({ data: [rowComExtra], error: null })
    const [auto] = await listarAutos('sub-1')
    expect(auto.lines?.[0].isExtra).toBe(false)
    expect(auto.lines?.[1].isExtra).toBe(true)
  })
})
