import { vi, describe, it, expect, beforeEach } from 'vitest'
import {
  listarAbastecimentos,
  buscarAbastecimento,
  criarAbastecimento,
  atualizarAbastecimento,
  eliminarAbastecimento,
} from '@/features/combustivel/services/abastecimentosService'

// ── Mock do cliente Supabase ──────────────────────────────────────────────────
const b = vi.hoisted(() => {
  const builder = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    eq:     vi.fn(),
    gte:    vi.fn(),
    lte:    vi.fn(),
    order:  vi.fn(),
    single: vi.fn(),
  }
  builder.select.mockReturnValue(builder)
  builder.insert.mockReturnValue(builder)
  builder.update.mockReturnValue(builder)
  builder.delete.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.gte.mockReturnValue(builder)
  builder.lte.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  return builder
})

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn().mockReturnValue(b) },
}))

// ── Dados de teste ────────────────────────────────────────────────────────────
const abRow = {
  id: 'ab-1',
  veiculo_id: 'v-1',
  obra_id: 'obra-1',
  data: '2026-07-15',
  litros: 50,
  custo_total: 95.0,
  contador: 12345,
  local: 'Posto BP',
  responsavel: 'João Silva',
  observacoes: null,
  created_at: '2026-07-15T08:00:00Z',
  comb_veiculos: { nome: 'Ford Transit', codigo: 'V001', unidade_contador: 'km' },
  obras: { nome: 'Obra Central' },
}

beforeEach(() => {
  vi.clearAllMocks()
  b.select.mockReturnValue(b)
  b.insert.mockReturnValue(b)
  b.update.mockReturnValue(b)
  b.delete.mockReturnValue(b)
  b.eq.mockReturnValue(b)
  b.gte.mockReturnValue(b)
  b.lte.mockReturnValue(b)
  b.order.mockReturnValue(b)
})

// ── listarAbastecimentos ──────────────────────────────────────────────────────
// chain base: from().select().order()  — filtros adicionam eq/gte/lte antes do terminal
describe('listarAbastecimentos', () => {
  it('mapeia row para FuelEntry com pricePerLiter calculado', async () => {
    b.order.mockResolvedValue({ data: [abRow], error: null })
    const [ab] = await listarAbastecimentos()

    expect(ab).toMatchObject({
      id: 'ab-1', vehicleName: 'Ford Transit', vehicleCode: 'V001',
      liters: 50, totalCost: 95, obraName: 'Obra Central',
    })
    expect(ab.pricePerLiter).toBeCloseTo(1.9)
  })

  it('pricePerLiter é 0 quando litros é 0 (sem divisão por zero)', async () => {
    b.order.mockResolvedValue({ data: [{ ...abRow, litros: 0, custo_total: 0 }], error: null })
    const [ab] = await listarAbastecimentos()
    expect(ab.pricePerLiter).toBe(0)
  })

  it('aplica filtro veiculoId', async () => {
    b.eq.mockResolvedValue({ data: [], error: null })
    await listarAbastecimentos({ veiculoId: 'v-1' })
    expect(b.eq).toHaveBeenCalledWith('veiculo_id', 'v-1')
  })

  it('aplica filtros de data dataInicio e dataFim', async () => {
    b.lte.mockResolvedValue({ data: [], error: null })
    await listarAbastecimentos({ dataInicio: '2026-07-01', dataFim: '2026-07-31' })
    expect(b.gte).toHaveBeenCalledWith('data', '2026-07-01')
    expect(b.lte).toHaveBeenCalledWith('data', '2026-07-31')
  })

  it('propaga erro do Supabase', async () => {
    b.order.mockResolvedValue({ data: null, error: { message: 'timeout' } })
    await expect(listarAbastecimentos()).rejects.toMatchObject({ message: 'timeout' })
  })
})

// ── buscarAbastecimento ───────────────────────────────────────────────────────
// chain: from().select().eq().single()
describe('buscarAbastecimento', () => {
  it('retorna o abastecimento pelo id', async () => {
    b.single.mockResolvedValue({ data: abRow, error: null })
    const ab = await buscarAbastecimento('ab-1')
    expect(ab.id).toBe('ab-1')
    expect(b.eq).toHaveBeenCalledWith('id', 'ab-1')
  })

  it('propaga erro quando não encontrado', async () => {
    b.single.mockResolvedValue({ data: null, error: { message: 'not found' } })
    await expect(buscarAbastecimento('x')).rejects.toMatchObject({ message: 'not found' })
  })
})

