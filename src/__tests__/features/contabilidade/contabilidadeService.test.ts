import { vi, describe, it, expect, beforeEach } from 'vitest'
import {
  exportarMateriais,
  exportarCombustivel,
  exportarAutos,
  exportarPLObras,
} from '@/features/contabilidade/contabilidadeService'

// ── Mocks de serviços externos ────────────────────────────────────────────────

vi.mock('@/features/obras/services/obrasService', () => ({
  listarObras: vi.fn(),
}))
vi.mock('@/features/subempreiteiros/services/subempreiteirosService', () => ({
  listarSubempreiteirosComExecutado: vi.fn(),
}))
vi.mock('@/features/custos/custosService', () => ({
  custosMateriaisCombustivelPorObra: vi.fn(),
}))

import { listarObras }                        from '@/features/obras/services/obrasService'
import { listarSubempreiteirosComExecutado }  from '@/features/subempreiteiros/services/subempreiteirosService'
import { custosMateriaisCombustivelPorObra } from '@/features/custos/custosService'

// ── Mock do cliente Supabase — thenable builder ───────────────────────────────
//
// O cliente Supabase usa um padrão de builder lazy: todas as chamadas (.select,
// .eq, .gte, …) devolvem `this` e a query só é resolvida quando se faz `await`.
// Simular isso com mockResolvedValue numa chamada intermédia quebra a chain.
// A solução correcta é um objeto que:
//  1. devolve `this` em todos os métodos chainable  (para a chain poder continuar)
//  2. é "thenable"  — `.then(resolve)` é chamado pelo `await`

let mockData: unknown[] | null = []
let mockError: { message: string } | null = null

const fromMock = vi.hoisted(() => vi.fn())

const builder = {
  select: vi.fn().mockReturnThis(),
  eq:     vi.fn().mockReturnThis(),
  gte:    vi.fn().mockReturnThis(),
  lte:    vi.fn().mockReturnThis(),
  order:  vi.fn().mockReturnThis(),
  filter: vi.fn().mockReturnThis(),
  // Torna este objecto "awaitable": o await chama .then()
  then(
    onfulfilled: (v: { data: unknown[] | null; error: { message: string } | null }) => unknown,
    onrejected?: (e: unknown) => unknown,
  ) {
    return Promise.resolve({ data: mockData, error: mockError }).then(onfulfilled, onrejected)
  },
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: fromMock },
}))

beforeEach(() => {
  vi.clearAllMocks()

  // Repõe o builder chainable
  builder.select.mockReturnThis()
  builder.eq    .mockReturnThis()
  builder.gte   .mockReturnThis()
  builder.lte   .mockReturnThis()
  builder.order .mockReturnThis()
  builder.filter.mockReturnThis()
  fromMock.mockReturnValue(builder)

  // Repõe os dados simulados
  mockData  = []
  mockError = null

  // Repõe os mocks de serviços externos
  ;(listarObras                       as ReturnType<typeof vi.fn>).mockResolvedValue([])
  ;(listarSubempreiteirosComExecutado as ReturnType<typeof vi.fn>).mockResolvedValue([])
  ;(custosMateriaisCombustivelPorObra as ReturnType<typeof vi.fn>).mockResolvedValue({})
})

// ── Fixtures ──────────────────────────────────────────────────────────────────

const matRow = {
  created_at: '2026-07-15T08:00:00Z',
  tipo: 'saida',
  quantidade: 10,
  responsavel: 'Manuel Costa',
  destino_obra: null,
  produtos: { nome: 'Cimento Portland', codigo: 'P001', unidade: 'saco', custo_unitario: 12.5 },
  obras: { nome: 'Moradia Cascais' },
}

const fuelRow = {
  data: '2026-07-20',
  litros: 50,
  custo_total: 95.0,
  responsavel: 'João Silva',
  localizacao: 'Posto BP',
  observacoes: null,
  comb_viaturas: { nome: 'Carrinha Ford', codigo: 'AA-00-BB' },
  obras: { nome: 'Moradia Cascais' },
}

const autoRow = {
  numero: 3,
  data_medicao: '2026-07-10',
  valor_periodo: 1000,
  estado: 'validado',
  estado_pagamento: 'pago',
  data_pagamento: '2026-07-30',
  referencia_pagamento: 'TRF-001',
  validado_em: '2026-07-11T10:00:00Z',
  subempreiteiros: {
    nome: 'Construções Rápidas',
    percentagem_retencao: 5,
    obras: { nome: 'Moradia Cascais' },
  },
}

// ── exportarMateriais ─────────────────────────────────────────────────────────

