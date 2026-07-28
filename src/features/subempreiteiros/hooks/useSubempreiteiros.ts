import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  listarSubempreiteiros, listarSubempreiteirosComExecutado, buscarSubempreiteiro,
  criarSubempreiteiro, atualizarSubempreiteiro, eliminarSubempreiteiro, validarSubempreiteiro,
  type AtualizarSubempreiteiro,
} from '../services/subempreiteirosService'

export function useSubempreiteiros(obraId?: string) {
  const { data, loading, error, reload } = useAsync(
    () => listarSubempreiteiros(obraId), [obraId],
    { errorMsg: 'Erro ao carregar subempreiteiros' }
  )
  return { subs: data ?? [], loading, error, reload }
}

export function useSubempreiteirosComExecutado(obraId: string | undefined) {
  const { data, loading, reload } = useAsync(
    () => listarSubempreiteirosComExecutado(obraId!), [obraId],
    { enabled: !!obraId }
  )
  return { subs: data ?? [], loading, reload }
}

export function useSubempreiteiro(id: string | undefined) {
  const { data: sub, loading, error, reload } = useAsync(
    () => buscarSubempreiteiro(id!), [id],
    { enabled: !!id, errorMsg: 'Contratação não encontrada' }
  )
  return { sub, loading, error, reload }
}

export function useGuardarSubempreiteiro() {
  const criador    = useMutation(criarSubempreiteiro, 'Erro ao guardar')
  const atualizador = useMutation(
    (id: string, input: AtualizarSubempreiteiro) => atualizarSubempreiteiro(id, input),
    'Erro ao guardar'
  )
  return {
    criar:    criador.mutate,
    atualizar: atualizador.mutate,
    loading:  criador.loading || atualizador.loading,
    error:    criador.error   || atualizador.error,
  }
}

export function useValidarSubempreiteiro() {
  const { mutate: validar, loading, error } = useMutation(validarSubempreiteiro, 'Erro ao validar')
  return { validar, loading, error }
}

export function useEliminarSubempreiteiro() {
  const { mutate, loading } = useMutation(
    async (id: string): Promise<true> => { await eliminarSubempreiteiro(id); return true }
  )
  const eliminar = async (id: string) => (await mutate(id)) === true
  return { eliminar, loading }
}
