import { useState, useCallback } from 'react'

import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  listarEmprestimos,
  listarEmprestimosPaginados,
  registarEmprestimo,
  registarDevolucao,
  LOANS_PAGE_SIZE,
  type FiltrosEmprestimos,
  type Emprestimo,
} from '../services/emprestimosService'

export function useEmprestimos(filtros: FiltrosEmprestimos = {}) {
  const key = JSON.stringify(filtros)
  const { data, loading, error, reload } = useAsync(
    () => listarEmprestimos(filtros), [key],
    { cacheKey: `emprestimos-${key}`, errorMsg: 'Erro ao carregar empréstimos' }
  )
  return { loans: data ?? [], loading, error, reload }
}

export function useEmprestimosPaginados(filtros: FiltrosEmprestimos = {}) {
  const filtrosKey = JSON.stringify(filtros)
  // A página guarda os filtros a que pertence: filtros novos começam na 0 logo no
  // primeiro render, sem pedir a página antiga com os filtros novos.
  const [pagina, setPagina] = useState({ filtros: filtrosKey, n: 0 })
  const page = pagina.filtros === filtrosKey ? pagina.n : 0
  const setPage = useCallback((n: number) => setPagina({ filtros: filtrosKey, n }), [filtrosKey])

  const chave = `${filtrosKey}|${page}`
  const { data, loading, error, reload } = useAsync(
    () => listarEmprestimosPaginados(filtros, page), [chave],
    { cacheKey: `emprestimos-pag-${chave}`, errorMsg: 'Erro ao carregar empréstimos' }
  )
  const count = data?.count ?? 0

  return {
    loans: data?.data ?? ([] as Emprestimo[]), count, page,
    totalPages: Math.ceil(count / LOANS_PAGE_SIZE),
    loading, error, setPage, reload,
  }
}

const INV_EMPRESTIMOS = ['emprestimos-*', 'ferramentas-ativas', 'ferramentas-arquivadas', 'ferramentas-todas', 'ferramenta-*']

export function useRegistarEmprestimo() {
  const { mutate: registar, loading, error } = useMutation(
    registarEmprestimo, 'Erro ao registar empréstimo',
    { invalidates: INV_EMPRESTIMOS }
  )
  return { registar, loading, error }
}

export function useRegistarDevolucao() {
  const { mutate: devolver, loading, error } = useMutation(
    registarDevolucao, 'Erro ao registar devolução',
    { invalidates: INV_EMPRESTIMOS }
  )
  return { devolver, loading, error }
}
