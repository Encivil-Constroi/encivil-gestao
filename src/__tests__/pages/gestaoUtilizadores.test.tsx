import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const m = vi.hoisted(() => ({
  criar: vi.fn(async () => ({ userId: 'u1', email: 'ana.costa@contas.encivilconstroi.com' })),
  erro: null as string | null,
}))
vi.mock('@/features/auth/hooks/useUtilizadores', () => ({
  useCriarUtilizador: () => ({ criar: m.criar, loading: false, error: m.erro }),
  useRedefinirSenha: () => ({ redefinir: vi.fn(async () => true), loading: false }),
  useUtilizadores: () => ({ utilizadores: [], loading: false, error: null, reload: vi.fn() }),
  useAlterarPapel: () => ({ alterar: vi.fn(), loading: false }),
  useDesativarUtilizador: () => ({ desativar: vi.fn(), loading: false }),
  useReativarUtilizador: () => ({ reativar: vi.fn(), loading: false }),
}))
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'x' } }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

afterEach(cleanup)
import { NovoUtilizadorModal } from '@/app/pages/GestaoUtilizadoresPage'

beforeEach(() => { m.criar.mockClear(); m.erro = null })

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
    expect(screen.getByText(/pelo menos 8 caracteres/)).toBeTruthy()
  })

  it('senha válida cria a conta com o login normalizado', async () => {
    render(<NovoUtilizadorModal onClose={() => {}} onSuccess={() => {}} />)
    preencher()
    fireEvent.change(screen.getByLabelText(/^Senha/), { target: { value: 'abcdefgh' } })
    expect(screen.getByText(/Entra com: ana\.costa/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
    await waitFor(() => expect(m.criar).toHaveBeenCalledWith({ nome: 'Ana', login: 'ana.costa', senha: 'abcdefgh', role: 'leitura' }))
  })

  it('mostra a mensagem de erro específica da Edge Function', () => {
    m.erro = 'Este email/utilizador já está registado no sistema.'
    render(<NovoUtilizadorModal onClose={() => {}} onSuccess={() => {}} />)
    expect(screen.getByRole('alert').textContent).toBe('Este email/utilizador já está registado no sistema.')
  })

  it('Gerar preenche a senha com 12 caracteres, visível', () => {
    render(<NovoUtilizadorModal onClose={() => {}} onSuccess={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gerar' }))
    const input = screen.getByLabelText(/^Senha/) as HTMLInputElement
    expect(input.value).toHaveLength(12)
    expect(input.type).toBe('text')
  })
})
