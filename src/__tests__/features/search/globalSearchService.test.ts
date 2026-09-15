import { vi, describe, it, expect, beforeEach } from 'vitest'
import { pesquisarGlobal } from '@/features/search/globalSearchService'

// ── Mock de Supabase: dispatch por tabela ─────────────────────────────────────
//
// Cada chamada .from(table) devolve um builder independente com o seu próprio
// resultado. Isto permite testar as 4 queries paralelas separadamente.

type TableName = 'obras' | 'produtos' | 'subempreiteiros' | 'ferramentas'

const tableData: Record<TableName, unknown[]> = {
  obras: [], produtos: [], subempreiteiros: [], ferramentas: [],
}

function makeBuilder(table: TableName) {
  const self = {
    select: vi.fn().mockReturnThis(),
    or:     vi.fn().mockReturnThis(),
    ilike:  vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    limit:  vi.fn(),
  }
  // limit() é o terminal de todas as 4 queries
  self.limit.mockImplementation(() =>
    Promise.resolve({ data: tableData[table], error: null })
  )
  return self
}

const fromMock = vi.hoisted(() => vi.fn())

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: fromMock },
}))

beforeEach(() => {
  vi.clearAllMocks()
  // Reset dados de teste
  tableData.obras = []
  tableData.produtos = []
  tableData.subempreiteiros = []
  tableData.ferramentas = []
  // Dispatch por tabela
  fromMock.mockImplementation((table: TableName) => makeBuilder(table))
})

// ── Fixtures ──────────────────────────────────────────────────────────────────

const obraRow    = { id: 'obra-1',    nome: 'Moradia Cascais',     cliente: 'João Silva', estado: 'ativa' }
const produtoRow = { id: 'prod-1',    nome: 'Cimento Portland',    codigo: 'P001', categoria: 'cimento' }
const subRow     = { id: 'sub-1',     nome: 'Construções Rápidas', obras: { nome: 'Moradia Cascais' } }
const ferrRow    = { id: 'ferr-1',    nome: 'Martelo de Impacto',  codigo: 'F001', estado: 'disponivel' }

// ── Testes ────────────────────────────────────────────────────────────────────

