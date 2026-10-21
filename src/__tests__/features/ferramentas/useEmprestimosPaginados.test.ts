import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor, cleanup } from '@testing-library/react'

const m = vi.hoisted(() => ({ listar: vi.fn() }))

vi.mock('@/features/ferramentas/services/emprestimosService', () => ({
  LOANS_PAGE_SIZE: 50,
  listarEmprestimos: vi.fn(),
  listarEmprestimosPaginados: m.listar,
  registarEmprestimo: vi.fn(),
  registarDevolucao: vi.fn(),
}))

import { useEmprestimosPaginados } from '@/features/ferramentas/hooks/useEmprestimos'
import { clearAsyncCache, invalidateCache } from '@/app/lib/useAsync'

beforeEach(() => {
  clearAsyncCache()
  m.listar.mockReset()
  m.listar.mockImplementation(async (_f: unknown, page: number) => ({ data: [{ id: `e${page}` }], count: 120 }))
})

afterEach(cleanup)

describe('useEmprestimosPaginados', () => {
  it('carrega a página pedida com os filtros e calcula o total de páginas', async () => {
    const { result } = renderHook(() => useEmprestimosPaginados({ estado: 'ativo' }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(m.listar).toHaveBeenLastCalledWith({ estado: 'ativo' }, 0)
    expect(result.current).toMatchObject({ loans: [{ id: 'e0' }], count: 120, page: 0, totalPages: 3 })

    act(() => result.current.setPage(2))
    await waitFor(() => expect(result.current.loans).toEqual([{ id: 'e2' }]))
    expect(m.listar).toHaveBeenLastCalledWith({ estado: 'ativo' }, 2)
  })

  it('mudar os filtros volta à primeira página sem pedir a página antiga com os filtros novos', async () => {
    const { result, rerender } = renderHook(({ f }) => useEmprestimosPaginados(f), { initialProps: { f: { estado: 'ativo' as const } } })
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.setPage(1))
    await waitFor(() => expect(result.current.page).toBe(1))
    rerender({ f: { estado: 'devolvido' as const } } as never)
    await waitFor(() => expect(m.listar).toHaveBeenLastCalledWith({ estado: 'devolvido' }, 0))
    expect(result.current.page).toBe(0)
    expect(m.listar).not.toHaveBeenCalledWith({ estado: 'devolvido' }, 1)
  })

  it('usa o cache partilhado: invalidar emprestimos-* recarrega', async () => {
    const { result } = renderHook(() => useEmprestimosPaginados({}))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const n = m.listar.mock.calls.length
    act(() => invalidateCache('emprestimos-*'))
    await waitFor(() => expect(m.listar.mock.calls.length).toBe(n + 1))
  })
})
