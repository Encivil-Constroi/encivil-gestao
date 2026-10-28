import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const m = vi.hoisted(() => ({ invalidar: vi.fn() }))

vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u' } }) }))
vi.mock('@/app/lib/useAsync', async importOriginal => ({
  ...(await importOriginal<typeof import('@/app/lib/useAsync')>()),
  invalidateCache: m.invalidar,
}))
vi.mock('@/features/picagens/services/picagensService', () => ({
  registarPicagem: () => Promise.resolve({ resultado: 'PENDENTE_VALIDACAO' }),
  registarPicagemGeofence: vi.fn(),
  validarPicagem: vi.fn(),
  corrigirHoraPicagem: vi.fn(),
}))

import { usePicar } from '@/features/picagens/hooks/usePicar'

beforeEach(() => m.invalidar.mockClear())

describe('usePicar: dia de Lisboa', () => {
  it('às 23:30Z de julho (00:30 em Lisboa) invalida as listas do dia seguinte', async () => {
    const { result } = renderHook(() => usePicar())
    await act(async () => {
      await result.current.picar({ colaboradorId: 'c1', obraId: 'o1', tipo: 'ENTRADA', timestampDispositivo: '2026-07-15T23:30:00.000Z' })
    })
    expect(m.invalidar).toHaveBeenCalledWith('picagens-dia-c1-2026-07-16', 'picagens-obra-o1-2026-07-16')
  })
})
