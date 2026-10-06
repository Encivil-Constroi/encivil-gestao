import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const m = vi.hoisted(() => ({
  chamadas: 0,
  sessaoId: 'u',
  utilizador: { id: 'u' } as { id: string } | null,
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: m.utilizador }) }))
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: m.sessaoId } } } }) } },
}))
vi.mock('@/features/picagens/services/picagensService', () => ({
  registarPicagemOffline: () => { m.chamadas++; return Promise.resolve({}) },
}))

import { usePicagensOfflineQueue } from '@/features/picagens/hooks/usePicagensOfflineQueue'
import { enqueuePendingPicagem, getQueue } from '@/features/picagens/offlineQueue'

// O localStorage do ambiente de testes não é fiável; um Map chega
const memoria = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memoria.get(k) ?? null,
  setItem: (k: string, v: string) => { memoria.set(k, v) },
  removeItem: (k: string) => { memoria.delete(k) },
  clear: () => memoria.clear(),
})

const picagem = { colaboradorId: 'c1', obraId: 'o1', tipo: 'ENTRADA' as const, timestampDispositivo: '2026-10-06T08:00:00Z', origem: 'OFFLINE' as const }

beforeEach(() => { m.chamadas = 0; m.sessaoId = 'u'; m.utilizador = { id: 'u' }; localStorage.clear() })

describe('sincronização de picagens por utilizador', () => {
  it('picagens de outro utilizador não são enviadas com a sessão atual (telemóvel partilhado)', async () => {
    enqueuePendingPicagem(picagem, 'user-a')
    const { result } = renderHook(() => usePicagensOfflineQueue())
    await act(async () => { await result.current.flushNow() })
    expect(m.chamadas).toBe(0)
    expect(getQueue()).toHaveLength(1)
    expect(result.current.pendingCount).toBe(0)
    expect(result.current.deOutros).toBe(1)
  })

  it('o dono envia as suas picagens', async () => {
    enqueuePendingPicagem(picagem, 'u')
    const { result } = renderHook(() => usePicagensOfflineQueue())
    await act(async () => { await result.current.flushNow() })
    expect(m.chamadas).toBe(1)
    expect(getQueue()).toHaveLength(0)
  })

  it('não envia se a sessão real já não for a do dono', async () => {
    enqueuePendingPicagem(picagem, 'u')
    m.sessaoId = 'user-b'
    const { result } = renderHook(() => usePicagensOfflineQueue())
    await act(async () => { await result.current.flushNow() })
    expect(m.chamadas).toBe(0)
    expect(getQueue()).toHaveLength(1)
  })
})
