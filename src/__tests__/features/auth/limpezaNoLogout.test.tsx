import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'

const m = vi.hoisted(() => ({
  ouvinte: null as null | ((evento: string, sessao: unknown) => void),
  limpar: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { info: vi.fn() } }))
vi.mock('@/app/lib/sentry', () => ({ setSentryUser: vi.fn(), clearSentryUser: vi.fn() }))
vi.mock('@/features/auth/lib/limparDadosLocais', () => ({ limparDadosLocais: m.limpar }))
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: (cb: (evento: string, sessao: unknown) => void) => {
        m.ouvinte = cb
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      },
      signOut: m.signOut,
    },
    rpc: vi.fn(),
    from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }),
  },
}))

import { AuthProvider, useAuth } from '@/features/auth/AuthContext'

// O localStorage do ambiente de testes não é fiável; um Map chega
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

function Sair() {
  const { signOut, session } = useAuth()
  return <>
    <button onClick={() => { void signOut().catch(() => undefined) }}>sair</button>
    <span>{session ? 'com sessão' : 'sem sessão'}</span>
  </>
}

afterEach(cleanup)

beforeEach(() => {
  m.limpar.mockReset().mockResolvedValue(undefined)
  m.signOut.mockReset().mockResolvedValue({ error: null })
})

describe('limpeza de dados locais ao terminar sessão', () => {
  it('SIGNED_OUT (refresh falhado, outro separador) também limpa os dados locais', async () => {
    render(<AuthProvider><Sair /></AuthProvider>)
    await act(async () => { await Promise.resolve() })
    await act(async () => { m.ouvinte?.('SIGNED_OUT', null) })
    expect(m.limpar).toHaveBeenCalled()
  })

  it('outros eventos não limpam', async () => {
    render(<AuthProvider><Sair /></AuthProvider>)
    await act(async () => { await Promise.resolve() })
    await act(async () => { m.ouvinte?.('TOKEN_REFRESHED', null) })
    expect(m.limpar).not.toHaveBeenCalled()
  })

  it('se o signOut falhar (rede) a limpeza corre na mesma', async () => {
    m.signOut.mockRejectedValue(new Error('Failed to fetch'))
    render(<AuthProvider><Sair /></AuthProvider>)
    await act(async () => { screen.getByText('sair').click() })
    expect(m.limpar).toHaveBeenCalled()
  })

  // Telemóvel partilhado: sem rede o supabase-js devolve o erro e NÃO apaga a sessão
  // guardada — depois de recarregar, o próximo a pegar no telemóvel entrava como o anterior.
  describe('sair sem rede', () => {
    const sessaoFalsa = { access_token: 't', user: { id: 'u1', email: 'a@b.pt' } }
    beforeEach(() => {
      localStorage.clear()
      localStorage.setItem('sb-projeto-auth-token', '{}')
      localStorage.setItem('sb-projeto-auth-token-code-verifier', 'x')
      localStorage.setItem('encivil_pending_movimentos', '[]')
      localStorage.setItem('encivil-tema', 'escuro')
    })

    it.each([
      ['devolve erro', () => m.signOut.mockResolvedValue({ error: new Error('Failed to fetch') })],
      ['rejeita', () => m.signOut.mockRejectedValue(new Error('Failed to fetch'))],
    ])('signOut %s: apaga a sessão guardada e o ecrã fica sem sessão', async (_n, falhar) => {
      falhar()
      render(<AuthProvider><Sair /></AuthProvider>)
      await act(async () => { await Promise.resolve() })
      await act(async () => { m.ouvinte?.('SIGNED_IN', sessaoFalsa) })
      expect(screen.getByText('com sessão')).toBeTruthy()
      await act(async () => { screen.getByText('sair').click() })
      expect(localStorage.getItem('sb-projeto-auth-token')).toBeNull()
      expect(localStorage.getItem('sb-projeto-auth-token-code-verifier')).toBeNull()
      expect(screen.getByText('sem sessão')).toBeTruthy()
      // A fila offline e as preferências ficam
      expect(localStorage.getItem('encivil_pending_movimentos')).toBe('[]')
      expect(localStorage.getItem('encivil-tema')).toBe('escuro')
    })

    it('com rede deixa a remoção da sessão ao supabase-js', async () => {
      render(<AuthProvider><Sair /></AuthProvider>)
      await act(async () => { screen.getByText('sair').click() })
      expect(localStorage.getItem('sb-projeto-auth-token')).toBe('{}')
    })
  })
})
