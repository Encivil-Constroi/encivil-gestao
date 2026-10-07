import { vi, describe, it, expect, beforeEach } from 'vitest'
import {
  exportarMateriais,
  exportarCombustivel,
  exportarAutos,
  exportarPLObras,
  exportarMapaAssiduidade,
  exportarFaltas,
  exportarDadosLaborais,
  exportarFaturas,
  exportarFechoMes,
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
vi.mock('@/app/lib/rpcSemTipos', () => ({ rpcSemTipos: vi.fn() }))

import { listarObras }                        from '@/features/obras/services/obrasService'
import { listarSubempreiteirosComExecutado }  from '@/features/subempreiteiros/services/subempreiteirosService'
import { custosMateriaisCombustivelPorObra } from '@/features/custos/custosService'
import { rpcSemTipos } from '@/app/lib/rpcSemTipos'

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
  lt:     vi.fn().mockReturnThis(),
  or:     vi.fn().mockReturnThis(),
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
  builder.lt    .mockReturnThis()
  builder.or    .mockReturnThis()
  builder.order .mockReturnThis()
  builder.filter.mockReturnThis()
  fromMock.mockReturnValue(builder)

  // Repõe os dados simulados
  mockData  = []
  mockError = null

  // Repõe os mocks de serviços externos
  ;(rpcSemTipos as ReturnType<typeof vi.fn>).mockResolvedValue([])
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
  local: 'Posto BP',
  observacoes: null,
  comb_veiculos: { nome: 'Carrinha Ford', codigo: 'AA-00-BB' },
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
      'Custo Unitário (€)': 12.5,
      'Custo Total (€)':    125,   // 10 × 12.50
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
    expect(row['Custo Total (€)']).toBe(0)
  })

  it('aplica filtro de dataInicio com gte no início do dia em Lisboa', async () => {
    await exportarMateriais({ dataInicio: '2026-07-01' })
    expect(builder.gte).toHaveBeenCalledWith('created_at', '2026-06-30T23:00:00.000Z')
  })

  it('aplica filtro de dataFim com lt no início do dia seguinte em Lisboa', async () => {
    await exportarMateriais({ dataFim: '2026-07-31' })
    expect(builder.lt).toHaveBeenCalledWith('created_at', '2026-07-31T23:00:00.000Z')
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
      'Custo/Litro (€)': 1.9,    // 95 / 50
      'Custo Total (€)': 95,
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
    expect(row['Custo/Litro (€)']).toBe(0)
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
      'Valor Bruto (€)':   1000,
      'Retenção (%)':      5,
      'Valor Retido (€)':  50,
      'Valor Líquido (€)': 950,
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
    expect(row['Valor Retido (€)']).toBe(0)
    expect(row['Valor Líquido (€)']).toBe(1000)
  })

  it('retenção e líquido sobre o certificado quando há glosas', async () => {
    mockData = [{ ...autoRow, valor_glosado: 200 }]
    const [row] = await exportarAutos()
    // certificado 800; 5% = 40 retido; 760 líquido
    expect(row).toMatchObject({
      'Valor Bruto (€)':        1000,
      'Glosado (€)':            200,
      'Valor Certificado (€)':  800,
      'Valor Retido (€)':       40,
      'Valor Líquido (€)':      760,
    })
  })

  it('sem valor_glosado (dados antigos) o certificado é o bruto', async () => {
    mockData = [autoRow]
    const [row] = await exportarAutos()
    expect(row['Glosado (€)']).toBe(0)
    expect(row['Valor Certificado (€)']).toBe(1000)
  })

  it('seleciona valor_glosado', async () => {
    await exportarAutos()
    expect(builder.select).toHaveBeenCalledWith(expect.stringContaining('valor_glosado'))
  })

  it('filtra só autos validados (eq estado=validado)', async () => {
    await exportarAutos()
    expect(builder.eq).toHaveBeenCalledWith('estado', 'validado')
  })

  it('filtra a obra na query (inner join), não no cliente', async () => {
    await exportarAutos({ obraId: 'o1' })
    expect(builder.eq).toHaveBeenCalledWith('subempreiteiros.obra_id', 'o1')
    expect(builder.select).toHaveBeenCalledWith(expect.stringContaining('subempreiteiros!inner('))
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
      'Orçamento (€)':        50000,
      'Materiais (€)':        10000,
      'Subempreiteiros (€)':  15000,
      'Combustível (€)':      2000,
      'Custo Total (€)':      27000,  // 10000 + 15000 + 2000
      'Margem (€)':           23000,  // 50000 − 27000
      'Margem (%)':           46,      // 23000 / 50000 × 100
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
    expect(row['Custo Total (€)']).toBe(0)
    expect(row['Margem (€)']).toBe(100000)
  })

  it('retorna [] quando não há obras', async () => {
    ;(listarObras as ReturnType<typeof vi.fn>).mockResolvedValue([])
    expect(await exportarPLObras()).toEqual([])
  })
})

// ── Novos exports de contabilidade/RH ─────────────────────────────────────────

const linhaMapa = {
  colaborador_id: 'c1', numero_mecan: '007', nome: 'Rui Dias', nif: '123456789', niss: '12345678901', cargo: 'Pedreiro',
  dias_trabalhados: 20, horas_normais: 160, horas_extra_util_25: 4, horas_extra_util_375: 2, horas_extra_descanso_50: 3,
  horas_extra_total: 9, dias_subsidio_alimentacao: 19, faltas_justificadas_dias: 1, faltas_injustificadas_dias: 0.5,
  faltas_descontaveis_dias: 1.5,
  faltas_detalhe: [
    { tipo: 'Doença', estado: 'JUSTIFICADA', dias: 1 },
    { tipo: 'Sem tipo', estado: 'INJUSTIFICADA', dias: 0.5 },
  ],
}

