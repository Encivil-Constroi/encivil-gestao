import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const m = vi.hoisted(() => ({
  criar: vi.fn(async () => ({ userId: 'u1', email: 'ana.costa@contas.encivilconstroi.com' })),
  erro: null as string | null,
  gerar: vi.fn(async (_id: string) => ({ link: 'https://l', nome: 'Rui', telemovel: '912345678', login: '900', email: '900@contas.encivilconstroi.com' })),
}))
const utilizadoresMock = [
  { id: 'x', email: 'a@x.pt', nome: 'Admin', role: 'admin', ativo: true, ultimoLogin: null, criadoEm: '', login: null, semEmail: false, mfa: false },
  { id: 'u2', email: '900@contas.encivilconstroi.com', nome: 'Rui', role: 'armazem', ativo: true, ultimoLogin: null, criadoEm: '', login: '900', semEmail: true, mfa: false },
]
vi.mock('@/features/auth/hooks/useUtilizadores', () => ({
  useCriarUtilizador: () => ({ criar: m.criar, loading: false, error: m.erro }),
  useRedefinirSenha: () => ({ redefinir: vi.fn(async () => true), loading: false }),
  useUtilizadores: () => ({ utilizadores: utilizadoresMock, loading: false, error: null, reload: vi.fn() }),
  useAlterarPapel: () => ({ alterar: vi.fn(), loading: false }),
  useDesativarUtilizador: () => ({ desativar: vi.fn(), loading: false }),
  useReativarUtilizador: () => ({ reativar: vi.fn(), loading: false }),
  useRemoverMfa: () => ({ remover: vi.fn(), loading: false }),
  useLinkRecuperacao: () => ({ gerar: m.gerar, loading: false, error: null }),
}))
vi.mock('@/features/auth/services/mfaService', () => ({
  nivelMfa: async () => ({ atual: 'aal2' }),
  mfaObrigatorio: async () => false,
  definirMfaObrigatorio: vi.fn(),
}))
vi.mock('@/app/components/EnviarWhatsAppDialog', () => ({
  EnviarWhatsAppDialog: ({ open, texto, numeroInicial }: { open: boolean; texto: string; numeroInicial?: string }) =>
    open ? <div data-testid="wa" data-numero={numeroInicial}>{texto}</div> : null,
}))
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'x' } }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

afterEach(cleanup)
import { NovoUtilizadorModal, GestaoUtilizadoresPage } from '@/app/pages/GestaoUtilizadoresPage'

beforeEach(() => { m.criar.mockClear(); m.gerar.mockClear(); m.erro = null })

describe('Link de recuperação', () => {
  it('não aparece para o próprio utilizador', () => {
    render(<GestaoUtilizadoresPage />)
    fireEvent.click(screen.getAllByRole('button').filter(b => b.querySelector('svg.lucide-ellipsis-vertical, svg.lucide-more-vertical'))[0])
    expect(screen.queryByText('Link de recuperação')).toBeNull()
  })

  it('gera o link, permite copiar e enviar por WhatsApp', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<GestaoUtilizadoresPage />)
    fireEvent.click(screen.getAllByRole('button').filter(b => b.querySelector('svg.lucide-ellipsis-vertical, svg.lucide-more-vertical'))[1])
    fireEvent.click(screen.getByText('Link de recuperação'))
    await waitFor(() => expect(m.gerar).toHaveBeenCalledWith('u2'))
    expect(await screen.findByText(/válido cerca de 1 hora/)).toBeTruthy()
    expect(screen.getByText('Não abra este link neste aparelho — entraria com a conta desta pessoa.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Copiar link' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://l'))
    fireEvent.click(screen.getByRole('button', { name: /Enviar por WhatsApp/ }))
    const wa = screen.getByTestId('wa')
    expect(wa.getAttribute('data-numero')).toBe('912345678')
    expect(wa.textContent).toContain('Olá Rui')
  })
})

function preencher() {
  fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: 'Ana' } })
  fireEvent.change(screen.getByLabelText(/^Utilizador/), { target: { value: 'Ana Costa' } })
}

describe('NovoUtilizadorModal', () => {
  it('senha curta desativa o botão e avisa', () => {
    render(<NovoUtilizadorModal onClose={() => {}} onSuccess={() => {}} />)
    preencher()
    fireEvent.change(screen.getByLabelText(/^Senha/), { target: { value: 'abc' } })
    expect((screen.getByRole('button', { name: 'Criar conta' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/pelo menos 12 caracteres, uma maiúscula e um algarismo/)).toBeTruthy()
  })

  it('senha válida cria a conta com o login normalizado', async () => {
    render(<NovoUtilizadorModal onClose={() => {}} onSuccess={() => {}} />)
    preencher()
    fireEvent.change(screen.getByLabelText(/^Senha/), { target: { value: 'Abcdefgh1234' } })
    expect(screen.getByText(/Entra com: ana\.costa/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
    await waitFor(() => expect(m.criar).toHaveBeenCalledWith({ nome: 'Ana', login: 'ana.costa', senha: 'Abcdefgh1234', role: 'leitura' }))
  })

  it('mostra a mensagem de erro específica da Edge Function', () => {
    m.erro = 'Este email/utilizador já está registado no sistema.'
    render(<NovoUtilizadorModal onClose={() => {}} onSuccess={() => {}} />)
    expect(screen.getByRole('alert').textContent).toBe('Este email/utilizador já está registado no sistema.')
  })

  it('Gerar preenche a senha com 14 caracteres, visível', () => {
    render(<NovoUtilizadorModal onClose={() => {}} onSuccess={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gerar' }))
    const input = screen.getByLabelText(/^Senha/) as HTMLInputElement
    expect(input.value).toHaveLength(14)
    expect(input.type).toBe('text')
  })
})
