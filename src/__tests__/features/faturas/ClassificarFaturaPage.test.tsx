import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

const m = vi.hoisted(() => ({
  buscar: vi.fn(),
  lancar: vi.fn(async (_id: string, _r: string) => undefined),
  classificar: vi.fn(async (_id: string, _l: unknown[]) => undefined),
  getUser: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { error: m.toastError, success: m.toastSuccess } }))
vi.mock('react-router', () => ({
  useParams: () => ({ id: 'f1' }),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
vi.mock('@/features/faturas/services/faturasService', () => ({
  buscarFatura: m.buscar,
  lancarFatura: m.lancar,
  classificarFatura: m.classificar,
}))
vi.mock('@/features/faturas/components/DadosFiscaisForm', () => ({ DadosFiscaisForm: () => null }))
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: m.getUser },
    from: () => ({
      select: () => ({ eq: () => ({ order: async () => ({ data: [{ id: 'p1', nome: 'Cimento', codigo: 'C1' }], error: null }) }) }),
    }),
  },
}))

import { ClassificarFaturaPage } from '@/features/faturas/components/ClassificarFaturaPage'

function faturaCom(linhas: Array<Record<string, unknown>>) {
  return { id: 'f1', fornecedor: 'Cimpor', estado: 'CLASSIFICADA', linhas }
}
const linhaOk = { id: 'l1', descricao: 'Cimento', destino: 'ARMAZEM', artigoId: 'p1', confianca: 0.9, lancado: false }

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('confirm', () => true)
  m.getUser.mockImplementation(() => new Promise(r => setTimeout(() => r({ data: { user: { email: 'a@b.pt' } } }), 30)))
  m.lancar.mockResolvedValue(undefined)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('ClassificarFaturaPage', () => {
  it('dois cliques seguidos em Lançar chamam lancar_fatura uma só vez', async () => {
    m.buscar.mockResolvedValue(faturaCom([linhaOk]))
    render(<ClassificarFaturaPage />)
    const btn = await screen.findByRole('button', { name: /Lançar em Stock/ })
    await waitFor(() => expect(btn).not.toBeDisabled())
    fireEvent.click(btn)
    fireEvent.click(btn)
    await waitFor(() => expect(m.lancar).toHaveBeenCalledTimes(1))
    await new Promise(r => setTimeout(r, 80))
    expect(m.lancar).toHaveBeenCalledTimes(1)
  })

  it('erro ao lançar fica visível no ecrã', async () => {
    m.buscar.mockResolvedValue(faturaCom([linhaOk]))
    m.lancar.mockRejectedValue(new Error('Fatura já lançada'))
    render(<ClassificarFaturaPage />)
    const btn = await screen.findByRole('button', { name: /Lançar em Stock/ })
    fireEvent.click(btn)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('Lançar fica desativado com linhas ARMAZEM sem artigo', async () => {
    m.buscar.mockResolvedValue(faturaCom([{ ...linhaOk, artigoId: undefined }]))
    render(<ClassificarFaturaPage />)
    const btn = await screen.findByRole('button', { name: /Lançar em Stock/ })
    expect(btn).toBeDisabled()
  })

  it('Lançar fica desativado com alterações por guardar', async () => {
    m.buscar.mockResolvedValue(faturaCom([linhaOk]))
    render(<ClassificarFaturaPage />)
    const btn = await screen.findByRole('button', { name: /Lançar em Stock/ })
    await waitFor(() => expect(btn).not.toBeDisabled())
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[0], { target: { value: 'OBRA' } })
    expect(btn).toBeDisabled()
  })
})
