import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'

// Sessão já iniciada neste separador: o guarda não força a página inicial (calculado ao importar)
const m = vi.hoisted(() => {
  sessionStorage.setItem('encivil-entrada', '1')
  return { estado: null as null | 'ok' | 'desafio' | 'registo', loading: false }
})
vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'u' } }, loading: false, profile: { role: 'admin', nome: 'A' }, signOut: vi.fn() }),
}))
vi.mock('@/features/auth/hooks/useEstadoMfa', () => ({
  useEstadoMfa: () => ({ estado: m.estado, loading: m.loading, recarregar: vi.fn() }),
}))
vi.mock('@/features/auth/components/MfaDesafio', () => ({
  MfaDesafio: () => <h1>Verificação em dois passos</h1>,
}))

import { AuthGuard } from '@/features/auth/AuthGuard'

const montar = (url: string) => {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route element={<AuthGuard />}>
          <Route path="/obras" element={<p>OBRAS</p>} />
          <Route path="/seguranca/mfa" element={<p>pagina mfa</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => { m.estado = null; m.loading = false })
afterEach(cleanup)

describe('AuthGuard com verificação em dois passos', () => {
  it('estado desafio mostra o pedido de código e não a página', () => {
    m.estado = 'desafio'
    montar('/obras')
    expect(screen.getByText('Verificação em dois passos')).toBeInTheDocument()
    expect(screen.queryByText('OBRAS')).toBeNull()
  })
  it('estado registo noutra página leva ao registo', () => {
    m.estado = 'registo'
    montar('/obras')
    expect(screen.getByText('pagina mfa')).toBeInTheDocument()
    expect(screen.queryByText('OBRAS')).toBeNull()
  })
  it('estado registo já na página de registo mostra-a (sem ciclo de redireção)', () => {
    m.estado = 'registo'
    montar('/seguranca/mfa')
    expect(screen.getByText('pagina mfa')).toBeInTheDocument()
  })
  it('estado null (a carregar ou erro) deixa passar — o servidor impõe o MFA', () => {
    m.estado = null
    montar('/obras')
    expect(screen.getByText('OBRAS')).toBeInTheDocument()
  })
  it('primeira verificação em curso não mostra a app (evita ver a página antes do código)', () => {
    m.estado = null
    m.loading = true
    montar('/obras')
    expect(screen.queryByText('OBRAS')).toBeNull()
  })
  it('registo a ser reverificado (sessão acabou de mudar) não reenvia com o estado antigo', () => {
    m.estado = 'registo'
    m.loading = true
    montar('/obras')
    expect(screen.queryByText('pagina mfa')).toBeNull()
  })
  it('estado ok deixa passar', () => {
    m.estado = 'ok'
    montar('/obras')
    expect(screen.getByText('OBRAS')).toBeInTheDocument()
  })
})
