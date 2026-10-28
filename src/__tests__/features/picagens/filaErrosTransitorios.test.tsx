import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const m = vi.hoisted(() => ({
  chamadas: 0,
  erros: [] as unknown[],
  atraso: 0,
  sessaoFalha: false,
  avisos: vi.fn(),
  falhas: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: m.falhas, warning: m.avisos } }))
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u' } }) }))
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: () => {
        if (m.sessaoFalha) { m.sessaoFalha = false; return Promise.reject(new Error('Lock timeout')) }
        return Promise.resolve({ data: { session: { user: { id: 'u' } } } })
      },
    },
  },
}))
vi.mock('@/features/picagens/services/picagensService', () => ({
  registarPicagemOffline: () => {
    m.chamadas++
    const e = m.erros.shift()
    const fim = () => (e === undefined ? Promise.resolve({}) : Promise.reject(e))
    return m.atraso ? new Promise(r => setTimeout(r, m.atraso)).then(fim) : fim()
  },
}))

import { usePicagensOfflineQueue } from '@/features/picagens/hooks/usePicagensOfflineQueue'
import { enqueuePendingPicagem, getQueue } from '@/features/picagens/offlineQueue'

const memoria = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memoria.get(k) ?? null,
  setItem: (k: string, v: string) => { memoria.set(k, v) },
  removeItem: (k: string) => { memoria.delete(k) },
  clear: () => memoria.clear(),
})

const picagem = { colaboradorId: 'c1', obraId: 'o1', tipo: 'ENTRADA' as const, timestampDispositivo: '2026-10-06T08:00:00Z', origem: 'OFFLINE' as const }

async function sincronizar() {
  const { result, unmount } = renderHook(() => usePicagensOfflineQueue())
  await act(async () => { await result.current.flushNow() })
  unmount()
}

beforeEach(() => {
  m.chamadas = 0; m.erros = []; m.atraso = 0; m.sessaoFalha = false
  m.avisos.mockClear(); m.falhas.mockClear(); localStorage.clear()
})

describe('fila de picagens: nunca perder nem duplicar', () => {
  it('falha de rede vinda do supabase-js (objeto, não Error) mantém a picagem', async () => {
    enqueuePendingPicagem(picagem, 'u')
    m.erros = [{ message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' }]
    await sincronizar()
    expect(getQueue()).toHaveLength(1)
    expect(m.falhas).not.toHaveBeenCalled()
  })

  it('statement timeout (57014) mantém a picagem, conta a tentativa e pára o ciclo', async () => {
    enqueuePendingPicagem(picagem, 'u')
    enqueuePendingPicagem({ ...picagem, tipo: 'SAIDA' }, 'u')
    m.erros = [{ code: '57014', message: 'canceling statement due to statement timeout' }]
    await sincronizar()
    expect(m.chamadas).toBe(1)
    expect(getQueue()).toHaveLength(2)
    expect(getQueue()[0]).toMatchObject({ tipo: 'ENTRADA', tentativas: 1 })
  })

  it('erro definitivo (42501, RLS) remove a picagem e avisa', async () => {
    enqueuePendingPicagem(picagem, 'u')
    m.erros = [{ code: '42501', message: 'new row violates row-level security policy' }]
    await sincronizar()
    expect(getQueue()).toHaveLength(0)
    expect(m.falhas).toHaveBeenCalledTimes(1)
  })

  it('à 5.ª tentativa falhada avisa, mas nunca apaga', async () => {
    enqueuePendingPicagem(picagem, 'u')
    for (let i = 0; i < 5; i++) {
      m.erros = [{ message: 'error code: 502' }]
      await sincronizar()
    }
    expect(getQueue()).toHaveLength(1)
    expect(getQueue()[0].tentativas).toBe(5)
    expect(m.avisos).toHaveBeenCalledTimes(1)
  })

  it('dois separadores a sincronizar ao mesmo tempo enviam cada picagem uma só vez', async () => {
    let cadeia: Promise<unknown> = Promise.resolve()
    const pedidos: string[] = []
    const locks = {
      request: (nome: string, fn: () => Promise<unknown>) => {
        pedidos.push(nome)
        const r = cadeia.then(() => fn())
        cadeia = r.catch(() => undefined)
        return r
      },
    }
    Object.defineProperty(navigator, 'locks', { configurable: true, value: locks })
    try {
      enqueuePendingPicagem(picagem, 'u')
      enqueuePendingPicagem({ ...picagem, tipo: 'SAIDA' }, 'u')
      m.atraso = 5
      const a = renderHook(() => usePicagensOfflineQueue())
      const b = renderHook(() => usePicagensOfflineQueue())
      await act(async () => { await Promise.all([a.result.current.flushNow(), b.result.current.flushNow()]) })
      await waitFor(() => expect(getQueue()).toHaveLength(0))
      await act(async () => { await cadeia })
      expect(m.chamadas).toBe(2)
      expect(pedidos.length).toBeGreaterThan(0)
      expect(pedidos.every(n => n === 'encivil-picagens')).toBe(true)
      a.unmount(); b.unmount()
    } finally {
      Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
    }
  })

  it('se obter a sessão falhar, a guarda é reposta e a sincronização seguinte funciona', async () => {
    enqueuePendingPicagem(picagem, 'u')
    m.sessaoFalha = true
    const { result, unmount } = renderHook(() => usePicagensOfflineQueue())
    await act(async () => { await result.current.flushNow().catch(() => undefined) })
    expect(m.chamadas).toBe(0)
    await act(async () => { await result.current.flushNow() })
    expect(m.chamadas).toBe(1)
    expect(getQueue()).toHaveLength(0)
    unmount()
  })
})
