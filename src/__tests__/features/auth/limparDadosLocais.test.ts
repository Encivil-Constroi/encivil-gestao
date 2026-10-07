import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useAsync } from '@/app/lib/useAsync'
import { limparDadosLocais, CACHES_COM_DADOS } from '@/features/auth/lib/limparDadosLocais'

// O localStorage/sessionStorage do ambiente de testes não é fiável; um Map chega
function armazenamentoEmMemoria(): Storage {
  const m = new Map<string, string>()
  return {
    get length() { return m.size },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v) },
    removeItem: (k: string) => { m.delete(k) },
    clear: () => m.clear(),
  }
}
vi.stubGlobal('localStorage', armazenamentoEmMemoria())
vi.stubGlobal('sessionStorage', armazenamentoEmMemoria())

describe('limparDadosLocais', () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear() })

  it('apaga os caches do SW com respostas da API e mantém os de assets', async () => {
    const del = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('caches', { delete: del })
    await limparDadosLocais()
    expect(CACHES_COM_DADOS).toContain('supabase-api')
    expect(del.mock.calls.map(c => c[0]).sort()).toEqual([...CACHES_COM_DADOS].sort())
    vi.stubGlobal('caches', undefined)
  })

  it('limpa o sessionStorage e mantém a fila offline e o tema', async () => {
    sessionStorage.setItem('x', '1')
    localStorage.setItem('encivil_pending_movimentos', '[]')
    localStorage.setItem('encivil-theme', 'dark')
    await limparDadosLocais()
    expect(sessionStorage.length).toBe(0)
    expect(localStorage.getItem('encivil_pending_movimentos')).toBe('[]')
    expect(localStorage.getItem('encivil-theme')).toBe('dark')
  })

  it('não rebenta sem Cache Storage (browser antigo / modo privado)', async () => {
    vi.stubGlobal('caches', undefined)
    await expect(limparDadosLocais()).resolves.toBeUndefined()
    vi.stubGlobal('caches', undefined)
  })

  it('esquece o cache em memória do useAsync (o utilizador seguinte não vê dados do anterior)', async () => {
    const a = renderHook(() => useAsync(() => Promise.resolve('dados do utilizador A'), [], { cacheKey: 'seg-teste-a' }))
    await waitFor(() => expect(a.result.current.data).toBe('dados do utilizador A'))
    a.unmount()
    const b1 = renderHook(() => useAsync(() => new Promise<string>(() => {}), [], { cacheKey: 'seg-teste-a' }))
    expect(b1.result.current.data).toBe('dados do utilizador A') // cache servida antes do logout
    b1.unmount()

    await limparDadosLocais()

    const b2 = renderHook(() => useAsync(() => new Promise<string>(() => {}), [], { cacheKey: 'seg-teste-a' }))
    expect(b2.result.current.data).toBeNull()
    b2.unmount()
  })
})