describe('exportarMateriais', () => {
  it('mapeia uma linha correctamente com custo calculado', async () => {
    mockData = [matRow]
    const rows = await exportarMateriais()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      'Produto':            'Cimento Portland',
      'Código':             'P001',
      'Quantidade':          10,
      'Unidade':            'saco',
      'Custo Unitário (€)': '12.50',
      'Custo Total (€)':    '125.00',   // 10 × 12.50
      'Responsável':        'Manuel Costa',
      'Obra':               'Moradia Cascais',
    })
  })

  it('data formatada em DD/MM/YYYY', async () => {
    mockData = [matRow]
    const [row] = await exportarMateriais()
    expect(row['Data']).toBe('15/07/2026')
  })

  it('usa destino_obra como fallback quando obras é null', async () => {
    mockData = [{ ...matRow, obras: null, destino_obra: 'Obra Externa' }]
    const [row] = await exportarMateriais()
    expect(row['Obra']).toBe('Obra Externa')
  })

  it('custo total = 0 quando produto é null', async () => {
    mockData = [{ ...matRow, produtos: null }]
    const [row] = await exportarMateriais()
    expect(row['Custo Total (€)']).toBe('0.00')
  })

  it('aplica filtro de dataInicio com gte', async () => {
    await exportarMateriais({ dataInicio: '2026-07-01' })
    expect(builder.gte).toHaveBeenCalledWith('created_at', '2026-07-01')
  })

  it('aplica filtro de dataFim com lte (até às 23:59:59)', async () => {
    await exportarMateriais({ dataFim: '2026-07-31' })
    expect(builder.lte).toHaveBeenCalledWith('created_at', '2026-07-31T23:59:59')
  })

  it('aplica filtro de obraId com eq', async () => {
    await exportarMateriais({ obraId: 'uuid-obra-1' })
    expect(builder.eq).toHaveBeenCalledWith('obra_id', 'uuid-obra-1')
  })

  it('propaga erro do Supabase', async () => {
    mockError = { message: 'BD offline' }
    await expect(exportarMateriais()).rejects.toThrow('Materiais: BD offline')
  })
})

// ── exportarCombustivel ───────────────────────────────────────────────────────

describe('exportarCombustivel', () => {
  it('mapeia uma linha correctamente com custo/litro calculado', async () => {
    mockData = [fuelRow]
    const [row] = await exportarCombustivel()
    expect(row).toMatchObject({
      'Viatura':         'Carrinha Ford',
      'Código Viatura':  'AA-00-BB',
      'Litros':           50,
      'Custo/Litro (€)': '1.90',    // 95 / 50
      'Custo Total (€)': '95.00',
      'Responsável':     'João Silva',
      'Obra':            'Moradia Cascais',
      'Local':           'Posto BP',
      'Observações':     '',
    })
  })

  it('data formatada em DD/MM/YYYY', async () => {
    mockData = [fuelRow]
    const [row] = await exportarCombustivel()
    expect(row['Data']).toBe('20/07/2026')
  })

  it('custo/litro = 0.00 quando litros é 0 (evita divisão por zero)', async () => {
    mockData = [{ ...fuelRow, litros: 0, custo_total: 0 }]
    const [row] = await exportarCombustivel()
    expect(row['Custo/Litro (€)']).toBe('0.00')
  })

  it('aplica filtros de data e obra', async () => {
    await exportarCombustivel({ dataInicio: '2026-07-01', dataFim: '2026-07-31', obraId: 'o-1' })
    expect(builder.gte).toHaveBeenCalledWith('data', '2026-07-01')
    expect(builder.lte).toHaveBeenCalledWith('data', '2026-07-31')
    expect(builder.eq).toHaveBeenCalledWith('obra_id', 'o-1')
  })

  it('propaga erro do Supabase', async () => {
    mockError = { message: 'timeout' }
    await expect(exportarCombustivel()).rejects.toThrow('Combustível: timeout')
  })
})

// ── exportarAutos ─────────────────────────────────────────────────────────────

