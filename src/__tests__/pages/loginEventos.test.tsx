import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const m = vi.hoisted(() => ({ signIn: vi.fn(), navigate: vi.fn(), registarLoginFalhado: vi.fn() }))

vi.mock('react-router', () => ({ useNavigate: () => m.navigate }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {} } }))
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ signIn: m.signIn, session: null }) }))
vi.mock('@/features/auth/services/eventosSegurancaService', () => ({
  registarLoginFalhado: (...a: unknown[]) => m.registarLoginFalhado(...a),
}))

import { LoginPage } from '@/app/pages/LoginPage'

afterEach(cleanup)
beforeEach(() => {
  m.signIn.mockReset()
  m.navigate.mockReset()
  m.registarLoginFalhado.mockReset().mockResolvedValue(undefined)
})

const entrar = () => {
  render(<LoginPage />)
  fireEvent.change(screen.getByLabelText('Email ou utilizador'), { target: { value: 'ana@x.pt' } })
  fireEvent.change(screen.getByLabelText('Palavra-passe'), { target: { value: 'errada' } })
  fireEvent.click(screen.getByText('Entrar'))
}

describe('LoginPage — eventos de segurança', () => {
  it('login recusado regista a tentativa com o email', async () => {
    m.signIn.mockResolvedValue({ error: 'Invalid login credentials' })
    entrar()
    await waitFor(() => expect(m.registarLoginFalhado).toHaveBeenCalledWith('ana@x.pt'))
    expect(m.navigate).not.toHaveBeenCalled()
  })
  it('login aceite não regista falha e segue para a página inicial', async () => {
    m.signIn.mockResolvedValue({ error: null })
    entrar()
    await waitFor(() => expect(m.navigate).toHaveBeenCalledWith('/', { replace: true }))
    expect(m.registarLoginFalhado).not.toHaveBeenCalled()
  })
})
