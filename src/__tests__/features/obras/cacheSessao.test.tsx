import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { clearAsyncCache, useAsync } from '@/app/lib/useAsync'

afterEach(() => { cleanup(); if (clearAsyncCache) clearAsyncCache() })
describe('isolamento de cache na mudança de sessão', () => {
  it('limpa e recarrega consultas que permanecem montadas na troca de identidade', async () => {
    let sessao = 'A'
    const { result } = renderHook(() => useAsync(async () => sessao, [], { cacheKey: 'obra-visao-montada' }))
    await waitFor(() => expect(result.current.data).toBe('A'))
    act(() => { sessao = 'B'; clearAsyncCache() })
    expect(result.current.data).toBeNull()
    await waitFor(() => expect(result.current.data).toBe('B'))
  })
  it('não reutiliza a visão em cache de outra sessão', async () => {
    const first = renderHook(() => useAsync(async () => 'sessão A', [], { cacheKey: 'obra-visao-sessao' }))
    await waitFor(() => expect(first.result.current.data).toBe('sessão A'))
    first.unmount()
    act(() => clearAsyncCache())
    const second = renderHook(() => useAsync(async () => 'sessão B', [], { cacheKey: 'obra-visao-sessao' }))
    expect(second.result.current.data).not.toBe('sessão A')
    await waitFor(() => expect(second.result.current.data).toBe('sessão B'))
  })
  it('uma resposta antiga em voo não repovoa o cache depois de encerrar sessão', async () => {
    let concluir!: (data: string) => void
    const first = renderHook(() => useAsync(() => new Promise<string>(resolve => { concluir = resolve }), [], { cacheKey: 'obra-visao-pendente' }))
    const concluirAnterior = concluir
    act(() => clearAsyncCache())
    await act(async () => concluirAnterior('dados anteriores'))
    first.unmount()
    const second = renderHook(() => useAsync(async () => 'dados atuais', [], { cacheKey: 'obra-visao-pendente' }))
    expect(second.result.current.data).not.toBe('dados anteriores')
    await waitFor(() => expect(second.result.current.data).toBe('dados atuais'))
  })
})
