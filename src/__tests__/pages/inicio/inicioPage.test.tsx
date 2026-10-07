import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const m = vi.hoisted(() => ({
  role: 'gestor' as string,
  veiculoId: null as string | null,
  erroCtx: null as string | null,
  podeAprovar: false,
}))

const ESCRITA: Record<string, [boolean, boolean, boolean, boolean]> = {   // armazem, frota, obras, subempreitadas
  admin: [true, true, true, true], gestor: [true, true, true, true], armazem: [true, false, false, false],
  medicoes: [false, false, false, true], mecanico: [false, true, false, false], motorista: [false, false, false, false],
  leitura: [false, false, false, false],
}

vi.mock('@/features/auth/useRole', () => ({
  useRole: () => {
    const [a, f, o, s] = ESCRITA[m.role]
    return { role: m.role, loading: false, nome: 'Rui Silva', podeArmazem: a, podeCombustivel: a, podeFrota: f, podeObras: o, podeSubempreitadas: s }
  },
}))
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/features/colaboradores/hooks/useColaboradores', () => ({
  useMeuColaborador: () => ({ colaborador: { nome: 'Rui Silva', cargo: 'Servente', obraNome: 'Obra Norte' }, loading: false, error: null, reload: vi.fn() }),
}))
vi.mock('@/features/combustivel/hooks/usePedidos', () => ({
  useContextoAbastecimento: () => ({
    contexto: m.veiculoId ? { veiculo_id: m.veiculoId, veiculo_nome: 'Hilux', veiculo_identificacao: '11-AA-22', km_atual: 120000, pedido_aberto_id: null, pode_aprovar: false, nome: 'Rui', colaborador_id: 'c1', tipo_combustivel: 'gasoleo' } : null,
    loading: false, error: m.erroCtx, reload: vi.fn(),
  }),
  usePodeAprovar: () => ({ podeAprovar: m.podeAprovar, loading: false }),
  useContagemAguardam: () => 3,
  useAbastecimentosVeiculo: () => ({ abastecimentos: [], loading: false, error: null, reload: vi.fn() }),
  usePedidos: () => ({ pedidos: [], loading: false, error: null, reload: vi.fn() }),
}))
vi.mock('@/features/dashboard/hooks/useDashboard', () => ({
  useDashboard: () => ({ stats: { totalProducts: 10, todayEntries: 1, todayExits: 2, lowStockProducts: 0, lowStockItems: [], recentMovements: [] }, loading: false, error: null, reload: vi.fn() }),
}))
vi.mock('@/features/frota/hooks/useFrota', () => ({
  useResumoFrota: () => ({ viaturas: [], loading: false, error: null, reload: vi.fn() }),
}))
vi.mock('@/features/obras/hooks/useObras', () => ({
  useObras: () => ({ obras: [{ id: 'o1' }], loading: false, error: null, reload: vi.fn() }),
}))
vi.mock('@/app/pages/DashboardPage', () => ({ DashboardPage: () => <p>DASHBOARD DO CEO</p> }))

import { InicioPage } from '@/app/pages/inicio/InicioPage'

function abrir(papel: string, extra: Partial<typeof m> = {}) {
  Object.assign(m, { role: papel, veiculoId: null, erroCtx: null, podeAprovar: false }, extra)
  render(<MemoryRouter><InicioPage /></MemoryRouter>)
}
const seccao = (nome: string) => screen.queryByRole('region', { name: nome })

afterEach(cleanup)

describe('Início por cargo', () => {
  it('o CEO (admin) vê o Dashboard executivo', async () => {
    abrir('admin')
    expect(await screen.findByText('DASHBOARD DO CEO')).toBeInTheDocument()
  })

  it.each(['gestor', 'armazem', 'mecanico', 'medicoes', 'motorista', 'leitura'])('%s nunca vê o Dashboard do CEO', papel => {
    abrir(papel)
    expect(screen.queryByText('DASHBOARD DO CEO')).not.toBeInTheDocument()
  })

  it('o gestor vê as secções de todos os módulos que gere', () => {
    abrir('gestor')
    for (const s of ['Armazém', 'Frota', 'Combustível', 'Obras']) expect(seccao(s)).toBeInTheDocument()
    expect(seccao('O meu veículo')).not.toBeInTheDocument()
  })

  it('o mecânico vê só a Frota e os atalhos da Frota', () => {
    abrir('mecanico')
    expect(seccao('Frota')).toBeInTheDocument()
    for (const s of ['Armazém', 'Combustível', 'Obras']) expect(seccao(s)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Entregar viatura' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Pedir combustível' })).not.toBeInTheDocument()
  })

  it('o responsável do armazém vê Armazém e Combustível, com atalhos de movimento', () => {
    abrir('armazem')
    expect(seccao('Armazém')).toBeInTheDocument()
    expect(seccao('Combustível')).toBeInTheDocument()
    expect(seccao('Frota')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Registar saída' })).toBeInTheDocument()
  })

  it('o motorista sem viatura vê o estado vazio e pode pedir combustível', () => {
    abrir('motorista')
    expect(seccao('O meu veículo')).toBeInTheDocument()
    expect(screen.getByText(/Sem viatura atribuída/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pedir combustível' })).toBeInTheDocument()
    expect(seccao('Armazém')).not.toBeInTheDocument()
  })

  it('o colaborador de consulta com carro vê o veículo mas não pede combustível', () => {
    abrir('leitura', { veiculoId: 'v1' })
    expect(screen.getByText('Hilux')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Pedir combustível' })).not.toBeInTheDocument()
    expect(seccao('Consulta')).toBeInTheDocument()
  })

  it('mostra nome, cargo e obra do colaborador no topo', () => {
    abrir('motorista')
    expect(screen.getByText(/Motorista · Servente · Obra Norte/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Rui')
  })

  it('o aprovador designado vê a contagem de pedidos à espera', () => {
    abrir('medicoes', { podeAprovar: true })
    expect(seccao('Combustível')).toBeInTheDocument()
    expect(screen.getByText('Pedidos à espera da sua decisão')).toBeInTheDocument()
  })

  it('uma falha ao carregar o veículo não derruba o resto', () => {
    abrir('motorista', { erroCtx: 'Erro ao carregar os seus dados' })
    expect(screen.getByRole('alert')).toHaveTextContent('Erro ao carregar os seus dados')
    expect(screen.getByRole('link', { name: 'Pedir combustível' })).toBeInTheDocument()
  })
})
