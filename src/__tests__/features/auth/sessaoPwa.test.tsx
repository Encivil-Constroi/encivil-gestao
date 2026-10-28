import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'

type ResultadoPerfil = { data: { role: string; nome: string } | null; error: null | { message: string; code: string } }
const m = vi.hoisted(() => ({
  ouvinte: null as null | ((evento: string, sessao: unknown) => Promise<void>),
  signOut: vi.fn(),
  perfil: vi.fn<() => Promise<ResultadoPerfil>>(),
  setSentryUser: vi.fn(),
  info: vi.fn(),
  removerPush: vi.fn<() => Promise<void>>(),
}))

vi.mock('@/app/lib/push', () => ({ removerSubscricaoDoDispositivo: m.removerPush }))
vi.mock('sonner', () => ({ toast: { info: m.info } }))
vi.mock('@/app/lib/sentry', () => ({ setSentryUser: m.setSentryUser, clearSentryUser: vi.fn(), captureError: vi.fn() }))
vi.mock('@/features/auth/services/eventosSegurancaService', () => ({ registarEvento: vi.fn() }))
vi.mock('@/features/auth/lib/limparDadosLocais', () => ({ limparDadosLocais: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: (cb: (evento: string, sessao: unknown) => Promise<void>) => {
        // O callback do AuthContext não espera pelo perfil; o ouvinte de teste espera pelas microtarefas
        m.ouvinte = async (e, s) => { await cb(e, s); for (let i = 0; i < 10; i++) await Promise.resolve() }
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      },
      signOut: m.signOut,
      signInWithPassword: async () => { await m.ouvinte?.('SIGNED_IN', { access_token: 't', user: { id: 'A', email: 'A@encivil.pt' } }); return { error: null } },
    },
    rpc: vi.fn(),
    from: () => ({ select: () => ({ eq: () => ({ single: () => m.perfil() }) }) }),
  },
}))

import { AuthProvider, useAuth } from '@/features/auth/AuthContext'

function armazenamentoEmMemoria(): Storage {
  const d = new Map<string, string>()
  return {
    get length() { return d.size },
    key: (i: number) => [...d.keys()][i] ?? null,
    getItem: (k: string) => d.get(k) ?? null,
    setItem: (k: string, v: string) => { d.set(k, v) },
    removeItem: (k: string) => { d.delete(k) },
    clear: () => d.clear(),
  }
}
vi.stubGlobal('localStorage', armazenamentoEmMemoria())

function Estado() {
  const { session, profile, loading } = useAuth()
  return <span>{`${session ? 'com sessão' : 'sem sessão'}|${profile?.nome ?? '-'}|${loading ? 'a carregar' : 'pronto'}`}</span>
}
const sessao = (id: string) => ({ access_token: 't', user: { id, email: `${id}@encivil.pt` } })
const perfilOk: ResultadoPerfil = { data: { role: 'admin', nome: 'Ana' }, error: null }
const MIN = 60 * 1000
const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve() }) }

beforeEach(() => {
  localStorage.clear()
  m.signOut.mockReset().mockResolvedValue({ error: null })
  m.perfil.mockReset().mockResolvedValue(perfilOk)
  m.setSentryUser.mockReset()
  m.info.mockReset()
  m.removerPush.mockReset().mockResolvedValue(undefined)
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.stubGlobal('caches', undefined) })

describe('inatividade partilhada entre separadores', () => {
  it('atividade noutro separador (evento storage) adia o logout; sem atividade sai só neste dispositivo', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    render(<AuthProvider><Estado /></AuthProvider>)
    await flush()
    await act(async () => { await m.ouvinte?.('SIGNED_IN', sessao('A')) })
    await flush()

    await act(async () => { vi.advanceTimersByTime(29 * MIN) })
    // Outro separador mexeu-se agora
    const agora = String(Date.now())
    localStorage.setItem('encivil-ultima-atividade', agora)
    window.dispatchEvent(new StorageEvent('storage', { key: 'encivil-ultima-atividade', newValue: agora }))
    await act(async () => { vi.advanceTimersByTime(2 * MIN) })
    expect(m.signOut).not.toHaveBeenCalled()

    await act(async () => { vi.advanceTimersByTime(29 * MIN) })
    await flush()
    expect(m.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(m.info).toHaveBeenCalled()
  })

  it('a atividade neste separador fica gravada para os outros', async () => {
    render(<AuthProvider><Estado /></AuthProvider>)
    await flush()
    await act(async () => { await m.ouvinte?.('SIGNED_IN', sessao('A')) })
    expect(Number(localStorage.getItem('encivil-ultima-atividade'))).toBeGreaterThan(0)
  })
})

