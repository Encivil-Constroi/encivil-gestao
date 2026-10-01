import { useAsync } from '@/app/lib/useAsync'
import { listarMovimentos, type FiltrosMovimentos } from '../services/movimentosService'

export function useMovimentos(filtros: FiltrosMovimentos = {}) {
  const key = JSON.stringify(filtros)
  const { data, loading, error, reload } = useAsync(
    () => listarMovimentos(filtros), [key],
    { cacheKey: `movimentos-${key}`, errorMsg: 'Erro ao carregar movimentos' }
  )
  return { movements: data ?? [], loading, error, reload }
}
