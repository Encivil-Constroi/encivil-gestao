import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  listarSubempreiteiros, listarSubempreiteirosComExecutado, buscarSubempreiteiro,
  criarSubempreiteiro, atualizarSubempreiteiro, eliminarSubempreiteiro,
  arquivarSubempreiteiro, validarSubempreiteiro,
  type AtualizarSubempreiteiro,
} from '../services/subempreiteirosService'

export function useSubempreiteiros(obraId?: string) {
  const { data, loading, error, reload } = useAsync(
    () => listarSubempreiteiros(obraId), [obraId],
    { cacheKey: obraId ? `subs-obra-${obraId}` : 'subs-todos', errorMsg: 'Erro ao carregar subempreiteiros' }
  )
  return { subs: data ?? [], loading, error, reload }
}

export function useSubempreiteirosComExecutado(obraId: string | undefined) {
  const { data, loading, error, reload } = useAsync(
    () => listarSubempreiteirosComExecutado(obraId!), [obraId],
    { enabled: !!obraId, cacheKey: obraId ? `subs-executado-${obraId}` : undefined }
  )
  return { subs: data ?? [], loading, error, reload }
}

export function useSubempreiteiro(id: string | undefined) {
  const { data: sub, loading, error, reload } = useAsync(
    () => buscarSubempreiteiro(id!), [id],
    { enabled: !!id, cacheKey: id ? `sub-${id}` : undefined, errorMsg: 'Contratação não encontrada' }
  )
  return { sub, loading, error, reload }
}

export function useGuardarSubempreiteiro() {
  const criador    = useMutation(criarSubempreiteiro, 'Erro ao guardar', { invalidates: INV_SUBS })
  const atualizador = useMutation(
    (id: string, input: AtualizarSubempreiteiro) => atualizarSubempreiteiro(id, input),
    'Erro ao guardar',
    { invalidates: INV_SUBS }
  )
  return {
    criar:    criador.mutate,
    atualizar: atualizador.mutate,
    loading:  criador.loading || atualizador.loading,
    error:    criador.error   || atualizador.error,
  }
}

const INV_SUBS = ['subs-todos', 'subs-obra-*', 'subs-executado-*', 'sub-*', 'resumo-obras']

export function useValidarSubempreiteiro() {
  const { mutate: validar, loading, error } = useMutation(
    validarSubempreiteiro, 'Erro ao validar',
    { invalidates: INV_SUBS }
  )
  return { validar, loading, error }
}

export function useEliminarSubempreiteiro() {
  const { mutate, loading } = useMutation(
    async (id: string): Promise<true> => { await eliminarSubempreiteiro(id); return true },
    'Erro ao eliminar',
    { invalidates: INV_SUBS }
  )
  const eliminar = async (id: string) => (await mutate(id)) === true
  return { eliminar, loading }
}

export function useArquivarSubempreiteiro() {
  const { mutate, loading } = useMutation(
    async (id: string): Promise<true> => { await arquivarSubempreiteiro(id); return true },
    'Erro ao arquivar',
    { invalidates: INV_SUBS }
  )
  const arquivar = async (id: string) => (await mutate(id)) === true
  return { arquivar, loading }
}
