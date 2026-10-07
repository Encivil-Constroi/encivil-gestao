import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import type { Utilizador } from '@/features/auth/services/utilizadoresService'

const m = vi.hoisted(() => ({
  listar: vi.fn(), remover: vi.fn(), nivel: vi.fn(), obrig: vi.fn(), definir: vi.fn(),
}))
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'eu' } }) }))
vi.mock('@/features/auth/services/utilizadoresService', () => ({
  listarUtilizadores: m.listar, removerMfaUtilizador: m.remover,
  convidarUtilizador: vi.fn(), alterarPapel: vi.fn(), desativarUtilizador: vi.fn(), reativarUtilizador: vi.fn(),
}))
vi.mock('@/features/auth/services/mfaService', () => ({
  nivelMfa: m.nivel, mfaObrigatorio: m.obrig, definirMfaObrigatorio: m.definir,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { GestaoUtilizadoresPage } from '@/app/pages/GestaoUtilizadoresPage'

const u = (o: Partial<Utilizador>): Utilizador => ({
  id: 'x', email: 'x@e.pt', nome: 'X', role: 'gestor', ativo: true,
  ultimoLogin: null, criadoEm: '2026-01-01', mfa: false, login: null, semEmail: false, ...o,
})

beforeEach(() => {
  vi.clearAllMocks()
  m.listar.mockResolvedValue([
    u({ id: 'eu', nome: 'Eu Admin', role: 'admin', mfa: true }),
    u({ id: 'a', nome: 'Ana Gestora', role: 'gestor', mfa: false }),
    u({ id: 'b', nome: 'Bruno Gestor', role: 'gestor', mfa: true }),
    u({ id: 'c', nome: 'Carla Armazem', role: 'armazem', mfa: false }),
  ])
  m.nivel.mockResolvedValue({ atual: 'aal2', seguinte: 'aal2' })
  m.obrig.mockResolvedValue(false)
  m.definir.mockResolvedValue(true)
  m.remover.mockResolvedValue(true)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('Gestão de utilizadores — MFA', () => {
  it('mostra "MFA" e "Sem MFA" só para admin/gestor sem MFA', async () => {
    render(<GestaoUtilizadoresPage />)
    await screen.findByText('Ana Gestora')
    expect(screen.getAllByText('MFA')).toHaveLength(2)
    expect(screen.getAllByText('Sem MFA')).toHaveLength(1)
  })

  it('"Remover MFA" só chama o serviço depois de confirmar', async () => {
    const conf = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    render(<GestaoUtilizadoresPage />)
    await screen.findByText('Bruno Gestor')
    const abrir = () => fireEvent.click(screen.getAllByRole('button').filter(b => b.querySelector('svg.lucide-ellipsis-vertical'))[2])
    abrir(); fireEvent.click(screen.getByText('Remover MFA'))
    expect(m.remover).not.toHaveBeenCalled()
    abrir(); fireEvent.click(screen.getByText('Remover MFA'))
    await waitFor(() => expect(m.remover).toHaveBeenCalledWith('b'))
    expect(conf).toHaveBeenCalledTimes(2)
  })

  it('interruptor desativado com dica quando a sessão é aal1', async () => {
    m.nivel.mockResolvedValue({ atual: 'aal1', seguinte: 'aal1' })
    render(<GestaoUtilizadoresPage />)
    expect(await screen.findByText('Entra com verificação em dois passos para alterar.')).toBeTruthy()
    expect((screen.getByRole('switch') as HTMLInputElement).disabled).toBe(true)
  })

  it('ao ligar avisa quantos admin/gestor ainda não têm MFA', async () => {
    const conf = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<GestaoUtilizadoresPage />)
    await screen.findByText('Ana Gestora')
    const sw = screen.getByRole('switch') as HTMLInputElement
    await waitFor(() => expect(sw.disabled).toBe(false))
    fireEvent.click(sw)
    expect(conf).toHaveBeenCalledWith('1 utilizador(es) admin/gestor ainda não configuraram e vão ter de o fazer no próximo acesso. Continuar?')
    await waitFor(() => expect(m.definir).toHaveBeenCalledWith(true))
  })

  it('se o utilizador cancelar a confirmação, não liga', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<GestaoUtilizadoresPage />)
    await screen.findByText('Ana Gestora')
    const sw = screen.getByRole('switch') as HTMLInputElement
    await waitFor(() => expect(sw.disabled).toBe(false))
    fireEvent.click(sw)
    expect(m.definir).not.toHaveBeenCalled()
  })
})
