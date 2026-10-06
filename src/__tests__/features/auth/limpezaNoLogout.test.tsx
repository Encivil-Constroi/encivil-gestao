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
    from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }),
  },
}))

import { AuthProvider, useAuth } from '@/features/auth/AuthContext'

function Sair() {
  const { signOut } = useAuth()
  return <button onClick={() => { void signOut().catch(() => undefined) }}>sair</button>
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
})
