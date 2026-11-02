import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u' } }) }))
vi.mock('@/features/auth/useRole', () => ({ useRole: () => ({ isGestor: false, isAdmin: false }) }))
vi.mock('@/features/obras/hooks/useObras', () => ({ useObras: () => ({ obras: [] }) }))
vi.mock('@/features/colaboradores/hooks/useColaboradores', () => ({ useColaboradores: () => ({ colaboradores: [] }) }))
vi.mock('@/features/picagens/hooks/useColaboradorAtual', () => ({
  useColaboradorAtual: () => ({ colaboradorAtual: null, loading: false }),
}))
vi.mock('@/features/picagens/hooks/usePicagensDia', () => ({
  usePicagensDia: () => ({ picagens: [], pendentes: [], reload: vi.fn() }),
}))
vi.mock('@/features/picagens/hooks/usePicar', () => ({ usePicar: () => ({ picar: vi.fn(), loading: false }) }))

import { PicagemPage } from '@/features/picagens/components/PicagemPage'

afterEach(cleanup)

describe('PicagemPage sem colaborador nem obra', () => {
  it('explica o que falta e o botão desativado não usa opacity-40', () => {
    render(<MemoryRouter><PicagemPage /></MemoryRouter>)
    expect(screen.getByText('Escolha o colaborador e a obra para picar.')).toBeInTheDocument()
    const botao = screen.getByRole('button', { name: /Entrada/ })
    expect(botao).toBeDisabled()
    expect(botao.className).not.toContain('disabled:opacity-40')
    expect(botao.className).toContain('disabled:bg-muted')
  })
})
