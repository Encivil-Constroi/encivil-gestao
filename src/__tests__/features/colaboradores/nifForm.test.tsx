import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import type { Colaborador } from '@/app/types'

const m = vi.hoisted(() => ({
  papel: 'admin' as 'admin' | 'gestor' | 'leitura',
  nif: '123456789' as string | null,
  nifPedido: [] as boolean[],
  atualizar: vi.fn(async (_id: string, _p: Record<string, unknown>) => ({ id: 'c1' })),
}))

vi.mock('@/features/auth/useRole', () => ({
  useRole: () => ({ isAdmin: m.papel === 'admin', isGestor: m.papel === 'gestor' }),
}))
vi.mock('@/features/auth/hooks/useUtilizadores', () => ({ useUtilizadores: () => ({ utilizadores: [] }) }))
vi.mock('@/features/obras/hooks/useObras', () => ({ useObras: () => ({ obras: [] }) }))
vi.mock('@/features/colaboradores/hooks/useColaboradores', () => ({
  useGuardarColaborador: () => ({ criar: vi.fn(), atualizar: m.atualizar, loading: false }),
  useContasApp: () => ({ contas: [], loading: false }),
  useColaboradores: () => ({ colaboradores: [] }),
  useNifColaborador: (_id: string | undefined, enabled: boolean) => {
    m.nifPedido.push(enabled)
    return { nif: enabled ? m.nif : null, loading: false }
  },
}))

import { ColaboradorDrawer } from '@/features/colaboradores/components/ColaboradorDrawer'

const colab: Colaborador = { id: 'c1', nome: 'Rui', numeroMecan: 'M1', cargo: 'Motorista', ativo: true, createdAt: new Date() }
const guardar = () => fireEvent.click(screen.getByRole('button', { name: 'Guardar Alterações' }))

beforeEach(() => { m.papel = 'admin'; m.nif = '123456789'; m.nifPedido = []; m.atualizar.mockClear() })
afterEach(cleanup)

describe('NIF no formulário do colaborador', () => {
  it('admin vê o NIF carregado à parte', async () => {
    render(<ColaboradorDrawer colaborador={colab} onClose={() => {}} onSaved={() => {}} />)
    await waitFor(() => expect(screen.getByLabelText(/NIF/)).toHaveValue('123456789'))
  })

  it('guardar sem mexer no NIF não envia o campo nif', async () => {
    render(<ColaboradorDrawer colaborador={colab} onClose={() => {}} onSaved={() => {}} />)
    guardar()
    await waitFor(() => expect(m.atualizar).toHaveBeenCalled())
    expect(m.atualizar.mock.calls[0][1]).not.toHaveProperty('nif')
  })

  it('NIF não carregado (BD/RPC falhou) e não mexido: não o apaga', async () => {
    m.nif = null
    render(<ColaboradorDrawer colaborador={colab} onClose={() => {}} onSaved={() => {}} />)
    guardar()
    await waitFor(() => expect(m.atualizar).toHaveBeenCalled())
    expect(m.atualizar.mock.calls[0][1]).not.toHaveProperty('nif')
  })

  it('NIF alterado é enviado', async () => {
    render(<ColaboradorDrawer colaborador={colab} onClose={() => {}} onSaved={() => {}} />)
    fireEvent.change(screen.getByLabelText(/NIF/), { target: { value: '999888777' } })
    guardar()
    await waitFor(() => expect(m.atualizar).toHaveBeenCalledWith('c1', expect.objectContaining({ nif: '999888777' })))
  })

  it('quem não é admin/gestor não pede o NIF e vê o campo oculto', async () => {
    m.papel = 'leitura'
    render(<ColaboradorDrawer colaborador={colab} onClose={() => {}} onSaved={() => {}} />)
    expect(m.nifPedido.every(e => e === false)).toBe(true)
    expect(screen.getByPlaceholderText('Só visível para administração')).toBeDisabled()
  })
})
