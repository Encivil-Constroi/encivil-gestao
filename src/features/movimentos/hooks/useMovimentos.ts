import { useState, useEffect, useCallback } from 'react'
import type { Movement } from '@/app/types'
import { useAsync } from '@/app/lib/useAsync'
import {
  listarMovimentos,
  listarMovimentosPaginados,
  registarMovimento,
  PAGE_SIZE,
  type FiltrosMovimentos,
  type RegistarMovimentoInput,
} from '../services/movimentosService'
import { enqueuePendingMovimento, isNetworkError, friendlyErrorMessage } from '../offlineQueue'

export function useMovimentos(filtros: FiltrosMovimentos = {}) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const key = JSON.stringify(filtros)
  const { data, loading, error, reload } = useAsync(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    () => listarMovimentos(filtros), [key],
    { errorMsg: 'Erro ao carregar movimentos' }
  )
  return { movements: data ?? [], loading, error, reload }
}

export function useMovimentosPaginados(filtros: FiltrosMovimentos = {}) {
  const [movements, setMovements] = useState<Movement[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Reset to page 0 whenever filters change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filtrosKey = JSON.stringify(filtros)
  useEffect(() => { setPage(0) }, [filtrosKey])

  const load = useCallback(async (targetPage: number) => {
    setLoading(true)
    setError(null)
    try {
      const result = await listarMovimentosPaginados(filtros, targetPage)
      setMovements(result.data)
      setCount(result.count)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar movimentos')
    } finally {
      setLoading(false)
    }
  // filtrosKey + targetPage drive re-fetches; filtros is captured via closure
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrosKey])

  useEffect(() => { load(page) }, [load, page])

  const totalPages = Math.ceil(count / PAGE_SIZE)

  return {
    movements,
    count,
    page,
    totalPages,
    loading,
    error,
    setPage,
    reload: () => load(page),
  }
}

export type RegistarResultado =
  | { status: 'ok' }
  | { status: 'queued' }
  | { status: 'error'; message: string }

export function useRegistarMovimento() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const registar = async (input: RegistarMovimentoInput): Promise<RegistarResultado> => {
    setLoading(true)
    setError(null)
    try {
      if (!navigator.onLine) {
        enqueuePendingMovimento(input)
        return { status: 'queued' }
      }
      await registarMovimento(input)
      return { status: 'ok' }
    } catch (e) {
      if (isNetworkError(e)) {
        enqueuePendingMovimento(input)
        return { status: 'queued' }
      }
      const msg = friendlyErrorMessage(e)
      setError(msg)
      return { status: 'error', message: msg }
    } finally {
      setLoading(false)
    }
  }

  return { registar, loading, error }
}
