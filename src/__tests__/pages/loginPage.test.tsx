import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const m = vi.hoisted(() => ({ signIn: vi.fn(async () => ({ error: null })), reset: vi.fn(), info: vi.fn() }))
vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ signIn: m.signIn, session: null }) }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { resetPasswordForEmail: m.reset } } }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: m.info, success: vi.fn() } }))

afterEach(cleanup)
import { LoginPage } from '@/app/pages/LoginPage'

describe('LoginPage', () => {
  it('utilizador sem @ entra com o email interno', async () => {
    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('Email ou utilizador'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('Palavra-passe'), { target: { value: 'segredo123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await waitFor(() => expect(m.signIn).toHaveBeenCalledWith('123@contas.encivilconstroi.com', 'segredo123'))
  })

  it('recuperação sem @ avisa e não chama a API', () => {
    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('Email ou utilizador'), { target: { value: 'joao' } })
    fireEvent.click(screen.getByText('Esqueceu a palavra-passe?'))
    fireEvent.change(screen.getByLabelText('Email da conta'), { target: { value: 'joao' } })
    fireEvent.submit(screen.getByLabelText('Email da conta').closest('form')!)
    expect(m.info).toHaveBeenCalledWith('Contas sem email: peça ao administrador para redefinir a senha.')
    expect(m.reset).not.toHaveBeenCalled()
  })

  it('recuperação com email interno (@contas…) também avisa e não chama a API', () => {
    m.info.mockClear(); m.reset.mockClear()
    render(<LoginPage />)
    fireEvent.click(screen.getByText('Esqueceu a palavra-passe?'))
    fireEvent.change(screen.getByLabelText('Email da conta'), { target: { value: 'joao@contas.encivilconstroi.com' } })
    fireEvent.submit(screen.getByLabelText('Email da conta').closest('form')!)
    expect(m.info).toHaveBeenCalledWith('Contas sem email: peça ao administrador para redefinir a senha.')
    expect(m.reset).not.toHaveBeenCalled()
  })
})
