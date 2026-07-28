import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  listarObras, buscarObra, criarObra, atualizarObra,
  type AtualizarObra,
} from '../services/obrasService'

export function useObras(apenasAtivas = true) {
  const { data, loading, error, reload } = useAsync(
    () => listarObras(apenasAtivas), [apenasAtivas],
    { errorMsg: 'Erro ao carregar obras' }
  )
  return { obras: data ?? [], loading, error, reload }
}

export function useObra(id: string | undefined) {
  const { data: obra, loading, error, reload } = useAsync(
    () => buscarObra(id!), [id],
    { enabled: !!id, errorMsg: 'Obra não encontrada' }
  )
  return { obra, loading, error, reload }
}

export function useCriarObra() {
  const { mutate: criar, loading, error } = useMutation(criarObra, 'Erro ao criar obra')
  return { criar, loading, error }
}

export function useAtualizarObra() {
  const { mutate: atualizar, loading, error } = useMutation(
    (id: string, input: AtualizarObra) => atualizarObra(id, input),
    'Erro ao atualizar obra'
  )
  return { atualizar, loading, error }
}
