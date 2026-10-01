import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'

const m = vi.hoisted(() => ({
  guardar: vi.fn(async () => 'rel-1' as string | null),
  submeter: vi.fn(async () => true as boolean | null),
}))
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
vi.mock('@/features/obras/components/FotoCapture', () => ({ FotoCapture: () => <div>Fotos da câmara ou galeria</div> }))

import { RelatorioDiarioPage } from '@/features/obras/components/RelatorioDiarioPage'

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('formulário de relatório diário', () => {
  it('guarda automaticamente após alteração sem criar um rascunho vazio', async () => {
    render(<MemoryRouter initialEntries={['/obras/obra-1/relatorio-diario/novo']}><Routes><Route path="/obras/:id/relatorio-diario/novo" element={<RelatorioDiarioPage />} /><Route path="/obras/relatorio-diario/:rid" element={<p>Rascunho criado</p>} /></Routes></MemoryRouter>)
    expect(m.guardar).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Trabalhos realizados'), { target: { value: 'Preparação da laje' } })
    await waitFor(() => expect(m.guardar).toHaveBeenCalledWith(null, 'obra-1', expect.objectContaining({ trabalhos: 'Preparação da laje' })), { timeout: 2500 })
    expect(await screen.findByText('Rascunho criado')).toBeInTheDocument()
  })

  it('mostra campo de ocorrência só quando necessário e exige prova antes de submeter', () => {
    render(<MemoryRouter initialEntries={['/obras/obra-1/relatorio-diario/novo']}><Routes><Route path="/obras/:id/relatorio-diario/novo" element={<RelatorioDiarioPage />} /></Routes></MemoryRouter>)
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