describe('perfil e identidade', () => {
  it('falha de rede no perfil: tenta de novo antes de baixar o loading', async () => {
    m.perfil
      .mockResolvedValueOnce({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } })
      .mockResolvedValueOnce(perfilOk)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    render(<AuthProvider><Estado /></AuthProvider>)
    await flush()
    let login!: Promise<void> | undefined
    act(() => { login = m.ouvinte?.('SIGNED_IN', sessao('A')) })
    await flush()
    expect(screen.getByText('com sessão|-|a carregar')).toBeTruthy()
    await act(async () => { vi.advanceTimersByTime(5000); await login })
    expect(m.perfil).toHaveBeenCalledTimes(2)
    expect(screen.getByText('com sessão|Ana|pronto')).toBeTruthy()
  })

  it('perfil inexistente (não é rede) não repete', async () => {
    m.perfil.mockResolvedValue({ data: null, error: { message: 'no rows', code: 'PGRST116' } })
    render(<AuthProvider><Estado /></AuthProvider>)
    await flush()
    await act(async () => { await m.ouvinte?.('SIGNED_IN', sessao('A')) })
    expect(m.perfil).toHaveBeenCalledTimes(1)
    expect(screen.getByText('com sessão|-|pronto')).toBeTruthy()
  })

  it('mudança de identidade apaga o cache supabase-api do SW e o Sentry só recebe o id', async () => {
    const del = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('caches', { delete: del })
    render(<AuthProvider><Estado /></AuthProvider>)
    await flush()
    await act(async () => { await m.ouvinte?.('SIGNED_IN', sessao('A')) })
    expect(del).toHaveBeenCalledWith('supabase-api')
    expect(m.setSentryUser).toHaveBeenCalledWith('A')
    del.mockClear()
    await act(async () => { await m.ouvinte?.('TOKEN_REFRESHED', sessao('A')) })
    expect(del).not.toHaveBeenCalled()
  })

  it.each(['TOKEN_REFRESHED', 'SIGNED_IN'])('%s da mesma identidade com rede em baixo mantém o perfil anterior', async evento => {
    render(<AuthProvider><Estado /></AuthProvider>)
    await flush()
    await act(async () => { await m.ouvinte?.('SIGNED_IN', sessao('A')) })
    expect(screen.getByText('com sessão|Ana|pronto')).toBeTruthy()
    const falhaRede: ResultadoPerfil = { data: null, error: { message: 'TypeError: Failed to fetch', code: '' } }
    m.perfil.mockResolvedValue(falhaRede)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let ev!: Promise<void> | undefined
    act(() => { ev = m.ouvinte?.(evento, sessao('A')) })
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); await ev })
    expect(screen.getByText('com sessão|Ana|pronto')).toBeTruthy()
  })

  it('mesma identidade: perfil inexistente (não é rede) continua a limpar o perfil', async () => {
    render(<AuthProvider><Estado /></AuthProvider>)
    await flush()
    await act(async () => { await m.ouvinte?.('SIGNED_IN', sessao('A')) })
    m.perfil.mockResolvedValue({ data: null, error: { message: 'no rows', code: 'PGRST116' } })
    await act(async () => { await m.ouvinte?.('TOKEN_REFRESHED', sessao('A')) })
    expect(screen.getByText('com sessão|-|pronto')).toBeTruthy()
  })
})

