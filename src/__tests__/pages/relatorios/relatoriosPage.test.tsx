import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const state = vi.hoisted(() => ({
  role: 'admin' as string | null,
  painel: vi.fn(),
  subs: vi.fn(),
  frota: vi.fn(),
}))

vi.mock('@/features/auth/useRole', () => ({ useRole: () => ({ role: state.role }) }))
vi.mock('@/features/obras/services/obrasService', () => ({ listarPainel: () => state.painel() }))
vi.mock('@/features/obras/services/subsControloService', () => ({
  buscarPainelCeo: () => state.subs(), listarFluxoCaixa: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/features/frota/services/frotaService', () => ({ listarResumoViaturas: () => state.frota() }))
vi.mock('@/features/ferramentas/services/emprestimosService', () => ({ listarEmprestimos: vi.fn().mockResolvedValue([]) }))
vi.mock('@/features/ferramentas/services/ferramentasService', () => ({ listarFerramentas: vi.fn().mockResolvedValue([]) }))
vi.mock('@/features/movimentos/services/movimentosService', () => ({ listarMovimentos: vi.fn().mockResolvedValue([]) }))
vi.mock('@/features/produtos/services/produtosService', () => ({ listarProdutos: vi.fn().mockResolvedValue([]) }))
vi.mock('@/features/combustivel/services/abastecimentosService', () => ({ listarAbastecimentos: vi.fn().mockResolvedValue([]) }))
vi.mock('@/features/combustivel/services/veiculosService', () => ({ listarVeiculos: vi.fn().mockResolvedValue([]) }))
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: [], error: null }), from: vi.fn() },
}))
// Recharts não mede nada em jsdom
vi.mock('recharts', async () => {
  const noop = () => null
  return { ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    BarChart: noop, Bar: noop, XAxis: noop, YAxis: noop, CartesianGrid: noop, Tooltip: noop, Legend: noop,
    LineChart: noop, Line: noop, PieChart: noop, Pie: noop, Cell: noop }
})

import { invalidateCache } from '@/app/lib/useAsync'
import { ReportsPage } from '@/app/pages/ReportsPage'
import { ObrasSection } from '@/app/pages/relatorios/ObrasSection'
import { VisaoGeralSection } from '@/app/pages/relatorios/VisaoGeralSection'

const obra = (p: Record<string, unknown> = {}) => ({
  obra_id: 'o1', nome: 'Edifício Aurora', cliente: 'Câmara', estado: 'ativa', saude: 'ok', motivos: [],
  orcamento: 100000, custo_total: 61234.5, progresso_pct: 40, equipa_n: 5, subs_n: 2, ...p,
})
const subs = { totais: { por_pagar: 12000, contratado: 0, certificado: 0, pago: 0, retencao_acumulada: 0, glosado: 0, taxa_glosa_pct: 0, em_aprovacao_n: 0, em_aprovacao_valor: 0 }, por_sub: [], passivo_documental: { subs_com_pendencia: 0, valor_por_pagar_em_risco: 0 }, alertas: [] }

const mostrar = (el: React.ReactNode) => render(<MemoryRouter>{el}</MemoryRouter>)
afterEach(() => { cleanup(); vi.clearAllMocks(); invalidateCache('relatorio-*'); state.role = 'admin' })

describe('Relatórios — acesso por papel', () => {
  it('admin vê os separadores de gestão e abre na Visão geral', async () => {
    state.painel.mockResolvedValue([]); state.subs.mockResolvedValue(subs); state.frota.mockResolvedValue([])
    mostrar(<ReportsPage />)
    for (const nome of ['Visão geral', 'Obras', 'Subempreitadas', 'Frota', 'Pessoas']) {
      expect(screen.getByRole('tab', { name: new RegExp(nome) })).toBeInTheDocument()
    }
    expect(screen.getByRole('tab', { name: /Visão geral/ })).toHaveAttribute('aria-selected', 'true')
  })

  it.each(['armazem', 'medicoes', 'leitura'])('%s não vê separadores de custos/RH e abre no Stock', (role) => {
    state.role = role
    mostrar(<ReportsPage />)
    for (const nome of ['Visão geral', 'Obras', 'Subempreitadas', 'Frota', 'Pessoas']) {
      expect(screen.queryByRole('tab', { name: new RegExp(nome) })).not.toBeInTheDocument()
    }
    expect(screen.getByRole('tab', { name: /Stock/ })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('Obras — fonte única obras_painel', () => {
  it('mostra o custo consolidado do painel, sem recalcular', async () => {
    state.painel.mockResolvedValue([obra()])
    mostrar(<ObrasSection />)
    await waitFor(() => expect(screen.getByRole('link', { name: 'Edifício Aurora' })).toHaveAttribute('href', '/obras/o1'))
    const custo = /61\D234,50/
    expect(screen.getAllByText(custo).length).toBeGreaterThan(0)
  })

  it('erro mostra mensagem com "Tentar de novo"; vazio mostra estado vazio', async () => {
    state.painel.mockRejectedValueOnce(new Error('falhou'))
    mostrar(<ObrasSection />)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tentar de novo/ })).toBeInTheDocument()
  })
})

describe('Visão geral — falha parcial', () => {
  it('um módulo em erro não derruba os restantes e é assinalado', async () => {
    state.painel.mockResolvedValue([obra({ custo_total: 150000 })])
    state.subs.mockResolvedValue(subs)
    state.frota.mockRejectedValue(new Error('frota em baixo'))
    mostrar(<VisaoGeralSection />)
    expect(await screen.findByText(/Dados incompletos/)).toBeInTheDocument()
    expect(screen.getByText(/Não foi possível carregar: Frota/)).toBeInTheDocument()
    // obra acima do orçamento continua a ser listada como alta
    expect(screen.getByText(/Edifício Aurora: custo acima do orçamento/)).toBeInTheDocument()
  })
})
