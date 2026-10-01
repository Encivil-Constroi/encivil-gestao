import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import { ferr, emp } from './ferramentasHelpers'

const m = vi.hoisted(() => ({
  tools: [] as unknown[], loans: [] as unknown[], registar: vi.fn(), devolver: vi.fn(), erro: null as string | null,
}))
vi.mock('@/features/auth/useRole', () => ({ useRole: () => ({ podeFerramentas: true, loading: false, nome: 'Admin' }) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/app/lib/fotosArmazem', () => ({ urlFotoArmazem: (c: string | null) => (c ? `https://f/${c}` : null) }))
vi.mock('@/app/components/FotoInput', () => ({
  FotoInput: (p: { rotulo?: string; onChange: (c: string | null) => void; dono: { prefixo?: string } }) => (
    <button type="button" onClick={() => p.onChange(`ferramentas/x/${p.dono.prefixo}1.jpg`)}>{p.rotulo}</button>
  ),
}))
vi.mock('@/app/components/SignaturePad', () => ({
  SignaturePad: (p: { label: string; onChange: (v: string | null) => void }) => (
    <button type="button" onClick={() => p.onChange('data:sig')}>Assinar: {p.label}</button>
  ),
}))
vi.mock('@/features/obras/hooks/useObras', () => ({
  useObras: () => ({ obras: [{ id: 'ob1', name: 'Obra Norte', status: 'ativa' }, { id: 'ob2', name: 'Obra Velha', status: 'concluida' }] }),
}))
vi.mock('@/features/ferramentas/hooks/useFerramentas', () => ({
  useFerramentas: () => ({ tools: m.tools, loading: false }),
  useFerramenta: (id?: string) => ({ tool: (m.tools as { id: string }[]).find(t => t.id === id), loading: false }),
}))
vi.mock('@/features/ferramentas/hooks/useEmprestimos', () => ({
  useEmprestimos: () => ({ loans: m.loans, loading: false }),
  useRegistarEmprestimo: () => ({ registar: m.registar, loading: false, error: m.erro }),
  useRegistarDevolucao: () => ({ devolver: m.devolver, loading: false, error: null }),
}))

import { EmprestimoPage } from '@/app/pages/armazem/EmprestimoPage'
import { DevolucaoPage } from '@/app/pages/armazem/DevolucaoPage'

const emprestimo = (q = '') => render(
  <MemoryRouter initialEntries={[`/e${q}`]}>
    <Routes><Route path="/e" element={<EmprestimoPage />} /><Route path="*" element={<p>DETALHE</p>} /></Routes>
  </MemoryRouter>)
const devolucao = () => render(
  <MemoryRouter initialEntries={['/armazem/ferramenta/e/devolucao']}>
    <Routes><Route path="/armazem/ferramenta/:id/devolucao" element={<DevolucaoPage />} /><Route path="*" element={<p>DETALHE</p>} /></Routes>
  </MemoryRouter>)

const botao = (n: RegExp | string) => screen.getByRole('button', { name: n })
const confirmar = (n: string) => screen.getByRole('button', { name: n })

beforeEach(() => {
  m.erro = null
  m.registar.mockReset().mockResolvedValue({ toolId: 'd' })
  m.devolver.mockReset().mockResolvedValue({ id: 'l1' })
  m.tools = [
    ferr({ id: 'd', name: 'Berbequim', status: 'disponivel' }),
    ferr({ id: 'e', name: 'Rebarbadora', status: 'emprestada' }),
  ]
  m.loans = [emp({ id: 'l1', toolId: 'e', employeeName: 'Rui Alves', loanDate: new Date('2026-09-20T09:00:00Z'), fotoEntregaPath: 'ferramentas/e/entrega_1.jpg' })]
})
afterEach(cleanup)

describe('empréstimo', () => {
  it('ferramenta em uso aparece desativada com quem e desde quando — impossível escolher', () => {
    emprestimo()
    const emUso = screen.getByRole('radio', { name: /Rebarbadora/ })
    expect(emUso).toBeDisabled()
    expect(emUso).toHaveTextContent('em uso por Rui Alves desde')
    expect(screen.getByRole('radio', { name: /Berbequim/ })).toBeEnabled()
  })

  it('exige a foto: botão desativado sem ela; ao confirmar passa p. o serviço o caminho da foto', async () => {
    emprestimo('?ferramenta=d')
    fireEvent.change(screen.getByLabelText('Nome do funcionário'), { target: { value: 'Maria Costa' } })
    fireEvent.click(botao(/Assinar: Assinatura do funcionário/))
    fireEvent.click(botao(/Assinar: Assinatura de quem entrega/))
    expect(confirmar('Confirmar empréstimo')).toBeDisabled()

    fireEvent.click(botao('Foto do estado na entrega'))
    expect(confirmar('Confirmar empréstimo')).toBeEnabled()
    fireEvent.click(confirmar('Confirmar empréstimo'))
    await waitFor(() => expect(m.registar).toHaveBeenCalledTimes(1))
    expect(m.registar.mock.calls[0][0]).toMatchObject({
      toolId: 'd', employeeName: 'Maria Costa', fotoEntregaPath: 'ferramentas/x/entrega_1.jpg',
      signature: 'data:sig', responsibleSignature: 'data:sig',
    })
    await waitFor(() => expect(screen.getByText('DETALHE')).toBeInTheDocument())
  })

  it('só lista obras ativas e mostra o erro do servidor', () => {
    m.erro = 'Ferramenta "Berbequim" em uso por Rui desde 20/09/2026'
    emprestimo('?ferramenta=d')
    expect(screen.queryByRole('option', { name: 'Obra Velha' })).toBeNull()
    expect(screen.getByRole('option', { name: 'Obra Norte' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('em uso por Rui')
  })

  it('se vier pré-selecionada uma ferramenta em uso, não deixa avançar', () => {
    emprestimo('?ferramenta=e')
    expect(screen.getByRole('alert')).toHaveTextContent('em uso por Rui Alves')
    expect(confirmar('Confirmar empréstimo')).toBeDisabled()
  })
})

describe('devolução', () => {
  it('mostra o empréstimo ativo com a foto da entrega', () => {
    devolucao()
    expect(screen.getByText('Rui Alves')).toBeInTheDocument()
    expect(screen.getByAltText('Foto da entrega')).toHaveAttribute('src', 'https://f/ferramentas/e/entrega_1.jpg')
  })

  it('exige foto da devolução em bom estado e passa o caminho', async () => {
    devolucao()
    fireEvent.click(botao(/Assinar: Assinatura do funcionário/))
    fireEvent.click(botao(/Assinar: Assinatura de quem recebe/))
    expect(confirmar('Confirmar devolução')).toBeDisabled()
    fireEvent.click(botao('Foto do estado na devolução'))
    fireEvent.click(confirmar('Confirmar devolução'))
    await waitFor(() => expect(m.devolver).toHaveBeenCalledTimes(1))
    expect(m.devolver.mock.calls[0][0]).toMatchObject({
      loanId: 'l1', returnCondition: 'bom_estado', fotoDevolucaoPath: 'ferramentas/x/devolucao_1.jpg',
    })
  })

  it('"perdida" dispensa a foto', async () => {
    devolucao()
    fireEvent.change(screen.getByLabelText('Estado na devolução'), { target: { value: 'perdida' } })
    expect(screen.queryByRole('button', { name: 'Foto do estado na devolução' })).toBeNull()
    fireEvent.click(botao(/Assinar: Assinatura do funcionário/))
    fireEvent.click(botao(/Assinar: Assinatura de quem recebe/))
    fireEvent.click(confirmar('Confirmar devolução'))
    await waitFor(() => expect(m.devolver).toHaveBeenCalledTimes(1))
    expect(m.devolver.mock.calls[0][0]).toMatchObject({ returnCondition: 'perdida', fotoDevolucaoPath: null })
  })
})
