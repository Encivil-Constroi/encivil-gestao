import { useState, useEffect, useCallback } from 'react'
import type { ToolLoan } from '@/app/types'
import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  listarEmprestimos,
  listarEmprestimosPaginados,
  registarEmprestimo,
  registarDevolucao,
  LOANS_PAGE_SIZE,
  type FiltrosEmprestimos,
} from '../services/emprestimosService'

export function useEmprestimos(filtros: FiltrosEmprestimos = {}) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const key = JSON.stringify(filtros)
  const { data, loading, error, reload } = useAsync(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    () => listarEmprestimos(filtros), [key],
    { errorMsg: 'Erro ao carregar empréstimos' }
  )
  return { loans: data ?? [], loading, error, reload }
}

// Pagination is stateful — keep manual implementation
export function useEmprestimosPaginados(filtros: FiltrosEmprestimos = {}) {
  const [loans, setLoans] = useState<ToolLoan[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filtrosKey = JSON.stringify(filtros)
  useEffect(() => { setPage(0) }, [filtrosKey])

  const load = useCallback(async (targetPage: number) => {
    setLoading(true)
    setError(null)
    try {
      const result = await listarEmprestimosPaginados(filtros, targetPage)
      setLoans(result.data)
      setCount(result.count)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar empréstimos')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrosKey])

  useEffect(() => { load(page) }, [load, page])

  return {
    loans, count, page,
    totalPages: Math.ceil(count / LOANS_PAGE_SIZE),
    loading, error, setPage,
    reload: () => load(page),
  }
}

export function useRegistarEmprestimo() {
  const { mutate: registar, loading, error } = useMutation(
    registarEmprestimo, 'Erro ao registar empréstimo'
  )
  return { registar, loading, error }
}

export function useRegistarDevolucao() {
  const { mutate: devolver, loading, error } = useMutation(
    registarDevolucao, 'Erro ao registar devolução'
  )
  return { devolver, loading, error }
}
