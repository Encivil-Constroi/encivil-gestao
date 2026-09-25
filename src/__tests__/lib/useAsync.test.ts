import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useAsync, invalidateCache } from '@/app/lib/useAsync'

describe('useAsync', () => {
  it('faz fetch e retorna os dados', async () => {
    const fn = vi.fn().mockResolvedValue(['a', 'b'])
    const { result } = renderHook(() => useAsync(fn, []))

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.data).toEqual(['a', 'b'])
    expect(result.current.error).toBeNull()
    expect(fn).toHaveBeenCalledOnce()
  })

  it('captura mensagem de erro de instâncias Error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('network fail'))
    const { result } = renderHook(() => useAsync(fn, []))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.data).toBeNull()
    expect(result.current.error).toBe('network fail')
  })

  it('usa errorMsg de fallback para throws não-Error', async () => {
    const fn = vi.fn().mockRejectedValue('string qualquer')
    const { result } = renderHook(() => useAsync(fn, [], { errorMsg: 'Fallback' }))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBe('Fallback')
  })

  it('não faz fetch quando enabled é false', () => {
    const fn = vi.fn()
    const { result } = renderHook(() => useAsync(fn, [], { enabled: false }))

    expect(result.current.loading).toBe(false)
    expect(result.current.data).toBeNull()
    expect(fn).not.toHaveBeenCalled()
  })

  it('reload() executa o fetch de novo', async () => {
    const fn = vi.fn().mockResolvedValue('fresh')
    const { result } = renderHook(() => useAsync(fn, []))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fn).toHaveBeenCalledTimes(1)

    await act(async () => { result.current.reload() })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fn).toHaveBeenCalledTimes(2)
    expect(result.current.data).toBe('fresh')
  })

  it('invalidateCache recarrega hooks montados com cacheKey correspondente, sem loading', async () => {
    const fn = vi.fn().mockResolvedValueOnce(['antigo']).mockResolvedValueOnce(['novo'])
    const { result } = renderHook(() => useAsync(fn, [], { cacheKey: 'teste-lista-mes' }))
    await waitFor(() => expect(result.current.data).toEqual(['antigo']))

    const estadosLoading: boolean[] = []
    act(() => { invalidateCache('teste-lista-*') })
    estadosLoading.push(result.current.loading)

    await waitFor(() => expect(result.current.data).toEqual(['novo']))
    expect(fn).toHaveBeenCalledTimes(2)
    expect(estadosLoading).toEqual([false])
  })

  it('invalidateCache ignora hooks com cacheKey diferente', async () => {
    const fn = vi.fn().mockResolvedValue('x')
    const { result } = renderHook(() => useAsync(fn, [], { cacheKey: 'outra-chave' }))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => { invalidateCache('teste-*') })

    expect(fn).toHaveBeenCalledTimes(1)
  })
})