// ── criarAbastecimento ────────────────────────────────────────────────────────
// chain: from().insert({}).select(SELECT).single()  ← single() é o terminal
// CRÍTICO: deve usar SELECT com join para devolver os dados do veículo/obra num único round-trip
describe('criarAbastecimento', () => {
  it('envia os campos corretos e devolve FuelEntry criado', async () => {
    b.single.mockResolvedValue({ data: abRow, error: null })

    const ab = await criarAbastecimento({
      vehicleId: 'v-1',
      obraId: 'obra-1',
      date: '2026-07-15',
      liters: 50,
      totalCost: 95,
      counter: 12345,
      location: 'Posto BP',
      responsible: 'João Silva',
    })

    expect(b.insert).toHaveBeenCalledWith(expect.objectContaining({
      veiculo_id: 'v-1',
      obra_id: 'obra-1',
      litros: 50,
      custo_total: 95,
      contador: 12345,
      responsavel: 'João Silva',
    }))
    // Garante que encadeia .select() imediatamente (sem round-trip extra)
    expect(b.select).toHaveBeenCalled()
    expect(ab.vehicleName).toBe('Ford Transit')
  })

  it('usa obra_id=null quando obraId não é fornecido', async () => {
    b.single.mockResolvedValue({ data: { ...abRow, obra_id: null, obras: null }, error: null })
    await criarAbastecimento({
      vehicleId: 'v-1', date: '2026-07-15',
      liters: 40, totalCost: 76, responsible: 'Ana',
    })
    expect(b.insert).toHaveBeenCalledWith(expect.objectContaining({ obra_id: null }))
  })

  it('propaga erro de insert (e.g. violação unique index dedup)', async () => {
    b.single.mockResolvedValue({ data: null, error: { message: 'duplicate key value' } })
    await expect(
      criarAbastecimento({ vehicleId: 'v-1', date: '2026-07-15', liters: 50, totalCost: 95, responsible: 'João' })
    ).rejects.toMatchObject({ message: 'duplicate key value' })
  })
})

// ── atualizarAbastecimento ────────────────────────────────────────────────────
// chain: from().update({}).eq().select(SELECT).single()
describe('atualizarAbastecimento', () => {
  it('actualiza apenas os campos fornecidos', async () => {
    b.single.mockResolvedValue({ data: abRow, error: null })
    await atualizarAbastecimento('ab-1', { liters: 55, totalCost: 104.5 })
    expect(b.update).toHaveBeenCalledWith(expect.objectContaining({ litros: 55, custo_total: 104.5 }))
    expect(b.eq).toHaveBeenCalledWith('id', 'ab-1')
  })

  it('não inclui campos não fornecidos no update', async () => {
    b.single.mockResolvedValue({ data: abRow, error: null })
    await atualizarAbastecimento('ab-1', { responsible: 'Maria' })
    const updateArg = b.update.mock.calls[0][0] as Record<string, unknown>
    expect(updateArg).not.toHaveProperty('litros')
    expect(updateArg).not.toHaveProperty('custo_total')
  })

  it('propaga erro de update', async () => {
    b.single.mockResolvedValue({ data: null, error: { message: 'rls denied' } })
    await expect(atualizarAbastecimento('ab-1', { liters: 1 })).rejects.toMatchObject({ message: 'rls denied' })
  })
})

// ── eliminarAbastecimento ─────────────────────────────────────────────────────
// chain: from().delete().eq()
describe('eliminarAbastecimento', () => {
  it('elimina pelo id', async () => {
    b.eq.mockResolvedValue({ data: null, error: null })
    await eliminarAbastecimento('ab-1')
    expect(b.delete).toHaveBeenCalled()
    expect(b.eq).toHaveBeenCalledWith('id', 'ab-1')
  })

  it('propaga erro de delete', async () => {
    b.eq.mockResolvedValue({ data: null, error: { message: 'rls denied' } })
    await expect(eliminarAbastecimento('ab-1')).rejects.toMatchObject({ message: 'rls denied' })
  })
})

// ── mapeamento de domínio ─────────────────────────────────────────────────────
describe('mapeamento do domínio', () => {
  it('converte datas ISO em objetos Date', async () => {
    b.order.mockResolvedValue({ data: [abRow], error: null })
    const [ab] = await listarAbastecimentos()
    expect(ab.date).toBeInstanceOf(Date)
    expect(ab.createdAt).toBeInstanceOf(Date)
  })

  it('resolve campos opcionais para undefined (não null)', async () => {
    const rowSemOpcional = { ...abRow, contador: null, local: null, observacoes: null, obra_id: null, obras: null }
    b.order.mockResolvedValue({ data: [rowSemOpcional], error: null })
    const [ab] = await listarAbastecimentos()
    expect(ab.counter).toBeUndefined()
    expect(ab.location).toBeUndefined()
    expect(ab.obraId).toBeUndefined()
  })
})
