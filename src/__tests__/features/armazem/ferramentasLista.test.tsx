import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { dia, ferr, emp } from './ferramentasHelpers'

const m = vi.hoisted(() => ({ pode: true, tools: [] as unknown[], loans: [] as unknown[] }))
vi.mock('@/features/auth/useRole', () => ({ useRole: () => ({ podeFerramentas: m.pode }) }))
vi.mock('@/features/configuracoes/hooks/useConfiguracoes', () => ({ useConfiguracoes: () => ({ config: null }) }))
vi.mock('@/app/components/ToolLoanTermPrint', () => ({ ToolLoanTermPrint: () => null }))
vi.mock('@/app/lib/fotosArmazem', () => ({ urlFotoArmazem: (c: string | null) => (c ? `https://f/${c}` : null) }))
vi.mock('@/features/ferramentas/hooks/useFerramentas', () => ({
  useFerramentas: () => ({ tools: m.tools, loading: false, error: null, reload: vi.fn() }),
  useFerramentasArquivadas: () => ({ tools: [], loading: false, error: null, reload: vi.fn() }),
  useRestaurarFerramenta: () => ({ restaurar: vi.fn(), loading: false }),
}))
vi.mock('@/features/ferramentas/hooks/useEmprestimos', () => ({
  useEmprestimos: () => ({ loans: m.loans, loading: false, error: null, reload: vi.fn() }),
  useEmprestimosPaginados: () => ({ loans: [], count: 0, page: 0, totalPages: 0, loading: false, error: null, setPage: vi.fn(), reload: vi.fn() }),
}))

import { FerramentasPage } from '@/app/pages/armazem/FerramentasPage'

const abrir = () => render(<MemoryRouter><FerramentasPage /></MemoryRouter>)
const cartao = (id: string) => screen.getByTestId(`ferramenta-${id}`)

beforeEach(() => {
  m.pode = true
  m.tools = [
    ferr({ id: 'd', name: 'Berbequim', status: 'disponivel', serialNumber: 'SN-111', marca: 'Bosch', garantiaAte: dia(200) }),
    ferr({ id: 'e', name: 'Rebarbadora', status: 'emprestada', garantiaAte: dia(10) }),
    ferr({ id: 'a', name: 'Serra', status: 'emprestada', garantiaAte: dia(-5) }),
    ferr({ id: 'k', name: 'Nível laser', status: 'manutencao' }),
    ferr({ id: 'i', name: 'Martelo', status: 'inativa' }),
  ]
  m.loans = [
    emp({ id: 'l1', toolId: 'e', employeeName: 'Rui Alves', destination: 'Obra Norte', expectedReturnDate: new Date(`${dia(5)}T00:00:00Z`) }),
    emp({ id: 'l2', toolId: 'a', employeeName: 'Ana Lopes', destination: 'Obra Sul', expectedReturnDate: new Date(`${dia(-3)}T00:00:00Z`) }),
  ]
})
afterEach(cleanup)

describe('lista de ferramentas', () => {
  it('mostra o estado de cada ferramenta de forma visível', () => {
    abrir()
    expect(within(cartao('d')).getByText('Disponível')).toBeInTheDocument()
    expect(within(cartao('e')).getByText('Emprestada')).toBeInTheDocument()
    expect(within(cartao('k')).getByText('Manutenção')).toBeInTheDocument()
    expect(within(cartao('i')).getByText('Inativa')).toBeInTheDocument()
  })

  it('emprestada mostra quem, obra e desde quando; atraso só se passou a data', () => {
    abrir()
    expect(cartao('e')).toHaveTextContent('Rui Alves')
    expect(cartao('e')).toHaveTextContent('Obra Norte')
    expect(cartao('e')).toHaveTextContent('desde')
    expect(cartao('e')).not.toHaveTextContent('Em atraso')
    expect(cartao('a')).toHaveTextContent('Ana Lopes')
    expect(cartao('a')).toHaveTextContent('Em atraso')
  })

  it('contadores: disponíveis, emprestadas, em atraso, manutenção', () => {
    abrir()
    expect(screen.getByTestId('contador-disponivel')).toHaveTextContent('1')
    expect(screen.getByTestId('contador-emprestada')).toHaveTextContent('2')
    expect(screen.getByTestId('contador-atraso')).toHaveTextContent('1')
    expect(screen.getByTestId('contador-manutencao')).toHaveTextContent('1')
  })

  it('selo de garantia: válida, a terminar (≤30 dias) e expirada', () => {
    abrir()
    expect(cartao('d').querySelector('[data-garantia="valida"]')).toHaveTextContent(/Em garantia até/)
    expect(cartao('e').querySelector('[data-garantia="a_terminar"]')).toHaveTextContent('Garantia termina em 10 dias')
    expect(cartao('a').querySelector('[data-garantia="expirada"]')).toHaveTextContent(/expirada/)
    expect(cartao('k').querySelector('[data-garantia]')).toBeNull()
  })

  it('pesquisa por n.º de série e filtro de garantia a terminar', () => {
    abrir()
    fireEvent.change(screen.getByLabelText('Pesquisar ferramentas'), { target: { value: 'sn-111' } })
    expect(screen.getByText('Berbequim')).toBeInTheDocument()
    expect(screen.queryByText('Rebarbadora')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Pesquisar ferramentas'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /Garantia a terminar/ }))
    expect(screen.getByText('Rebarbadora')).toBeInTheDocument()
    expect(screen.queryByText('Berbequim')).not.toBeInTheDocument()
  })

  it('ações por estado: Emprestar só se disponível, Devolver só se emprestada', () => {
    abrir()
    expect(within(cartao('d')).getByRole('link', { name: /Emprestar/ })).toHaveAttribute('href', '/armazem/ferramenta/emprestimo?ferramenta=d')
    expect(within(cartao('e')).getByRole('link', { name: /Devolver/ })).toHaveAttribute('href', '/armazem/ferramenta/e/devolucao')
    expect(within(cartao('e')).queryByRole('link', { name: /Emprestar/ })).toBeNull()
    expect(within(cartao('k')).queryByRole('link', { name: /Emprestar|Devolver/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Nova ferramenta/ })).toHaveAttribute('href', '/armazem/ferramenta/nova')
  })

  it('sem permissão: só leitura, sem botões de ação', () => {
    m.pode = false
    abrir()
    expect(screen.queryByRole('link', { name: /Emprestar|Devolver|Nova ferramenta/ })).toBeNull()
    expect(screen.getByText('Berbequim')).toBeInTheDocument()
  })
})