describe('exportarMapaAssiduidade', () => {
  it('chama a RPC com o período e mapeia as colunas pela ordem', async () => {
    ;(rpcSemTipos as ReturnType<typeof vi.fn>).mockResolvedValue([linhaMapa])
    const [row] = await exportarMapaAssiduidade({ dataInicio: '2026-07-01', dataFim: '2026-07-31' })
    expect(rpcSemTipos).toHaveBeenCalledWith('contabilidade_mapa_assiduidade', { p_inicio: '2026-07-01', p_fim: '2026-07-31' })
    expect(Object.keys(row)).toEqual([
      'Nº Mecanográfico', 'Nome', 'NIF', 'NISS', 'Cargo', 'Dias Trabalhados', 'Horas Normais',
      'Extra Dia Útil +25% (h)', 'Extra Dia Útil +37,5% (h)', 'Extra Descanso/Feriado +50% (h)', 'Total Horas Extra',
      'Dias Subsídio Alimentação', 'Faltas Justificadas (dias)', 'Faltas Injustificadas (dias)', 'Faltas Descontáveis (dias)',
    ])
    expect(row).toMatchObject({ 'Nome': 'Rui Dias', 'NISS': '12345678901', 'Horas Normais': 160, 'Total Horas Extra': 9, 'Faltas Descontáveis (dias)': 1.5 })
  })
})

describe('exportarFaltas', () => {
  it('uma linha por elemento de faltas_detalhe', async () => {
    ;(rpcSemTipos as ReturnType<typeof vi.fn>).mockResolvedValue([linhaMapa])
    const rows = await exportarFaltas({ dataInicio: '2026-07-01', dataFim: '2026-07-31' })
    expect(rows).toEqual([
      { 'Nº Mecanográfico': '007', 'Nome': 'Rui Dias', 'Tipo de Falta': 'Doença', 'Estado': 'JUSTIFICADA', 'Dias': 1 },
      { 'Nº Mecanográfico': '007', 'Nome': 'Rui Dias', 'Tipo de Falta': 'Sem tipo', 'Estado': 'INJUSTIFICADA', 'Dias': 0.5 },
    ])
  })
})

describe('exportarDadosLaborais', () => {
  it('usa a RPC (o NIF não se lê da tabela) e traduz o contrato', async () => {
    ;(rpcSemTipos as ReturnType<typeof vi.fn>).mockResolvedValue([
      { numero_mecan: '1', nome: 'Ana', nif: '1', cargo: 'Eng.', ativo: true,
        niss: '11', iban: 'PT50', data_admissao: '2025-01-02', tipo_contrato: 'SEM_TERMO', data_fim_contrato: null, categoria_profissional: 'Técnico' },
      { numero_mecan: '2', nome: 'Rui', nif: null, cargo: 'Ajudante', ativo: false,
        niss: null, iban: null, data_admissao: null, tipo_contrato: null, data_fim_contrato: null, categoria_profissional: null },
    ])
    const rows = await exportarDadosLaborais()
    expect(rpcSemTipos).toHaveBeenCalledWith('contabilidade_dados_laborais')
    expect(rows[0]).toMatchObject({ 'NISS': '11', 'IBAN': 'PT50', 'Tipo Contrato': 'Sem termo', 'Data Admissão': '02/01/2025', 'Ativo': 'Sim' })
    expect(rows[1]).toMatchObject({ 'NISS': '', 'Tipo Contrato': '', 'Ativo': 'Não' })
  })
})

describe('exportarFaturas', () => {
  it('mapeia as colunas fiscais e filtra por data da fatura (ou receção se sem data) e obra', async () => {
    mockData = [{ numero_fatura: 'FT 1', fornecedor: 'Cimpor', nif_fornecedor: '500000000', data_fatura: '2026-07-02', data_recepcao: '2026-07-03',
      base_tributavel: 100, valor_iva: 23, total_fatura: 123, estado: 'LANCADA', lancado_em: '2026-07-05T10:00:00Z', obras: { nome: 'Cascais' } }]
    const [row] = await exportarFaturas({ dataInicio: '2026-07-01', dataFim: '2026-07-31', obraId: 'o1' })
    expect(builder.or).toHaveBeenCalledWith(
      'and(data_fatura.gte.2026-07-01,data_fatura.lte.2026-07-31),'
      + 'and(data_fatura.is.null,data_recepcao.gte.2026-07-01,data_recepcao.lte.2026-07-31)',
    )
    expect(builder.eq).toHaveBeenCalledWith('obra_id', 'o1')
    expect(row).toMatchObject({
      'Nº Fatura': 'FT 1', 'NIF Fornecedor': '500000000', 'Base Tributável (€)': 100, 'IVA (€)': 23,
      'Total (€)': 123, 'Obra': 'Cascais', 'Estado': 'Lançada',
    })
  })
})

describe('exportarFechoMes', () => {
  it('devolve as 9 folhas pela ordem certa', async () => {
    const folhas = await exportarFechoMes({ dataInicio: '2026-07-01', dataFim: '2026-07-31' })
    expect(folhas.map(f => f.nome)).toEqual([
      'Assiduidade', 'Faltas', 'Dados laborais', 'Faturas', 'Materiais', 'Combustível', 'Autos', 'P&L', 'Notas',
    ])
    expect(folhas[8].linhas.length).toBeGreaterThan(0)
  })
})
