import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'

const m = vi.hoisted(() => ({
  cb: null as null | ((e: string, s: unknown) => void),
  updateUser: vi.fn(async (_: unknown): Promise<{ error: null | { code?: string; message?: string } }> => ({ error: null })),
  verifyOtp: vi.fn(async (_: unknown): Promise<{ data: { session: null | { user: { email: string } } }; error: null | { message: string } }> => ({ data: { session: { user: { email: "900@contas.encivilconstroi.com" } } }, error: null })),
  signOut: vi.fn(),
  navigate: vi.fn(),
}))
vi.mock('react-router', () => ({ useNavigate: () => m.navigate }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }))
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (e: string, s: unknown) => void) => {
        m.cb = cb
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      },
      getSession: vi.fn(async () => ({ data: { session: null } })),
      updateUser: m.updateUser,
      verifyOtp: m.verifyOtp,
      signOut: m.signOut,
    },
  },
}))
vi.mock("@/features/auth/components/MfaDesafio", () => ({
  MfaDesafio: ({ onConcluido }: { onConcluido: () => void }) => <button onClick={onConcluido}>Confirmar código</button>,
}))
import { ResetPasswordPage } from '@/app/pages/ResetPasswordPage'

const EMAIL = '900@contas.encivilconstroi.com'
const recovery = () => act(() => { m.cb!('PASSWORD_RECOVERY', { user: { email: EMAIL } }) })

beforeEach(() => { vi.clearAllMocks(); window.history.replaceState(null, "", "/reset-password") })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('ResetPasswordPage', () => {
  it('mostra a conta', () => {
    render(<ResetPasswordPage />)
    recovery()
    expect(screen.getByText('Conta: 900')).toBeTruthy()
  })

  it('guarda a senha, não faz signOut e vai para /', async () => {
    render(<ResetPasswordPage />)
    recovery()
    fireEvent.change(screen.getByLabelText('Nova palavra-passe'), { target: { value: 'Abcdefgh1234' } })
    fireEvent.change(screen.getByLabelText('Confirmar palavra-passe'), { target: { value: 'Abcdefgh1234' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nova palavra-passe' }))
    await waitFor(() => expect(m.navigate).toHaveBeenCalledWith('/', { replace: true }))
    expect(m.updateUser).toHaveBeenCalledWith({ password: 'Abcdefgh1234' })
    expect(m.signOut).not.toHaveBeenCalled()
  })

  it('sem evento em 4 s mostra link expirado', () => {
    vi.useFakeTimers()
    render(<ResetPasswordPage />)
    act(() => { vi.advanceTimersByTime(4100) })
    expect(screen.getByText(/O link expirou ou já foi usado/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao login' }))
    expect(m.navigate).toHaveBeenCalledWith('/login')
  })

  it('tem username e new-password para o gestor de senhas', () => {
    const { container } = render(<ResetPasswordPage />)
    recovery()
    const u = container.querySelector('input[autocomplete="username"]') as HTMLInputElement
    expect(u.value).toBe(EMAIL)
    expect(container.querySelectorAll('input[autocomplete="new-password"]')).toHaveLength(2)
  })
})

const preencher = () => {
  fireEvent.change(screen.getByLabelText('Nova palavra-passe'), { target: { value: 'Abcdefgh1234' } })
  fireEvent.change(screen.getByLabelText('Confirmar palavra-passe'), { target: { value: 'Abcdefgh1234' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar nova palavra-passe' }))
}

describe('ResetPasswordPage — link do administrador (token_hash)', () => {
  const abrirLink = () => window.history.replaceState(null, '', '/reset-password?token_hash=abc%2B1&type=recovery')

  it('não usa o token antes do clique (pré-visualização) nem expira aos 4 s', () => {
    vi.useFakeTimers()
    abrirLink()
    render(<ResetPasswordPage />)
    expect(screen.getByText('Criar nova palavra-passe')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(10000) })
    expect(m.verifyOtp).not.toHaveBeenCalled()
    expect(screen.queryByText(/O link expirou ou já foi usado/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeTruthy()
  })

  it('Continuar valida o token, limpa o URL e mostra o formulário', async () => {
    abrirLink()
    render(<ResetPasswordPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    await waitFor(() => expect(screen.getByText('Conta: 900')).toBeTruthy())
    expect(m.verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc+1', type: 'recovery' })
    expect(window.location.search).toBe('')
    preencher()
    await waitFor(() => expect(m.navigate).toHaveBeenCalledWith('/', { replace: true }))
  })

  it('token recusado mostra Link inválido', async () => {
    m.verifyOtp.mockResolvedValueOnce({ data: { session: null }, error: { message: 'Token has expired or is invalid' } })
    abrirLink()
    render(<ResetPasswordPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    await waitFor(() => expect(screen.getByText('Link inválido')).toBeTruthy())
    expect(window.location.search).toBe('')
  })
})

describe('ResetPasswordPage — conta com verificação em dois passos', () => {
  it('insufficient_aal pede o código e repete a gravação uma vez', async () => {
    m.updateUser.mockResolvedValueOnce({ error: { code: 'insufficient_aal', message: 'AAL2 session is required to update email or password when MFA is enabled.' } })
    render(<ResetPasswordPage />)
    recovery()
    preencher()
    const confirmar = await screen.findByRole('button', { name: 'Confirmar código' })
    expect(m.navigate).not.toHaveBeenCalled()
    fireEvent.click(confirmar)
    await waitFor(() => expect(m.navigate).toHaveBeenCalledWith('/', { replace: true }))
    expect(m.updateUser).toHaveBeenCalledTimes(2)
  })

  it('reconhece a mensagem AAL2 sem código e volta ao formulário se a repetição falhar', async () => {
    m.updateUser
      .mockResolvedValueOnce({ error: { message: 'AAL2 session is required' } })
      .mockResolvedValueOnce({ error: { code: 'x', message: 'falhou' } })
    render(<ResetPasswordPage />)
    recovery()
    preencher()
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar código' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar nova palavra-passe' })).toBeTruthy())
    expect(m.updateUser).toHaveBeenCalledTimes(2)
    expect(m.navigate).not.toHaveBeenCalled()
  })
})
