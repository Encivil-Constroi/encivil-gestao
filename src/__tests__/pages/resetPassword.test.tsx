import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'

const m = vi.hoisted(() => ({
  cb: null as null | ((e: string, s: unknown) => void),
  updateUser: vi.fn(async (_: unknown): Promise<{ error: null | { code?: string; message?: string } }> => ({ error: null })),
  verifyOtp: vi.fn(async (_: unknown): Promise<{ data: { session: null | { user: { email: string } } }; error: null | { message: string; status?: number; name?: string } }> => ({ data: { session: { user: { email: "900@contas.encivilconstroi.com" } } }, error: null })),
  signOut: vi.fn(),
  navigate: vi.fn(),
  entrada: null as null | { tipo: string; codigo?: string; descricao?: string },
  marcador: false,
  getSession: vi.fn(async (): Promise<{ data: { session: null | { user: { email: string } } } }> => ({ data: { session: null } })),
}))
vi.mock('react-router', () => ({ useNavigate: () => m.navigate }))
vi.mock('@/integrations/supabase/entradaUrl', async (orig) => ({
  ...(await orig<typeof import('@/integrations/supabase/entradaUrl')>()),
  entradaCapturada: () => m.entrada,
  temMarcadorRecuperacao: () => m.marcador,
  limparMarcadorRecuperacao: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }))
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (e: string, s: unknown) => void) => {
        m.cb = cb
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      },
      getSession: () => m.getSession(),
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

beforeEach(() => { vi.clearAllMocks(); m.entrada = null; m.marcador = false; m.getSession.mockImplementation(async () => ({ data: { session: null } })); window.history.replaceState(null, "", "/reset-password") })
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

  it('sem evento em 8 s mostra link expirado', () => {
    vi.useFakeTimers()
    render(<ResetPasswordPage />)
    act(() => { vi.advanceTimersByTime(8100) })
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

  it('não usa o token antes do clique (pré-visualização) nem expira aos 8 s', () => {
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
    m.verifyOtp.mockResolvedValueOnce({ data: { session: null }, error: { message: 'Token has expired or is invalid', status: 403 } })
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

describe('ResetPasswordPage — robustez da validação', () => {
  const EMAIL_SESSAO = { user: { email: EMAIL } }

  it('sessão de recuperação já criada (sem evento) com marcador mostra o formulário', async () => {
    m.marcador = true
    m.entrada = { tipo: 'sessao' }
    m.getSession.mockResolvedValue({ data: { session: EMAIL_SESSAO } })
    render(<ResetPasswordPage />)
    await waitFor(() => expect(screen.getByText('Conta: 900')).toBeTruthy())
  })

  it('sessão existente sem marcador nem token não abre o formulário', async () => {
    m.getSession.mockResolvedValue({ data: { session: EMAIL_SESSAO } })
    vi.useFakeTimers()
    render(<ResetPasswordPage />)
    await act(async () => { await vi.advanceTimersByTimeAsync(8100) })
    expect(screen.queryByLabelText('Nova palavra-passe')).toBeNull()
    expect(screen.getByText('Link inválido')).toBeTruthy()
  })

  it('INITIAL_SESSION com sessão e marcador mostra o formulário', () => {
    m.marcador = true
    render(<ResetPasswordPage />)
    act(() => { m.cb!('INITIAL_SESSION', EMAIL_SESSAO) })
    expect(screen.getByText('Conta: 900')).toBeTruthy()
  })

  it('erro otp_expired no hash mostra mensagem específica e Pedir novo link', () => {
    m.entrada = { tipo: 'erro', codigo: 'otp_expired', descricao: 'Email link is invalid or has expired' }
    render(<ResetPasswordPage />)
    expect(screen.getByText(/abrem o link antes de si/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Pedir novo link' }))
    expect(m.navigate).toHaveBeenCalledWith('/login', { state: { modo: 'pedir-reset' } })
  })

  it('erro de rede no verifyOtp mantém o token e permite tentar de novo', async () => {
    window.history.replaceState(null, '', '/reset-password?token_hash=abc&type=recovery')
    m.verifyOtp.mockResolvedValueOnce({ data: { session: null }, error: { message: 'Failed to fetch', name: 'AuthRetryableFetchError' } })
    render(<ResetPasswordPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    const tentar = await screen.findByRole('button', { name: 'Tentar de novo' })
    expect(window.location.search).toContain('token_hash=abc')
    fireEvent.click(tentar)
    await waitFor(() => expect(screen.getByText('Conta: 900')).toBeTruthy())
    expect(m.verifyOtp).toHaveBeenCalledTimes(2)
  })

  it('verifyOtp com 5xx também é erro de rede', async () => {
    window.history.replaceState(null, '', '/reset-password?token_hash=abc&type=recovery')
    m.verifyOtp.mockResolvedValueOnce({ data: { session: null }, error: { message: 'boom', status: 502 } })
    render(<ResetPasswordPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
  })

  it('verifyOtp 4xx é link expirado com Pedir novo link', async () => {
    window.history.replaceState(null, '', '/reset-password?token_hash=abc&type=recovery')
    m.verifyOtp.mockResolvedValueOnce({ data: { session: null }, error: { message: 'invalid', status: 403 } })
    render(<ResetPasswordPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await screen.findByRole('button', { name: 'Pedir novo link' })).toBeTruthy()
    expect(window.location.search).toBe('')
  })
})
