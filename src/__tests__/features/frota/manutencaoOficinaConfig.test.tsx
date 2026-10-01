import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { invalidateCache } from '@/app/lib/useAsync'

const mocks = vi.hoisted(() => ({
  role: 'mecanico' as string,
  definir: vi.fn(async () => true as const),
}))

vi.mock('@/features/auth/useRole', () => ({
  useRole: () => ({ role: mocks.role, isAdmin: mocks.role === 'admin', podeFrota: ['admin', 'gestor', 'mecanico'].includes(mocks.role) }),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

function viatura(o: Record<string, unknown>) {
  return {
    id: 'v', nome: 'Carrinha', identificacao: '00-AA-00', marca: null, modelo: null, tipo: 'viatura', unidade_contador: 'km',
    estado_operacional: 'LIVRE', alertas_urgentes: 0, alertas_atencao: 0, data_ultima_revisao: '2026-03-12', ...o,
  }
}
const frota = [
  viatura({ id: 'a', identificacao: 'AA-AA-AA', estado_operacional: 'OFICINA' }),
  viatura({ id: 'b', identificacao: 'BB-BB-BB', alertas_atencao: 2 }),
  viatura({ id: 'c', identificacao: 'CC-CC-CC', alertas_urgentes: 1, alertas_atencao: 1 }),
  viatura({ id: 'd', identificacao: 'DD-DD-DD' }),
]

vi.mock('@/features/frota/hooks/useFrota', () => ({
  useResumoFrota: () => ({ viaturas: frota, loading: false, error: null, reload: vi.fn() }),
  useCatalogo: () => ({ catalogo: [], loading: false, error: null, reload: vi.fn() }),
}))
vi.mock('@/features/frota/services/manutencaoService', () => ({
  definirEstadoViatura: mocks.definir,
  listarHistorico: async () => [],
  listarChecklistsRecentes: async () => [],
  LIMITE_HISTORICO: 2000,
}))
vi.mock('@/features/frota/services/frotaService', () => ({ registarManutencao: vi.fn() }))

import { ManutencaoPage } from '@/features/frota/components/ManutencaoPage'
import { FrotaConfigPage } from '@/features/frota/components/FrotaConfigPage'

const clicar = (el: Element) => act(async () => { fireEvent.click(el) })
const abrir = (el: React.ReactNode, caminho = '/frota/manutencao') => render(<MemoryRouter initialEntries={[caminho]}>{el}</MemoryRouter>)

beforeEach(() => { invalidateCache('frota-*'); mocks.role = 'mecanico'; mocks.definir.mockClear() })
afterEach(cleanup)

describe('Manutenção — em oficina e a vencer', () => {
  it('lista as viaturas na oficina e os prazos a vencer (urgentes primeiro), sem as que estão em dia', () => {
    abrir(<ManutencaoPage />)
    expect(screen.getByText('Na oficina (1)')).toBeInTheDocument()
    expect(screen.getByText('Prazos a vencer (2)')).toBeInTheDocument()
    const nomes = screen.getAllByRole('link').map(l => l.textContent).filter(t => /^[A-D]{2}-/.test(t ?? ''))
    expect(nomes).toEqual(['AA-AA-AA', 'CC-CC-CC', 'BB-BB-BB'])
    expect(screen.queryByText('DD-DD-DD')).not.toBeInTheDocument()
    expect(screen.getByText('1 urgente')).toBeInTheDocument()
  })

  it('"Registar manutenção" leva à viatura certa', () => {
    abrir(<ManutencaoPage />)
    const links = screen.getAllByRole('link', { name: /Registar manutenção/ })
    expect(links.map(l => l.getAttribute('href'))).toContain('/frota/manutencao/nova?viatura=c')
  })

  it('tira da oficina e põe em oficina pelo estado operacional', async () => {
    abrir(<ManutencaoPage />)
    await clicar(screen.getByRole('button', { name: 'Tirar da oficina' }))
    expect(mocks.definir).toHaveBeenLastCalledWith('a', 'LIVRE')
    await clicar(screen.getAllByRole('button', { name: 'Pôr em oficina' })[0])
    expect(mocks.definir).toHaveBeenLastCalledWith('c', 'OFICINA')
  })

  it('quem só consulta vê a lista mas não as ações', () => {
    mocks.role = 'leitura'
    abrir(<ManutencaoPage />)
    expect(screen.getByText('Na oficina (1)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tirar da oficina' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Registar manutenção/ })).not.toBeInTheDocument()
  })

  it('as abas internas trocam de vista', async () => {
    abrir(<ManutencaoPage />)
    await clicar(screen.getByRole('tab', { name: 'Ficha de revisão' }))
    expect(await screen.findByRole('link', { name: /Editar a ficha-modelo/ })).toHaveAttribute('href', '/frota/catalogo')
    expect(screen.getByRole('button', { name: /Abrir checklist de inspeção/ })).toBeDisabled()
    await clicar(screen.getByRole('tab', { name: 'Histórico' }))
    expect(screen.getByLabelText('Pesquisa livre')).toBeInTheDocument()
  })
})

describe('Configuração da frota', () => {
  it('admin vê a ficha de revisão e as notificações', () => {
    mocks.role = 'admin'
    abrir(<FrotaConfigPage />)
    expect(screen.getByRole('link', { name: /Ficha de revisão/ })).toHaveAttribute('href', '/frota/catalogo')
    expect(screen.getByRole('link', { name: /Notificações da frota/ })).toHaveAttribute('href', '/frota/notificacoes')
    expect(screen.getByText('Como funcionam os alertas')).toBeInTheDocument()
  })

  it('mecânico só vê a ficha de revisão', () => {
    abrir(<FrotaConfigPage />)
    expect(screen.getByRole('link', { name: /Ficha de revisão/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Notificações da frota/ })).not.toBeInTheDocument()
  })

  it('só consulta: sem acesso', () => {
    mocks.role = 'leitura'
    abrir(<FrotaConfigPage />)
    expect(screen.getByText(/Não tem permissão/)).toBeInTheDocument()
  })
})
