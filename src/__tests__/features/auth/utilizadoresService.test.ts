import { describe, it, expect, vi, beforeEach } from 'vitest'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke } },
}))

import { criarUtilizador, redefinirSenha } from '@/features/auth/services/utilizadoresService'

describe('utilizadoresService', () => {
  beforeEach(() => invoke.mockReset())

  it('mostra a mensagem do corpo quando a Edge Function devolve 400', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'Edge Function returned a non-2xx status code',
      context: new Response(JSON.stringify({ erro: 'Este email/utilizador já está registado no sistema.' }), { status: 400 }) } })
    await expect(criarUtilizador({ nome: 'X', role: 'leitura', senha: 'Abcdefgh1234', login: 'xx1' }))
      .rejects.toThrow('Este email/utilizador já está registado no sistema.')
  })
  it('criarUtilizador envia action criar', async () => {
    invoke.mockResolvedValue({ data: { sucesso: true, userId: 'u1', email: 'e' }, error: null })
    const r = await criarUtilizador({ nome: 'X', role: 'leitura', senha: 'Abcdefgh1234', login: 'xx1' })
    expect(invoke).toHaveBeenCalledWith('admin-utilizadores', { body: { action: 'criar', payload: expect.objectContaining({ login: 'xx1' }) } })
    expect(r).toEqual({ userId: 'u1', email: 'e' })
  })
  it('redefinirSenha envia action redefinirSenha', async () => {
    invoke.mockResolvedValue({ data: { sucesso: true }, error: null })
    await redefinirSenha('u1', 'Abcdefgh1234')
    expect(invoke).toHaveBeenCalledWith('admin-utilizadores', { body: { action: 'redefinirSenha', payload: { userId: 'u1', senha: 'Abcdefgh1234' } } })
  })
})
