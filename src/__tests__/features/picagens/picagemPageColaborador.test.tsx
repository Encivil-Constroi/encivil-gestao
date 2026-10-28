import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const m = vi.hoisted(() => ({
  picar: vi.fn(),
  colaboradorAtual: null as { id: string; nome: string } | null,
  diaPedido: [] as (string | undefined)[],
}))

vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-b' } }) }))
vi.mock('@/features/auth/useRole', () => ({ useRole: () => ({ isGestor: true, isAdmin: false }) }))
vi.mock('@/features/obras/hooks/useObras', () => ({ useObras: () => ({ obras: [{ id: 'o1', name: 'Obra 1', geofenceTipo: null }] }) }))
vi.mock('@/features/colaboradores/hooks/useColaboradores', () => ({
  useColaboradores: () => ({ colaboradores: [{ id: 'X', nome: 'Ana', numeroMecan: '1' }, { id: 'Y', nome: 'Bruno', numeroMecan: '2' }] }),
}))
vi.mock('@/features/picagens/hooks/useColaboradorAtual', () => ({
  useColaboradorAtual: () => ({ colaboradorAtual: m.colaboradorAtual, loading: false }),
}))
vi.mock('@/features/picagens/hooks/usePicagensDia', () => ({
  usePicagensDia: (colaboradorId: string | undefined) => { m.diaPedido.push(colaboradorId); return { picagens: [], pendentes: [], reload: vi.fn() } },
}))
vi.mock('@/features/picagens/hooks/usePicar', () => ({ usePicar: () => ({ picar: m.picar, loading: false }) }))

import { PicagemPage } from '@/features/picagens/components/PicagemPage'

const memoria = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memoria.get(k) ?? null,
  setItem: (k: string, v: string) => { memoria.set(k, v) },
  removeItem: (k: string) => { memoria.delete(k) },
  clear: () => memoria.clear(),
})

beforeEach(() => {
  localStorage.clear()
  m.picar.mockReset().mockResolvedValue({ picagem: null, queued: false, resultado: 'PENDENTE_VALIDACAO' })
  m.colaboradorAtual = null
  m.diaPedido = []
})
afterEach(cleanup)

describe('PicagemPage: colaborador após troca de utilizador no mesmo telemóvel', () => {
  it('com conta própria (Y) e enc_pic_colab do utilizador anterior (X), pica em nome de Y', async () => {
    localStorage.setItem('enc_pic_colab', 'X')
    localStorage.setItem('enc_pic_obra', 'o1')
    m.colaboradorAtual = { id: 'Y', nome: 'Bruno' }
    render(<MemoryRouter><PicagemPage /></MemoryRouter>)
    expect(screen.getByText('Bruno')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Entrada/ }))
    await waitFor(() => expect(m.picar).toHaveBeenCalledTimes(1))
    expect(m.picar.mock.calls[0][0]).toMatchObject({ colaboradorId: 'Y', obraId: 'o1' })
    expect(m.diaPedido.at(-1)).toBe('Y')
  })

  it('sem ficha própria continua a usar o colaborador escolhido', async () => {
    localStorage.setItem('enc_pic_colab', 'X')
    localStorage.setItem('enc_pic_obra', 'o1')
    render(<MemoryRouter><PicagemPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /Entrada/ }))
    await waitFor(() => expect(m.picar).toHaveBeenCalledTimes(1))
    expect(m.picar.mock.calls[0][0]).toMatchObject({ colaboradorId: 'X' })
  })
})
