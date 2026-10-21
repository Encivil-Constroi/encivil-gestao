import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import { clearAsyncCache } from '@/app/lib/useAsync'

// Sessão já iniciada neste separador: o guarda não força a página inicial (calculado ao importar)
const m = vi.hoisted(() => {
  sessionStorage.setItem('encivil-entrada', '1')
  return {
    auth: { session: null as null | { user: { id: string }; access_token: string }, loading: false, profile: null as null | { role: string; nome: string } },
    resolverNivel: null as null | ((v: { atual: 'aal1' | 'aal2'; seguinte: 'aal1' | 'aal2' }) => void),
    rendersApp: 0,
  }
})
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ ...m.auth, signOut: vi.fn() }) }))
vi.mock('@/features/auth/services/mfaService', () => ({
  nivelMfa: () => new Promise(r => { m.resolverNivel = r }),
  listarFatores: () => Promise.resolve([{ id: 'f', nome: null, criadoEm: '' }]),
  mfaObrigatorio: () => Promise.resolve(true),
}))
vi.mock('@/app/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('@/features/auth/components/MfaDesafio', () => ({ MfaDesafio: () => <h1>Verificação em dois passos</h1> }))

import { AuthGuard } from '@/features/auth/AuthGuard'

function App() {
  m.rendersApp++
  return <p>APP</p>
}
const arvore = () => (
  <MemoryRouter initialEntries={['/obras']}>
    <Routes>
      <Route element={<AuthGuard />}>
        <Route path="/obras" element={<App />} />
      </Route>
    </Routes>
  </MemoryRouter>
)

beforeEach(() => { m.rendersApp = 0; m.resolverNivel = null; m.auth = { session: null, loading: true, profile: null } })
afterEach(() => { cleanup(); clearAsyncCache() })

describe('AuthGuard + useEstadoMfa real — login sem flash da app', () => {
  it('perfil null → p: a app nunca renderiza antes de o estado MFA estar decidido', async () => {
    const r = render(arvore())
    // SIGNED_IN: sessão chegou, perfil ainda a carregar (AuthContext em loading)
    m.auth = { session: { user: { id: 'u1' }, access_token: 't' }, loading: true, profile: null }
    r.rerender(arvore())
    // Perfil resolvido: useEstadoMfa liga-se agora
    m.auth = { ...m.auth, loading: false, profile: { role: 'admin', nome: 'A' } }
    r.rerender(arvore())
    expect(m.rendersApp).toBe(0)
    // Utilizador com fator e sessão aal1 → desafio, nunca a app
    await act(async () => { m.resolverNivel?.({ atual: 'aal1', seguinte: 'aal2' }) })
    expect(await screen.findByText('Verificação em dois passos')).toBeInTheDocument()
    expect(m.rendersApp).toBe(0)
  })

  it('sessão já aal2: a app aparece depois de decidido', async () => {
    m.auth = { session: { user: { id: 'u1' }, access_token: 't' }, loading: false, profile: { role: 'admin', nome: 'A' } }
    render(arvore())
    expect(m.rendersApp).toBe(0)
    await act(async () => { m.resolverNivel?.({ atual: 'aal2', seguinte: 'aal2' }) })
    expect(await screen.findByText('APP')).toBeInTheDocument()
  })
})
