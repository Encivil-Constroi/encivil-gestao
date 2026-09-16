import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  listarTiposFalta, listarFaltas, criarFalta, atualizarEstadoFalta,
  type NovaFalta, type EstadoFalta,
} from '../services/faltasService'

const CACHE_TIPOS  = 'tipos-falta'
const CACHE_FALTAS = 'faltas-todas'
const CACHE_LISTAS = [CACHE_FALTAS]

export function useTiposFalta() {
  const { data, loading, error } = useAsync(
    listarTiposFalta, [],
    { errorMsg: 'Erro ao carregar tipos de falta', cacheKey: CACHE_TIPOS, cacheTtl: 300_000 }
  )
  return { tipos: data ?? [], loading, error }
}

export function useFaltas(colaboradorId?: string) {
  const { data, loading, error, reload } = useAsync(
    () => listarFaltas(colaboradorId), [colaboradorId],
    { errorMsg: 'Erro ao carregar faltas', cacheKey: colaboradorId ? `faltas-${colaboradorId}` : CACHE_FALTAS }
  )
  return { faltas: data ?? [], loading, error, reload }
}

export function useRegistarFalta() {
  const { mutate: registar, loading, error } = useMutation(
    (input: NovaFalta) => criarFalta(input),
    'Erro ao registar falta',
    { invalidates: CACHE_LISTAS }
  )
  return { registar, loading, error }
}

export function useAtualizarEstadoFalta() {
  const { mutate, loading, error } = useMutation(
    (id: string, estado: EstadoFalta, decididaPor?: string) =>
      atualizarEstadoFalta(id, estado, decididaPor),
    'Erro ao atualizar estado da falta',
    { invalidates: CACHE_LISTAS }
  )
  return { atualizar: mutate, loading, error }
}