describe('reabrir um telemóvel partilhado horas depois', () => {
  it('sessão guardada e última atividade há mais de 30 min: sai (só neste dispositivo) em vez de contar como atividade', async () => {
    localStorage.setItem('encivil-ultima-atividade', String(Date.now() - 3 * 60 * MIN))
    render(<AuthProvider><Estado /></AuthProvider>)
    await flush()
    await act(async () => { await m.ouvinte?.('SIGNED_IN', sessao('A')) })
    await flush()
    expect(m.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(screen.getByText(/^sem sessão/)).toBeTruthy()
  })

  it('login feito agora neste separador com marca antiga de outra pessoa: não sai', async () => {
    localStorage.setItem('encivil-ultima-atividade', String(Date.now() - 3 * 60 * MIN))
    let entrar!: (email: string, password: string) => Promise<unknown>
    function Login() { entrar = useAuth().signIn; return null }
    render(<AuthProvider><Estado /><Login /></AuthProvider>)
    await flush()
    await act(async () => { await entrar('a@b.pt', 'x') })
    await flush()
    expect(m.signOut).not.toHaveBeenCalled()
    expect(screen.getByText(/^com sessão/)).toBeTruthy()
  })

  it('link de recuperação (marcador na sessão) com marca antiga: não sai', async () => {
    localStorage.setItem('encivil-ultima-atividade', String(Date.now() - 3 * 60 * MIN))
    sessionStorage.setItem('encivil-recuperacao', '1')
    render(<AuthProvider><Estado /></AuthProvider>)
    await flush()
    await act(async () => { await m.ouvinte?.('SIGNED_IN', sessao('A')) })
    await flush()
    sessionStorage.removeItem('encivil-recuperacao')
    expect(m.signOut).not.toHaveBeenCalled()
  })

  it('última atividade recente: mantém a sessão', async () => {
    localStorage.setItem('encivil-ultima-atividade', String(Date.now() - 5 * MIN))
    render(<AuthProvider><Estado /></AuthProvider>)
    await flush()
    await act(async () => { await m.ouvinte?.('SIGNED_IN', sessao('A')) })
    await flush()
    expect(m.signOut).not.toHaveBeenCalled()
  })
})

describe('prazo de inatividade ultrapassado sem o temporizador correr', () => {
  async function entrar() {
    render(<AuthProvider><Estado /></AuthProvider>)
    await flush()
    await act(async () => { await m.ouvinte?.('SIGNED_IN', sessao('A')) })
    await flush()
  }

  it('31 min sem temporizadores (aba suspensa) e um mousedown: termina a sessão em vez de a renovar', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    await entrar()
    vi.setSystemTime(Date.now() + 31 * MIN) // relógio salta; nenhum temporizador corre
    await act(async () => { window.dispatchEvent(new Event('mousedown')) })
    await flush()
    expect(m.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(m.info).toHaveBeenCalled()
  })

  it('voltar a ficar visível depois do prazo termina a sessão', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    await entrar()
    vi.setSystemTime(Date.now() + 31 * MIN)
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    await flush()
    expect(m.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('atividade dentro do prazo continua a renovar', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    await entrar()
    vi.setSystemTime(Date.now() + 20 * MIN)
    await act(async () => { window.dispatchEvent(new Event('mousedown')) })
    await flush()
    expect(m.signOut).not.toHaveBeenCalled()
  })
})

describe('fim de sessão e push do dispositivo', () => {
  it('terminar sessão retira o push deste dispositivo antes do signOut', async () => {
    let sair!: () => Promise<void>
    function Botao() { sair = useAuth().signOut; return null }
    render(<AuthProvider><Estado /><Botao /></AuthProvider>)
    await flush()
    await act(async () => { await m.ouvinte?.('SIGNED_IN', sessao('A')) })
    await flush()
    const ordem: string[] = []
    m.removerPush.mockImplementation(async () => { ordem.push('push') })
    m.signOut.mockImplementation(async () => { ordem.push('signOut'); return { error: null } })
    await act(async () => { await sair() })
    expect(ordem).toEqual(['push', 'signOut'])
  })

  it('push lento ou a falhar não prende o logout', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    let sair!: () => Promise<void>
    function Botao() { sair = useAuth().signOut; return null }
    render(<AuthProvider><Estado /><Botao /></AuthProvider>)
    await flush()
    await act(async () => { await m.ouvinte?.('SIGNED_IN', sessao('A')) })
    await flush()
    m.removerPush.mockImplementation(() => new Promise<void>(() => {}))
    await act(async () => { const p = sair(); await vi.advanceTimersByTimeAsync(3000); await p })
    expect(m.signOut).toHaveBeenCalled()
  })

  it('push a rejeitar não impede o signOut', async () => {
    let sair!: () => Promise<void>
    function Botao() { sair = useAuth().signOut; return null }
    render(<AuthProvider><Estado /><Botao /></AuthProvider>)
    await flush()
    await act(async () => { await m.ouvinte?.('SIGNED_IN', sessao('A')) })
    await flush()
    m.removerPush.mockRejectedValue(new Error('rede'))
    await act(async () => { await sair() })
    expect(m.signOut).toHaveBeenCalled()
  })
})
