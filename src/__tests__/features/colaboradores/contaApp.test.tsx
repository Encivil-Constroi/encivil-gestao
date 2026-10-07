import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import type { Colaborador } from '@/app/types'

const m = vi.hoisted(() => ({
  admin: true,
  atualizar: vi.fn(async (_id: string, _p: Record<string, unknown>) => ({ id: 'c1' })),
  criar: vi.fn(async (_p: Record<string, unknown>) => ({ id: 'c2' })),
  contasPedidas: [] as boolean[],
}))

vi.mock('@/features/auth/useRole', () => ({ useRole: () => ({ isAdmin: m.admin }) }))
vi.mock('@/features/auth/hooks/useUtilizadores', () => ({ useUtilizadores: () => ({ utilizadores: [] }) }))
vi.mock('@/features/obras/hooks/useObras', () => ({ useObras: () => ({ obras: [] }) }))
vi.mock('@/features/colaboradores/hooks/useColaboradores', () => ({
  useGuardarColaborador: () => ({ criar: m.criar, atualizar: m.atualizar, loading: false }),
  useContasApp: (ativo: boolean) => {
    m.contasPedidas.push(ativo)
    return { contas: ativo ? [{ id: 'u1', nome: 'Zé Gaitas', role: 'motorista' }, { id: 'u2', nome: 'Rui', role: 'motorista' }] : [], loading: false }
  },
  useColaboradores: () => ({ colaboradores: [{ id: 'c9', nome: 'Rui Costa', userId: 'u2' }] }),
  useNifColaborador: () => ({ nif: null, loading: false }),
}))

vi.mock('@/features/colaboradores/components/DadosLaboraisSecao', () => ({ DadosLaboraisSecao: () => null }))

import { ColaboradorDrawer } from '@/features/colaboradores/components/ColaboradorDrawer'

const colab: Colaborador = {
  id: 'c1', nome: 'Zé Gaitas', numeroMecan: 'M1', cargo: 'Motorista', ativo: true, createdAt: new Date(),
}

beforeEach(() => { m.admin = true; m.atualizar.mockClear(); m.criar.mockClear(); m.contasPedidas = [] })
afterEach(cleanup)

describe('conta na app do colaborador', () => {
  it('admin liga a conta; a que já está ligada a outro vem assinalada', async () => {
    render(<ColaboradorDrawer colaborador={colab} onClose={() => {}} onSaved={() => {}} />)
    const sel = screen.getByLabelText(/Conta na app/)
    expect(screen.getByRole('option', { name: 'Rui (já ligada a Rui Costa)' })).toBeInTheDocument()
    fireEvent.change(sel, { target: { value: 'u1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Alterações' }))
    await waitFor(() => expect(m.atualizar).toHaveBeenCalledWith('c1', expect.objectContaining({ userId: 'u1' })))
  })

  it('admin desliga a conta (fica null)', async () => {
    render(<ColaboradorDrawer colaborador={{ ...colab, userId: 'u1' }} onClose={() => {}} onSaved={() => {}} />)
    expect(screen.getByLabelText(/Conta na app/)).toHaveValue('u1')
    fireEvent.change(screen.getByLabelText(/Conta na app/), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Alterações' }))
    await waitFor(() => expect(m.atualizar).toHaveBeenCalledWith('c1', expect.objectContaining({ userId: null })))
  })

  it('gestor não vê o campo, não lê os perfis e não mexe na ligação', async () => {
    m.admin = false
    render(<ColaboradorDrawer colaborador={{ ...colab, userId: 'u1' }} onClose={() => {}} onSaved={() => {}} />)
    expect(screen.queryByLabelText(/Conta na app/)).not.toBeInTheDocument()
    expect(m.contasPedidas.every(a => a === false)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Alterações' }))
    await waitFor(() => expect(m.atualizar).toHaveBeenCalled())
    expect(m.atualizar.mock.calls[0][1]).not.toHaveProperty('userId')
  })
})
