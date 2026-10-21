import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'

// Reproduz o auth-js: na inicialização emite SIGNED_IN e espera pelo callback antes de
// terminar; getSession() e as consultas (que pedem o token) esperam pela inicialização.
const m = vi.hoisted(() => {
  let resolverInit!: () => void
  const init = new Promise<void>(r => { resolverInit = r })
  const sessao = { access_token: 't', user: { id: 'A', email: 'a@encivil.pt' } }
  return { init, resolverInit: () => resolverInit(), sessao, consultasPerfil: 0, eventos: [] as string[] }
})

vi.mock('@/app/lib/sentry', () => ({ setSentryUser: vi.fn(), clearSentryUser: vi.fn(), captureError: vi.fn() }))
vi.mock('@/features/auth/services/eventosSegurancaService', () => ({ registarEvento: vi.fn() }))
vi.mock('@/features/auth/lib/limparDadosLocais', () => ({ limparDadosLocais: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: async () => { await m.init; return { data: { session: m.sessao } } },
      onAuthStateChange: (cb: (evento: string, sessao: unknown) => unknown) => {
        queueMicrotask(async () => {
          await cb('SIGNED_IN', m.sessao)
          m.resolverInit()
          await cb('INITIAL_SESSION', m.sessao)
        })
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      },
      signOut: vi.fn(),
    },
    rpc: vi.fn(),
    from: () => ({ select: () => ({ eq: () => ({ single: async () => {
      m.consultasPerfil++
      await m.init
      return { data: { role: 'admin', nome: 'Ana' }, error: null }
    } }) }) }),
  },
}))

import { AuthProvider, useAuth } from '@/features/auth/AuthContext'

function Estado() {
  const { profile, loading } = useAuth()
  return <span>{`${profile?.nome ?? '-'}|${loading ? 'a carregar' : 'pronto'}`}</span>
}

describe('arranque com sessão guardada', () => {
  it('não encrava quando o auth-js espera pelo callback durante a inicialização', async () => {
    render(<AuthProvider><Estado /></AuthProvider>)
    for (let i = 0; i < 20; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)) })
    expect(screen.getByText('Ana|pronto')).toBeTruthy()
  })

  it('lê o perfil uma só vez apesar de SIGNED_IN e INITIAL_SESSION no arranque', () => {
    expect(m.consultasPerfil).toBe(1)
  })
})
