import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  listarEntregas, listarObrasAtivas, entregarViatura, devolverViatura,
} from '../services/entregasService'

// Entregar/devolver muda o estado das viaturas, as fichas e as linhas do tempo
const INVALIDA = ['frota-*', 'alertas-*']

export function useEntregas(enabled = true) {
  const { data, loading, error, reload } = useAsync(() => listarEntregas(), [],
    { enabled, cacheKey: 'frota-entregas', cacheTtl: 15_000, errorMsg: 'Não foi possível carregar as entregas' })
  return { entregas: data ?? [], loading, error, reload }
}

export function useObrasAtivas() {
  const { data, loading } = useAsync(listarObrasAtivas, [],
    { cacheKey: 'frota-obras-ativas', errorMsg: 'Não foi possível carregar as obras' })
  return { obras: data ?? [], loading }
}

export function useEntregarViatura() {
  const { mutate: entregar, loading, error } = useMutation(entregarViatura, 'Erro ao entregar a viatura', { invalidates: INVALIDA })
  return { entregar, loading, error }
}

export function useDevolverViatura() {
  const { mutate: devolver, loading, error } = useMutation(devolverViatura, 'Erro ao registar a devolução', { invalidates: INVALIDA })
  return { devolver, loading, error }
}
