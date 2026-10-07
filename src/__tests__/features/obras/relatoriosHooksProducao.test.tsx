import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAsync, invalidateCache } from '@/app/lib/useAsync'
const m = vi.hoisted(() => ({ role: 'leitura', designado: true }))
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'autor' } }) }))
vi.mock('@/features/auth/useRole', () => ({ useRole: () => ({ role: m.role }) }))
vi.mock('@/features/obras/services/relatoriosDiariosService', () => ({
  autorDesignadoParaRelatorio: async () => m.designado,
  submeterRelatorioDiario: async () => true,
  reabrirRelatorioDiario: async () => true,
}))
import { usePodeRelatarObra, useSubmeterRelatorioDiario, useReabrirRelatorioDiario } from '@/features/obras/hooks/useRelatoriosDiarios'
afterEach(() => { cleanup(); invalidateCache('obra-*'); m.role = 'leitura'; m.designado = true })
describe('autorização e consistência dos relatórios', () => {
  it('autor designado leitura pode relatar', async () => {
    const { result } = renderHook(() => usePodeRelatarObra('obra-1'))
    await waitFor(() => expect(result.current).toBe(true))
  })
  it('leitura não designado continua sem escrita', async () => {
    m.designado = false
    const { result } = renderHook(() => usePodeRelatarObra('obra-1'))
    await act(async () => {})
    expect(result.current).toBe(false)
  })
  it.each(['submeter', 'reabrir'])('%s atualiza fotos, atividade e últimos relatórios já em cache', async acao => {
    let versao = 1
    const { result } = renderHook(() => ({
      fotos: useAsync(async () => versao, [], { cacheKey: 'obra-fotos-1' }),
      eventos: useAsync(async () => versao, [], { cacheKey: 'obra-eventos-1' }),
      ultimos: useAsync(async () => versao, [], { cacheKey: 'obra-ultimos-relatorios-1' }),
      submit: useSubmeterRelatorioDiario(), reopen: useReabrirRelatorioDiario(),
    }))
    await waitFor(() => expect(result.current.ultimos.data).toBe(1))
    versao = 2
    await act(async () => { if (acao === 'submeter') await result.current.submit.submeter('r'); else await result.current.reopen.reabrir('r', 'Correção necessária') })
    await waitFor(() => {
      expect(result.current.fotos.data).toBe(2)
      expect(result.current.eventos.data).toBe(2)
      expect(result.current.ultimos.data).toBe(2)
    })
  })
})