describe('pesquisarGlobal', () => {

  describe('guarda de entrada', () => {
    it('retorna [] para string vazia', async () => {
      expect(await pesquisarGlobal('')).toEqual([])
      expect(fromMock).not.toHaveBeenCalled()
    })

    it('retorna [] para 1 caracter (< 2)', async () => {
      expect(await pesquisarGlobal('a')).toEqual([])
      expect(fromMock).not.toHaveBeenCalled()
    })

    it('retorna [] para string só com espaços', async () => {
      expect(await pesquisarGlobal('   ')).toEqual([])
      expect(fromMock).not.toHaveBeenCalled()
    })

    it('executa a pesquisa com 2 caracteres', async () => {
      expect(await pesquisarGlobal('ab')).toEqual([])
      expect(fromMock).toHaveBeenCalledTimes(4)
    })
  })

  describe('paralelismo — 4 tabelas', () => {
    it('consulta as 4 tabelas em paralelo', async () => {
      await pesquisarGlobal('obra')
      const tables = fromMock.mock.calls.map(c => c[0])
      expect(tables).toContain('obras')
      expect(tables).toContain('produtos')
      expect(tables).toContain('subempreiteiros')
      expect(tables).toContain('ferramentas')
    })

    it('devolve array vazio quando todas as queries não têm resultados', async () => {
      const results = await pesquisarGlobal('xyzxyz')
      expect(results).toEqual([])
    })
  })

  describe('mapeamento — obras', () => {
    it('mapeia obra para SearchResult com kind=obra', async () => {
      tableData.obras = [obraRow]
      const results = await pesquisarGlobal('casca')
      const obra = results.find(r => r.kind === 'obra')
      expect(obra).toMatchObject({
        id:       'obra-1',
        kind:     'obra',
        title:    'Moradia Cascais',
        subtitle: 'João Silva · Ativa',
        link:     '/obras/obra-1',
      })
    })

    it('omite cliente do subtitle quando null', async () => {
      tableData.obras = [{ ...obraRow, cliente: null }]
      const [r] = await pesquisarGlobal('casca')
      expect(r.subtitle).toBe('Ativa')  // sem cliente
    })

    it('label "Concluída" para estado concluida', async () => {
      tableData.obras = [{ ...obraRow, estado: 'concluida' }]
      const [r] = await pesquisarGlobal('casca')
      expect(r.subtitle).toContain('Concluída')
    })
  })

  describe('mapeamento — produtos', () => {
    it('mapeia produto para SearchResult com kind=produto', async () => {
      tableData.produtos = [produtoRow]
      const results = await pesquisarGlobal('cimento')
      const prod = results.find(r => r.kind === 'produto')
      expect(prod).toMatchObject({
        id:       'prod-1',
        kind:     'produto',
        title:    'Cimento Portland',
        subtitle: 'P001 · cimento',
        link:     '/produtos/prod-1',
      })
    })
  })

  describe('mapeamento — subempreiteiros', () => {
    it('mapeia subempreiteiro com nome da obra no subtitle', async () => {
      tableData.subempreiteiros = [subRow]
      const results = await pesquisarGlobal('rapidas')
      const sub = results.find(r => r.kind === 'subempreiteiro')
      expect(sub).toMatchObject({
        id:       'sub-1',
        kind:     'subempreiteiro',
        title:    'Construções Rápidas',
        subtitle: 'Moradia Cascais',
        link:     '/subempreiteiros/sub-1',
      })
    })

    it('subtitle undefined quando obras é null', async () => {
      tableData.subempreiteiros = [{ ...subRow, obras: null }]
      const results = await pesquisarGlobal('rapidas')
      const sub = results.find(r => r.kind === 'subempreiteiro')
      expect(sub?.subtitle).toBeUndefined()
    })
  })

  describe('mapeamento — ferramentas', () => {
    it('mapeia ferramenta para SearchResult com kind=ferramenta', async () => {
      tableData.ferramentas = [ferrRow]
      const results = await pesquisarGlobal('martelo')
      const ferr = results.find(r => r.kind === 'ferramenta')
      expect(ferr).toMatchObject({
        id:    'ferr-1',
        kind:  'ferramenta',
        title: 'Martelo de Impacto',
        link:  '/ferramentas/ferr-1',
      })
      expect(ferr?.subtitle).toContain('Disponível')
    })

    it('label "Emprestado" para estado emprestado', async () => {
      tableData.ferramentas = [{ ...ferrRow, estado: 'emprestado' }]
      const results = await pesquisarGlobal('martelo')
      const ferr = results.find(r => r.kind === 'ferramenta')
      expect(ferr?.subtitle).toContain('Emprestado')
    })
  })

  describe('ordem dos resultados', () => {
    it('devolve obras antes de produtos antes de subempreiteiros antes de ferramentas', async () => {
      tableData.obras          = [obraRow]
      tableData.produtos       = [produtoRow]
      tableData.subempreiteiros = [subRow]
      tableData.ferramentas    = [ferrRow]

      const results = await pesquisarGlobal('eis')
      const kinds = results.map(r => r.kind)
      expect(kinds.indexOf('obra')).toBeLessThan(kinds.indexOf('produto'))
      expect(kinds.indexOf('subempreiteiro')).toBeLessThan(kinds.indexOf('ferramenta'))
    })
  })

  describe('parâmetro de pesquisa', () => {
    it('passa o termo com wildcards ao or/ilike', async () => {
      await pesquisarGlobal('obras rio')
      // Localiza o builder da tabela 'obras' pelo índice da sua chamada
      const obraIdx = fromMock.mock.calls.findIndex(call => call[0] === 'obras')
      expect(obraIdx).toBeGreaterThanOrEqual(0)
      const obraBuilder = fromMock.mock.results[obraIdx].value
      expect(obraBuilder.or).toHaveBeenCalledWith(
        expect.stringContaining('%obras rio%')
      )
    })
  })
})