describe('exportarAutos', () => {
  it('mapeia um auto com retenção e valor líquido calculados', async () => {
    mockData = [autoRow]
    const [row] = await exportarAutos()
    // 5% de 1000 = 50 retido, 950 líquido
    expect(row).toMatchObject({
      'Nº Auto':           3,
      'Subempreiteiro':    'Construções Rápidas',
      'Obra':              'Moradia Cascais',
      'Valor Bruto (€)':   '1000.00',
      'Retenção (%)':      5,
      'Valor Retido (€)':  '50.00',
      'Valor Líquido (€)': '950.00',
      'Estado Pagamento':  'Pago',
      'Ref. Pagamento':    'TRF-001',
    })
  })

  it('data de medição formatada em DD/MM/YYYY', async () => {
    mockData = [autoRow]
    const [row] = await exportarAutos()
    expect(row['Data Medição']).toBe('10/07/2026')
  })

  it('data de pagamento formatada em DD/MM/YYYY', async () => {
    mockData = [autoRow]
    const [row] = await exportarAutos()
    expect(row['Data Pagamento']).toBe('30/07/2026')
  })

  it('data pagamento vazia quando null', async () => {
    mockData = [{ ...autoRow, data_pagamento: null }]
    const [row] = await exportarAutos()
    expect(row['Data Pagamento']).toBe('')
  })

  it('valor líquido = bruto quando retenção é 0', async () => {
    mockData = [{ ...autoRow, subempreiteiros: { ...autoRow.subempreiteiros, percentagem_retencao: 0 } }]
    const [row] = await exportarAutos()
    expect(row['Valor Retido (€)']).toBe('0.00')
    expect(row['Valor Líquido (€)']).toBe('1000.00')
  })

  it('filtra só autos validados (eq estado=validado)', async () => {
    await exportarAutos()
    expect(builder.eq).toHaveBeenCalledWith('estado', 'validado')
  })

  it('aplica filtros de data', async () => {
    await exportarAutos({ dataInicio: '2026-07-01', dataFim: '2026-07-31' })
    expect(builder.gte).toHaveBeenCalledWith('data_medicao', '2026-07-01')
    expect(builder.lte).toHaveBeenCalledWith('data_medicao', '2026-07-31')
  })

  it('propaga erro do Supabase', async () => {
    mockError = { message: 'err' }
    await expect(exportarAutos()).rejects.toThrow('Autos: err')
  })
})

// ── exportarPLObras ───────────────────────────────────────────────────────────

describe('exportarPLObras', () => {
  it('agrega custos e calcula margem correctamente', async () => {
    ;(listarObras as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'o-1', name: 'Moradia Cascais', client: 'João', location: 'Cascais', status: 'ativa', budget: 50000 },
    ])
    ;(custosMateriaisCombustivelPorObra as ReturnType<typeof vi.fn>).mockResolvedValue({
      'o-1': { materiais: 10000, combustivel: 2000 },
    })
    ;(listarSubempreiteirosComExecutado as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 's-1', obraId: 'o-1', executed: 15000 },
    ])

    const [row] = await exportarPLObras()

    expect(row).toMatchObject({
      'Obra':                 'Moradia Cascais',
      'Cliente':              'João',
      'Estado':               'Ativa',
      'Orçamento (€)':        '50000.00',
      'Materiais (€)':        '10000.00',
      'Subempreiteiros (€)':  '15000.00',
      'Combustível (€)':      '2000.00',
      'Custo Total (€)':      '27000.00',  // 10000 + 15000 + 2000
      'Margem (€)':           '23000.00',  // 50000 − 27000
      'Margem (%)':           '46.0',      // 23000 / 50000 × 100
    })
  })

  it('margem vazia quando obra não tem orçamento', async () => {
    ;(listarObras as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'o-2', name: 'Obra Sem Orçamento', client: null, location: null, status: 'ativa', budget: undefined },
    ])

    const [row] = await exportarPLObras()
    expect(row['Margem (€)']).toBe('')
    expect(row['Margem (%)']).toBe('')
    expect(row['Orçamento (€)']).toBe('')
  })

  it('obra concluída aparece com estado "Concluída"', async () => {
    ;(listarObras as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'o-3', name: 'Obra Velha', status: 'concluida' },
    ])

    const [row] = await exportarPLObras()
    expect(row['Estado']).toBe('Concluída')
  })

  it('ordena obras por nome alfabeticamente', async () => {
    ;(listarObras as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'o-b', name: 'Beta Obra', status: 'ativa' },
      { id: 'o-a', name: 'Alfa Obra', status: 'ativa' },
      { id: 'o-c', name: 'Gama Obra', status: 'ativa' },
    ])

    const rows = await exportarPLObras()
    expect(rows.map(r => r['Obra'])).toEqual(['Alfa Obra', 'Beta Obra', 'Gama Obra'])
  })

  it('custos = 0 para obra sem qualquer registo', async () => {
    ;(listarObras as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'o-new', name: 'Nova Obra', status: 'ativa', budget: 100000 },
    ])

    const [row] = await exportarPLObras()
    expect(row['Custo Total (€)']).toBe('0.00')
    expect(row['Margem (€)']).toBe('100000.00')
  })

  it('retorna [] quando não há obras', async () => {
    ;(listarObras as ReturnType<typeof vi.fn>).mockResolvedValue([])
    expect(await exportarPLObras()).toEqual([])
  })
})
