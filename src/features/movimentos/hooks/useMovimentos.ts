import { useState, useEffect, useCallback, useRef } from 'react'
import type { Movement } from '@/app/types'
import { useAsync, invalidateCache } from '@/app/lib/useAsync'
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
    { cacheKey: `movimentos-${key}`, errorMsg: 'Erro ao carregar movimentos' }
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

  // Proteção contra respostas fora de ordem: quando filtros mudam rapidamente,
  // múltiplas chamadas ficam em voo — apenas a mais recente deve atualizar o estado.
  const loadGenRef = useRef(0)

  const load = useCallback(async (targetPage: number) => {
    const gen = ++loadGenRef.current
    setLoading(true)
    setError(null)
    try {
      const result = await listarMovimentosPaginados(filtros, targetPage)
      if (loadGenRef.current !== gen) return
      setMovements(result.data)
      setCount(result.count)
    } catch (e) {
      if (loadGenRef.current !== gen) return
      setError(e instanceof Error ? e.message : 'Erro ao carregar movimentos')
    } finally {
      if (loadGenRef.current === gen) setLoading(false)
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

  const registar = useCallback(async (input: RegistarMovimentoInput): Promise<RegistarResultado> => {
    setLoading(true)
    setError(null)
    try {
      if (!navigator.onLine) {
        enqueuePendingMovimento(input)
        return { status: 'queued' }
      }
      await registarMovimento(input)
      invalidateCache('produtos-ativos', 'produtos-*', 'dashboard', 'movimentos-*', 'alertas-ativos')
      return { status: 'ok' }
    } catch (e) {
      if (isNetworkError(e)) {
        // Se a fila estiver cheia, enqueuePendingMovimento lança — tratar como erro de negócio
        try {
          enqueuePendingMovimento(input)
          return { status: 'queued' }
        } catch (queueErr) {
          const msg = friendlyErrorMessage(queueErr)
          setError(msg)
          return { status: 'error', message: msg }
        }
      }
      const msg = friendlyErrorMessage(e)
      setError(msg)
      return { status: 'error', message: msg }
    } finally {
      setLoading(false)
    }
  // setLoading/setError são estáveis; imports externos não mudam
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { registar, loading, error }
}
