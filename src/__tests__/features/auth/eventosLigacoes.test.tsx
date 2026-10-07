import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const m = vi.hoisted(() => ({
  ouvinte: null as null | ((evento: string, sessao: unknown) => void),
  signIn: vi.fn(),
  registarEvento: vi.fn(),
  listarFatores: vi.fn(),
  verificarCodigo: vi.fn(),
  iniciarRegisto: vi.fn(),
  removerFator: vi.fn(),
  mfaObrigatorio: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }))
vi.mock('@/app/lib/sentry', () => ({ setSentryUser: vi.fn(), clearSentryUser: vi.fn(), captureError: vi.fn() }))
vi.mock('@/features/auth/lib/limparDadosLocais', () => ({ limparDadosLocais: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/features/auth/services/eventosSegurancaService', () => ({
  registarEvento: (...a: unknown[]) => m.registarEvento(...a),
}))
vi.mock('@/features/auth/hooks/useEstadoMfa', () => ({
  useEstadoMfa: () => ({ estado: 'ok', loading: false, recarregar: vi.fn() }),
}))
vi.mock('@/features/auth/services/mfaService', () => ({
  listarFatores: () => m.listarFatores(),
  verificarCodigo: (...a: unknown[]) => m.verificarCodigo(...a),
  iniciarRegisto: () => m.iniciarRegisto(),
  removerFator: (...a: unknown[]) => m.removerFator(...a),
  mfaObrigatorio: () => m.mfaObrigatorio(),
}))
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: 'u', email: 'a@b.pt' }, access_token: 't' } } }),
      onAuthStateChange: (cb: (evento: string, sessao: unknown) => void) => {
        m.ouvinte = cb
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      },
      signInWithPassword: (...a: unknown[]) => m.signIn(...a),
      signOut: vi.fn(),
    },
    from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { role: 'admin', nome: 'A' }, error: null }) }) }) }),
  },
}))

import { AuthProvider, useAuth } from '@/features/auth/AuthContext'
import { MfaDesafio } from '@/features/auth/components/MfaDesafio'
import { MfaRegistoPage } from '@/features/auth/components/MfaRegistoPage'

function Entrar() {
  const { signIn } = useAuth()
  return <button onClick={() => { void signIn('a@b.pt', 'x') }}>entrar</button>
}

afterEach(cleanup)
beforeEach(() => {
  m.signIn.mockReset()
  m.registarEvento.mockReset().mockResolvedValue(undefined)
  m.listarFatores.mockReset().mockResolvedValue([])
  m.verificarCodigo.mockReset()
  m.iniciarRegisto.mockReset()
  m.removerFator.mockReset()
  m.mfaObrigatorio.mockReset().mockResolvedValue(false)
})

describe('login com sucesso', () => {
  it('regista login_ok quando a palavra-passe é aceite', async () => {
    m.signIn.mockResolvedValue({ error: null })
    render(<AuthProvider><Entrar /></AuthProvider>)
    await act(async () => { screen.getByText('entrar').click() })
    await waitFor(() => expect(m.registarEvento).toHaveBeenCalledWith('login_ok'))
  })
  it('não regista login_ok quando a palavra-passe é recusada', async () => {
    m.signIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    render(<AuthProvider><Entrar /></AuthProvider>)
    await act(async () => { screen.getByText('entrar').click() })
    expect(m.registarEvento).not.toHaveBeenCalled()
  })
  it('SIGNED_IN ao voltar ao separador não conta como novo login', async () => {
    render(<AuthProvider><Entrar /></AuthProvider>)
    await act(async () => { await Promise.resolve() })
    await act(async () => { m.ouvinte?.('SIGNED_IN', { user: { id: 'u', email: 'a@b.pt' } }) })
    expect(m.registarEvento).not.toHaveBeenCalled()
  })
})

const renderDentroDeSessao = (ui: React.ReactNode) =>
  render(<MemoryRouter><AuthProvider>{ui}</AuthProvider></MemoryRouter>)

describe('desafio MFA', () => {
  it('código recusado regista mfa_falhado', async () => {
    m.listarFatores.mockResolvedValue([{ id: 'f1', nome: null, criadoEm: '2026-10-01' }])
    m.verificarCodigo.mockRejectedValue(new Error('Código inválido ou expirado.'))
    renderDentroDeSessao(<MfaDesafio onConcluido={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Confirmar')).not.toBeDisabled())
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: '123456' } })
    await act(async () => { fireEvent.click(screen.getByText('Confirmar')) })
    await waitFor(() => expect(m.registarEvento).toHaveBeenCalledWith('mfa_falhado'))
  })
  it('código aceite não regista falha', async () => {
    m.listarFatores.mockResolvedValue([{ id: 'f1', nome: null, criadoEm: '2026-10-01' }])
    m.verificarCodigo.mockResolvedValue(true)
    const concluido = vi.fn()
    renderDentroDeSessao(<MfaDesafio onConcluido={concluido} />)
    await waitFor(() => expect(screen.getByText('Confirmar')).not.toBeDisabled())
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: '123456' } })
    await act(async () => { fireEvent.click(screen.getByText('Confirmar')) })
    await waitFor(() => expect(concluido).toHaveBeenCalled())
    expect(m.registarEvento).not.toHaveBeenCalledWith('mfa_falhado')
  })
})

describe('registo MFA', () => {
  it('registo concluído regista mfa_registado', async () => {
    m.iniciarRegisto.mockResolvedValue({ fatorId: 'novo', qrSvg: 'data:image/svg+xml;x', segredo: 'ABC' })
    m.verificarCodigo.mockResolvedValue(true)
    renderDentroDeSessao(<MfaRegistoPage />)
    const comecar = await screen.findByText('Começar')
    await act(async () => { fireEvent.click(comecar) })
    fireEvent.change(await screen.findByLabelText('Código'), { target: { value: '123456' } })
    await act(async () => { fireEvent.click(screen.getByText('Confirmar')) })
    await waitFor(() => expect(m.registarEvento).toHaveBeenCalledWith('mfa_registado'))
  })
  it('desativar regista mfa_removido', async () => {
    m.listarFatores.mockResolvedValue([{ id: 'f1', nome: null, criadoEm: '2026-10-01' }])
    m.removerFator.mockResolvedValue(true)
    renderDentroDeSessao(<MfaRegistoPage />)
    const desativar = await screen.findByText('Desativar')
    await act(async () => { fireEvent.click(desativar) })
    const botoes = screen.getAllByText('Desativar')
    await act(async () => { fireEvent.click(botoes[botoes.length - 1]) })
    await waitFor(() => expect(m.registarEvento).toHaveBeenCalledWith('mfa_removido'))
  })
})
