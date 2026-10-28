import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const m = vi.hoisted(() => ({
  chamadas: 0,
  erros: [] as unknown[],
  avisos: vi.fn(),
  falhas: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: m.falhas, warning: m.avisos } }))
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u' } }) }))
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'u' } } } }) } },
}))
vi.mock('@/features/movimentos/services/armazemService', () => ({
  registarMovimentoArmazem: () => {
    m.chamadas++
    const e = m.erros.shift()
    return e === undefined ? Promise.resolve() : Promise.reject(e)
  },
}))
vi.mock('@/features/movimentos/services/movimentosService', () => ({ registarMovimento: () => Promise.resolve() }))

import { useOfflineQueue } from '@/features/movimentos/hooks/useOfflineQueue'
import { enqueuePendingMovimento, getQueue } from '@/features/movimentos/offlineQueue'

const memoria = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memoria.get(k) ?? null,
  setItem: (k: string, v: string) => { memoria.set(k, v) },
  removeItem: (k: string) => { memoria.delete(k) },
  clear: () => memoria.clear(),
})

const entrada = { produtoId: 'p1', subtipo: 'COMPRA' as const, quantidade: 5, responsavel: 'Rui', fornecedor: 'ENCIVIL', precoUnitario: 3 }

async function sincronizar() {
  const { result, unmount } = renderHook(() => useOfflineQueue())
  await act(async () => { await result.current.flushNow() })
  unmount()
}

beforeEach(() => { m.chamadas = 0; m.erros = []; m.avisos.mockClear(); m.falhas.mockClear(); localStorage.clear() })

describe('fila de movimentos: erros transitórios não apagam registos', () => {
  it('5xx do Cloudflare ("error code: 522") mantém o movimento, conta a tentativa e pára o ciclo', async () => {
    enqueuePendingMovimento(entrada, 'u')
    enqueuePendingMovimento({ ...entrada, quantidade: 7 }, 'u')
    m.erros = [{ message: 'error code: 522' }]
    await sincronizar()
    expect(m.chamadas).toBe(1)
    expect(getQueue()).toHaveLength(2)
    expect(getQueue()[0]).toMatchObject({ quantidade: 5, tentativas: 1 })
    expect(m.falhas).not.toHaveBeenCalled()
  })

  it('erro de negócio (P0001) remove o movimento e avisa', async () => {
    enqueuePendingMovimento(entrada, 'u')
    m.erros = [{ code: 'P0001', message: 'Stock insuficiente' }]
    await sincronizar()
    expect(getQueue()).toHaveLength(0)
    expect(m.falhas).toHaveBeenCalledTimes(1)
  })

  it('falha de rede (objeto do supabase-js) mantém o movimento', async () => {
    enqueuePendingMovimento(entrada, 'u')
    m.erros = [{ message: 'TypeError: Failed to fetch', code: '' }]
    await sincronizar()
    expect(getQueue()).toHaveLength(1)
    expect(m.falhas).not.toHaveBeenCalled()
  })

  it('à 5.ª tentativa falhada avisa, mas nunca apaga', async () => {
    enqueuePendingMovimento(entrada, 'u')
    for (let i = 0; i < 6; i++) {
      m.erros = [{ code: '57014', message: 'canceling statement due to statement timeout' }]
      await sincronizar()
    }
    expect(getQueue()).toHaveLength(1)
    expect(getQueue()[0].tentativas).toBe(6)
    expect(m.avisos).toHaveBeenCalledTimes(2)
  })

  it('depois de uma falha transitória, o envio seguinte tem êxito e esvazia a fila', async () => {
    enqueuePendingMovimento(entrada, 'u')
    m.erros = [{ message: '<html>503 Service Unavailable</html>' }]
    await sincronizar()
    await sincronizar()
    expect(getQueue()).toHaveLength(0)
    expect(m.chamadas).toBe(2)
  })
})
