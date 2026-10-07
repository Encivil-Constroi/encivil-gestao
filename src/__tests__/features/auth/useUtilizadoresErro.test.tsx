import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const svc = vi.hoisted(() => ({
  criarUtilizador: vi.fn(),
  redefinirSenha: vi.fn(),
}))
vi.mock('@/features/auth/services/utilizadoresService', () => ({
  listarUtilizadores: vi.fn(), convidarUtilizador: vi.fn(), alterarPapel: vi.fn(),
  desativarUtilizador: vi.fn(), reativarUtilizador: vi.fn(),
  criarUtilizador: svc.criarUtilizador, redefinirSenha: svc.redefinirSenha,
}))
vi.mock('@/app/lib/sentry', () => ({ captureError: vi.fn() }))

import { useCriarUtilizador, useRedefinirSenha } from '@/features/auth/hooks/useUtilizadores'

describe('erros de criar/redefinir expostos', () => {
  it('useCriarUtilizador expõe a mensagem da Edge Function', async () => {
    svc.criarUtilizador.mockRejectedValue(new Error('Este email/utilizador já está registado no sistema.'))
    const { result } = renderHook(() => useCriarUtilizador())
    await act(async () => { await result.current.criar({ nome: 'A', role: 'leitura', senha: 'Abcdefgh1234', login: 'a.b' }) })
    await waitFor(() => expect(result.current.error).toBe('Este email/utilizador já está registado no sistema.'))
  })

  it('useRedefinirSenha expõe a mensagem da Edge Function', async () => {
    svc.redefinirSenha.mockRejectedValue(new Error('Senha demasiado fraca. Escolha outra mais forte.'))
    const { result } = renderHook(() => useRedefinirSenha())
    await act(async () => { await result.current.redefinir('u1', 'Abcdefgh1234') })
    await waitFor(() => expect(result.current.error).toBe('Senha demasiado fraca. Escolha outra mais forte.'))
  })
})
