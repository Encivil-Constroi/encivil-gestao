import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import { dia, ferr, emp } from './ferramentasHelpers'

const m = vi.hoisted(() => ({ pode: true, tool: undefined as unknown, loans: [] as unknown[] }))
vi.mock('@/features/auth/useRole', () => ({ useRole: () => ({ podeFerramentas: m.pode }) }))
vi.mock('@/features/configuracoes/hooks/useConfiguracoes', () => ({ useConfiguracoes: () => ({ config: null }) }))
vi.mock('@/app/components/ToolLoanTermPrint', () => ({ ToolLoanTermPrint: () => null }))
vi.mock('@/app/lib/fotosArmazem', () => ({ urlFotoArmazem: (c: string | null) => (c ? `https://f/${c}` : null) }))
vi.mock('@/features/ferramentas/hooks/useFerramentas', () => ({
  useFerramenta: () => ({ tool: m.tool, loading: false }),
  useArquivarFerramenta: () => ({ arquivar: vi.fn(), loading: false }),
}))
vi.mock('@/features/ferramentas/hooks/useEmprestimos', () => ({
  useEmprestimos: () => ({ loans: m.loans, loading: false, error: null, reload: vi.fn() }),
}))

import { FerramentaDetalhePage } from '@/app/pages/armazem/FerramentaDetalhePage'

const abrir = () => render(
  <MemoryRouter initialEntries={['/armazem/ferramenta/t1']}>
    <Routes><Route path="/armazem/ferramenta/:id" element={<FerramentaDetalhePage />} /></Routes>
  </MemoryRouter>)

beforeEach(() => { m.pode = true })
afterEach(cleanup)

describe('detalhe da ferramenta', () => {
  it('histórico mostra foto da entrega e da devolução lado a lado, e a condição', () => {
    m.tool = ferr({ id: 't1', name: 'Berbequim', serialNumber: 'SN-9', marca: 'Bosch', modelo: 'GSB', nova: true, dataCompra: '2026-01-10', garantiaAte: dia(15) })
    m.loans = [emp({
      id: 'l1', toolId: 't1', status: 'devolvido', returnDate: new Date('2026-09-25T10:00:00Z'), returnCondition: 'danificada',
      fotoEntregaPath: 'ferramentas/t1/entrega_1.jpg', fotoDevolucaoPath: 'ferramentas/t1/devolucao_2.jpg',
    })]
    abrir()
    const h = screen.getByTestId('historico-l1')
    expect(within(h).getByAltText('Entrega')).toHaveAttribute('src', 'https://f/ferramentas/t1/entrega_1.jpg')
    expect(within(h).getByAltText('Devolução')).toHaveAttribute('src', 'https://f/ferramentas/t1/devolucao_2.jpg')
    expect(h).toHaveTextContent('Danificada')
    expect(screen.getByText('SN-9')).toBeInTheDocument()
    expect(screen.getByText('Bosch GSB')).toBeInTheDocument()
    expect(screen.getByText(/Garantia termina em 15 dias/)).toBeInTheDocument()
  })

  it('emprestada: cartão com quem/obra/foto da entrega e ação Devolver; sem Emprestar nem arquivar', () => {
    m.tool = ferr({ id: 't1', name: 'Serra', status: 'emprestada' })
    m.loans = [emp({
      id: 'l1', toolId: 't1', employeeName: 'Rui Alves', destination: 'Obra Norte',
      expectedReturnDate: new Date(`${dia(-2)}T00:00:00Z`), fotoEntregaPath: 'ferramentas/t1/entrega_1.jpg',
    })]
    abrir()
    const c = screen.getByTestId('emprestimo-ativo')
    expect(c).toHaveTextContent('com Rui Alves')
    expect(c).toHaveTextContent('Obra Norte')
    expect(c).toHaveTextContent('Em atraso')
    expect(within(c).getByAltText('Foto da entrega')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Devolver/ })).toHaveAttribute('href', '/armazem/ferramenta/t1/devolucao')
    expect(screen.queryByRole('link', { name: /Emprestar/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Arquivar/ })).toBeDisabled()
  })

  it('disponível com permissão: Emprestar/Editar; sem permissão: nenhuma ação', () => {
    m.tool = ferr({ id: 't1', name: 'Serra' })
    m.loans = []
    abrir()
    expect(screen.getByRole('link', { name: /Emprestar/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Editar/ })).toHaveAttribute('href', '/armazem/ferramenta/t1/editar')
    cleanup()
    m.pode = false
    abrir()
    expect(screen.queryByRole('link', { name: /Emprestar|Editar/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Arquivar/ })).toBeNull()
  })
})
