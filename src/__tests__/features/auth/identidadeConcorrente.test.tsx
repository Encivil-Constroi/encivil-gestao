import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAsyncCache, useAsync } from '@/app/lib/useAsync'

type Perfil = { role: 'admin' | 'leitura'; nome: string }
type ResultadoPerfil = { data: Perfil | null; error: null }
const m = vi.hoisted(() => ({
  listener: null as null | ((event: AuthChangeEvent, session: Session | null) => Promise<void>),
  getSession: vi.fn<() => Promise<{ data: { session: Session | null } }>>(),
  perfil: vi.fn<(id: string) => Promise<ResultadoPerfil>>(),
  signOut: vi.fn(async () => ({ error: new Error('Failed to fetch') })),
}))
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getSession: m.getSession, signOut: m.signOut,
    onAuthStateChange: (fn: typeof m.listener) => { m.listener = fn; return { data: { subscription: { unsubscribe: vi.fn() } } } },
  },
  from: () => ({ select: () => ({ eq: (_coluna: string, id: string) => ({ single: () => m.perfil(id) }) }) }),
} }))
vi.mock('@/app/lib/sentry', () => ({ captureError: vi.fn(), setSentryUser: vi.fn(), clearSentryUser: vi.fn() }))
import { AuthProvider, useAuth } from '@/features/auth/AuthContext'

function diferido<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}
const sessao = (id: string): Session => ({ user: { id } } as Session)
const perfilA: ResultadoPerfil = { data: { role: 'admin', nome: 'Pessoa A' }, error: null }
const perfilB: ResultadoPerfil = { data: { role: 'leitura', nome: 'Pessoa B' }, error: null }
const montar = () => renderHook(() => useAuth(), { wrapper: AuthProvider })

beforeEach(() => {
  m.getSession.mockReset().mockResolvedValue({ data: { session: sessao('A') } })
  m.perfil.mockReset().mockImplementation(async id => id === 'A' ? perfilA : perfilB)
  m.signOut.mockClear()
})
afterEach(() => { cleanup(); clearAsyncCache() })

describe('perfil pertence à identidade atual', () => {
  it('descarta perfil inicial A concluído depois do login B', async () => {
    const anterior = diferido<ResultadoPerfil>()
    m.perfil.mockImplementation(id => id === 'A' ? anterior.promise : Promise.resolve(perfilB))
    const h = montar()
    await waitFor(() => expect(h.result.current.user?.id).toBe('A'))
    await act(async () => { await m.listener?.('SIGNED_IN', sessao('B')) })
    await act(async () => anterior.resolve(perfilA))
    expect(h.result.current.user?.id).toBe('B')
    expect(h.result.current.profile).toEqual({ role: 'leitura', nome: 'Pessoa B' })
    expect(h.result.current.loading).toBe(false)
  })

  it('retira perfil A enquanto o perfil B ainda está pendente', async () => {
    const h = montar()
    await waitFor(() => expect(h.result.current.profile?.nome).toBe('Pessoa A'))
    const seguinte = diferido<ResultadoPerfil>()
    m.perfil.mockReturnValueOnce(seguinte.promise)
    let login!: Promise<void> | undefined
    act(() => { login = m.listener?.('SIGNED_IN', sessao('B')) })
    expect(h.result.current.user?.id).toBe('B')
    expect(h.result.current.profile).toBeNull()
    await act(async () => { seguinte.resolve(perfilB); await login })
    expect(h.result.current.profile?.nome).toBe('Pessoa B')
  })

  it('não restaura perfil após SIGNED_OUT com refresh em voo', async () => {
    const h = montar()
    await waitFor(() => expect(h.result.current.profile?.nome).toBe('Pessoa A'))
    const anterior = diferido<ResultadoPerfil>()
    m.perfil.mockReturnValueOnce(anterior.promise)
    let refresh!: Promise<void> | undefined
    act(() => { refresh = m.listener?.('TOKEN_REFRESHED', sessao('A')) })
    await act(async () => { await m.listener?.('SIGNED_OUT', null) })
    await act(async () => { anterior.resolve(perfilA); await refresh })
    expect(h.result.current.user).toBeNull()
    expect(h.result.current.profile).toBeNull()
  })

  it('descarta recarregarPerfil da identidade anterior', async () => {
    const h = montar()
    await waitFor(() => expect(h.result.current.profile?.nome).toBe('Pessoa A'))
    const anterior = diferido<ResultadoPerfil>()
    m.perfil.mockReturnValueOnce(anterior.promise)
    let recarregar!: Promise<void>
    act(() => { recarregar = h.result.current.recarregarPerfil() })
    await act(async () => { await m.listener?.('SIGNED_IN', sessao('B')) })
    await act(async () => { anterior.resolve(perfilA); await recarregar })
    expect(h.result.current.user?.id).toBe('B')
    expect(h.result.current.profile?.nome).toBe('Pessoa B')
  })

  it('getSession inicial atrasado não substitui um login mais recente', async () => {
    const anterior = diferido<{ data: { session: Session | null } }>()
    m.getSession.mockReturnValueOnce(anterior.promise)
    const h = montar()
    await act(async () => { await m.listener?.('SIGNED_IN', sessao('B')) })
    await act(async () => anterior.resolve({ data: { session: sessao('A') } }))
    expect(h.result.current.user?.id).toBe('B')
    expect(h.result.current.profile?.nome).toBe('Pessoa B')
    expect(h.result.current.loading).toBe(false)
  })

  it('logout offline descarta perfil pendente e resposta de Obras em voo', async () => {
    const h = montar()
    await waitFor(() => expect(h.result.current.profile?.nome).toBe('Pessoa A'))
    const perfilAnterior = diferido<ResultadoPerfil>()
    m.perfil.mockReturnValueOnce(perfilAnterior.promise)
    let recarregar!: Promise<void>
    act(() => { recarregar = h.result.current.recarregarPerfil() })
    const respostaAnterior = diferido<string>()
    const consulta = vi.fn().mockReturnValueOnce(respostaAnterior.promise).mockImplementation(() => new Promise<string>(() => {}))
    const obra = renderHook(() => useAsync(consulta, [], { cacheKey: 'obra-visao-logout-offline' }))
    await act(async () => { await h.result.current.signOut() })
    await act(async () => {
      respostaAnterior.resolve('dados da sessão anterior')
      perfilAnterior.resolve(perfilA)
      await recarregar
    })
    expect(h.result.current.user).toBeNull()
    expect(obra.result.current.data).toBeNull()
    expect(h.result.current.profile).toBeNull()
    obra.unmount()
    const nova = renderHook(() => useAsync(() => new Promise<string>(() => {}), [], { cacheKey: 'obra-visao-logout-offline' }))
    expect(nova.result.current.data).toBeNull()
  })
})
