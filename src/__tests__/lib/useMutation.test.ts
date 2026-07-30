import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useMutation } from '@/app/lib/useMutation'

describe('useMutation', () => {
  it('retorna resultado em caso de sucesso', async () => {
    const fn = vi.fn().mockResolvedValue({ id: '1' })
    const { result } = renderHook(() => useMutation(fn))

    let value: unknown
    await act(async () => { value = await result.current.mutate() })

    expect(value).toEqual({ id: '1' })
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('loading é true durante a execução assíncrona', async () => {
    let resolve!: (v: string) => void
    const fn = vi.fn().mockReturnValue(new Promise<string>(r => { resolve = r }))
    const { result } = renderHook(() => useMutation(fn))

    act(() => { void result.current.mutate() })
    expect(result.current.loading).toBe(true)

    await act(async () => { resolve('done') })
    expect(result.current.loading).toBe(false)
  })

  it('retorna null e define error em caso de falha', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('save failed'))
    const { result } = renderHook(() => useMutation(fn))

    let value: unknown
    await act(async () => { value = await result.current.mutate() })

    expect(value).toBeNull()
    expect(result.current.error).toBe('save failed')
  })

  it('usa errorMsg de fallback para throws não-Error', async () => {
    const fn = vi.fn().mockRejectedValue('not an error object')
    const { result } = renderHook(() => useMutation(fn, 'Fallback msg'))

    await act(async () => { await result.current.mutate() })

    expect(result.current.error).toBe('Fallback msg')
  })

  it('limpa o erro anterior na próxima chamada', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('primeiro erro'))
      .mockResolvedValueOnce('ok')
    const { result } = renderHook(() => useMutation(fn))

    await act(async () => { await result.current.mutate() })
    expect(result.current.error).toBe('primeiro erro')

    await act(async () => { await result.current.mutate() })
    expect(result.current.error).toBeNull()
  })

  it('aceita múltiplos argumentos tipados', async () => {
    const fn = vi.fn((a: number, b: string) => Promise.resolve(`${a}-${b}`))
    const { result } = renderHook(() => useMutation(fn))

    let value: unknown
    await act(async () => { value = await result.current.mutate(42, 'test') })

    expect(value).toBe('42-test')
    expect(fn).toHaveBeenCalledWith(42, 'test')
  })
})
