import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'

const m = vi.hoisted(() => ({ session: null as unknown }))
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ session: m.session, loading: false }) }))

const montar = async (url: string, entrada: boolean) => {
  vi.resetModules()
  sessionStorage.clear()
  if (!entrada) sessionStorage.setItem('encivil-entrada', '1')
  const { AuthGuard } = await import('@/features/auth/AuthGuard')
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/login" element={<p>LOGIN</p>} />
        <Route element={<AuthGuard />}>
          <Route path="/" element={<p>INICIO</p>} />
          <Route path="/abastecimento/pedido/x" element={<p>PEDIDO</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => { m.session = null })

describe('AuthGuard', () => {
  it('sem sessão manda para o login', async () => {
    await montar('/abastecimento/pedido/x', true)
    expect(screen.getByText('LOGIN')).toBeInTheDocument()
  })
  it('com sessão, a primeira abertura num endereço interno vai para a página inicial', async () => {
    m.session = { user: { id: 'u' } }
    await montar('/abastecimento/pedido/x', true)
    expect(screen.getByText('INICIO')).toBeInTheDocument()
  })
  it('com sessão já iniciada, mantém o endereço', async () => {
    m.session = { user: { id: 'u' } }
    await montar('/abastecimento/pedido/x', false)
    expect(screen.getByText('PEDIDO')).toBeInTheDocument()
  })
})
