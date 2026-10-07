import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'

const m = vi.hoisted(() => ({
  guardar: vi.fn(async () => 'rel-1' as string | null),
  submeter: vi.fn(async () => true as boolean | null),
}))
// O router usa Request nativo, mas jsdom fornece AbortSignal de outro realm.
// Estas rotas não têm loaders; só o sinal de navegação é omitido no adaptador de teste.
const NativeRequest = globalThis.Request
vi.stubGlobal('Request', class extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) { super(input, { ...init, signal: undefined }) }
})
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/features/auth/useRole', () => ({ useRole: () => ({ isAdmin: true, isGestor: false }) }))
vi.mock('@/features/obras/hooks/useRelatoriosDiarios', () => ({
  usePodeRelatarObra: () => true,
  useRelatorioDiario: () => ({ relatorio: null, loading: false, error: null, reload: vi.fn() }),
  useEquipaRelatorio: () => ({ equipa: [] }),
  useSubempreitadasRelatorio: () => ({ subempreitadas: [] }),
  useGuardarRelatorioDiario: () => ({ guardar: m.guardar, loading: false, error: null }),
  useSubmeterRelatorioDiario: () => ({ submeter: m.submeter, loading: false, error: null }),
  useReabrirRelatorioDiario: () => ({ reabrir: vi.fn(), loading: false, error: null }),
}))
vi.mock('@/features/obras/components/FotoCapture', () => ({ FotoCapture: ({ onUploadingChange }: { onUploadingChange?: (v: boolean) => void }) => <button onClick={() => onUploadingChange?.(true)}>Fotos da câmara ou galeria</button> }))

import { RelatorioDiarioPage } from '@/features/obras/components/RelatorioDiarioPage'

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('formulário de relatório diário', () => {
  const montar = () => {
    const router = createMemoryRouter([
      { path: '/obras/:id/relatorio-diario/novo', element: <RelatorioDiarioPage /> },
      { path: '/obras/relatorio-diario/:rid', element: <p>Rascunho criado</p> },
      { path: '/obras/:id', element: <p>Ficha da obra</p> },
    ], { initialEntries: ['/obras/obra-1/relatorio-diario/novo'] })
    render(<RouterProvider router={router} />)
    return router
  }
  it('não abandona upload iniciado depois de começar a guardar um rascunho novo', async () => {
    let concluir!: (value: string) => void
    m.guardar.mockReturnValueOnce(new Promise(resolve => { concluir = resolve }))
    const router = montar()
    fireEvent.change(screen.getByLabelText('Trabalhos realizados'), { target: { value: 'Aferição' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar rascunho' }))
    await waitFor(() => expect(m.guardar).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Fotos da câmara ou galeria' }))
    await act(async () => concluir('rel-1'))
    expect(router.state.location.pathname).toBe('/obras/obra-1/relatorio-diario/novo')
    expect(screen.getByRole('button', { name: 'Submeter relatório' })).toBeDisabled()
  })
  it('congela edição e cancelamento enquanto guarda para sair', async () => {
    let concluir!: (value: string) => void
    m.guardar.mockReturnValueOnce(new Promise(resolve => { concluir = resolve }))
    montar()
    fireEvent.change(screen.getByLabelText('Trabalhos realizados'), { target: { value: 'Texto mais recente' } })
    fireEvent.click(screen.getByRole('link', { name: 'Ver obra' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar e sair' }))
    await waitFor(() => expect(m.guardar).toHaveBeenCalled())
    expect(screen.getByLabelText('Trabalhos realizados')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Continuar a editar' })).toBeDisabled()
    await act(async () => concluir('rel-1'))
    expect(await screen.findByText('Ficha da obra')).toBeInTheDocument()
  })
  it('protege alteração ainda não guardada ao voltar à obra', async () => {
    montar()
    fireEvent.change(screen.getByLabelText('Trabalhos realizados'), { target: { value: 'Alteração recente' } })
    fireEvent.click(screen.getByRole('link', { name: 'Ver obra' }))
    expect(await screen.findByRole('button', { name: 'Guardar e sair' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar e sair' }))
    expect(await screen.findByText('Ficha da obra')).toBeInTheDocument()
    expect(m.guardar).toHaveBeenCalledWith(null, 'obra-1', expect.objectContaining({ trabalhos: 'Alteração recente' }))
  })
  it('bloqueia submissão enquanto fotos estão a enviar', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Fotos da câmara ou galeria' }))
    expect(screen.getByRole('button', { name: 'Submeter relatório' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Guardar rascunho' })).toBeDisabled()
  })
  it('congela edição durante submissão para não perder alterações', async () => {
    let concluir!: (value: boolean) => void
    m.submeter.mockReturnValueOnce(new Promise(resolve => { concluir = resolve }))
    montar()
    fireEvent.change(screen.getByLabelText('Clima'), { target: { value: 'SOL' } })
    fireEvent.change(screen.getByLabelText('Trabalhos realizados'), { target: { value: 'Betonagem' } })
    fireEvent.change(screen.getByLabelText('Outros presentes'), { target: { value: 'Equipa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submeter relatório' }))
    await waitFor(() => expect(m.submeter).toHaveBeenCalled())
    expect(screen.getByLabelText('Trabalhos realizados')).toBeDisabled()
    await act(async () => concluir(true))
  })
  it('guarda automaticamente após alteração sem criar um rascunho vazio', async () => {
    montar()
    expect(m.guardar).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Trabalhos realizados'), { target: { value: 'Preparação da laje' } })
    await waitFor(() => expect(m.guardar).toHaveBeenCalledWith(null, 'obra-1', expect.objectContaining({ trabalhos: 'Preparação da laje' })), { timeout: 2500 })
    expect(await screen.findByText('Rascunho criado')).toBeInTheDocument()
  })

  it('mostra campo de ocorrência só quando necessário e exige prova antes de submeter', () => {
    montar()
    expect(screen.queryByLabelText('Descreva as ocorrências')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Houve ocorrências'))
    expect(screen.getByLabelText('Descreva as ocorrências')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Clima'), { target: { value: 'SOL' } })
    fireEvent.change(screen.getByLabelText('Trabalhos realizados'), { target: { value: 'Betonagem' } })
    fireEvent.change(screen.getByLabelText('Outros presentes'), { target: { value: 'João' } })
    fireEvent.change(screen.getByLabelText('Descreva as ocorrências'), { target: { value: 'Atraso no fornecimento' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submeter relatório' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/pelo menos uma foto/i)
    expect(m.submeter).not.toHaveBeenCalled()
  })
})
