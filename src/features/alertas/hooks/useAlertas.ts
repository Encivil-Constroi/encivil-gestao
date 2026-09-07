import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  listarAlertasAtivos,
  listarTodosAlertas,
  reconhecerAlerta,
  resolverAlerta,
  avaliarAlertas,
} from '../services/alertasService'

export function useAlertasAtivos() {
  const { data, loading, error, reload } = useAsync(
    () => listarAlertasAtivos(),
    [],
    { errorMsg: 'Não foi possível carregar alertas' }
  )
  return { alertas: data ?? [], loading, error, reload }
}

export function useTodosAlertas() {
  const { data, loading, error, reload } = useAsync(
    () => listarTodosAlertas(),
    [],
    { errorMsg: 'Não foi possível carregar alertas' }
  )
  return { alertas: data ?? [], loading, error, reload }
}

export function useReconhecerAlerta() {
  const { mutate, loading } = useMutation(
    async (id: string): Promise<true> => { await reconhecerAlerta(id); return true }
  )
  const reconhecer = async (id: string) => (await mutate(id)) === true
  return { reconhecer, loading }
}

export function useResolverAlerta() {
  const { mutate, loading } = useMutation(
    async (id: string): Promise<true> => { await resolverAlerta(id); return true }
  )
  const resolver = async (id: string) => (await mutate(id)) === true
  return { resolver, loading }
}

export function useAvaliarAlertas() {
  const { mutate: avaliar, loading } = useMutation(avaliarAlertas, 'Erro ao avaliar alertas')
  return { avaliar, loading }
}
