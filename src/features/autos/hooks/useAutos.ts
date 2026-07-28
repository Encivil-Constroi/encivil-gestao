import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  listarAutos, buscarAuto, criarAuto, atualizarAuto, eliminarAuto, validarAuto,
  type AtualizarAuto,
} from '../services/autosService'

export function useAutos(subId: string | undefined) {
  const { data, loading, error, reload } = useAsync(
    () => listarAutos(subId!), [subId],
    { enabled: !!subId, errorMsg: 'Erro ao carregar autos' }
  )
  return { autos: data ?? [], loading, error, reload }
}

export function useAuto(id: string | undefined) {
  const { data: auto, loading, error, reload } = useAsync(
    () => buscarAuto(id!), [id],
    { enabled: !!id, errorMsg: 'Auto não encontrado' }
  )
  return { auto, loading, error, reload }
}

export function useGuardarAuto() {
  const criador    = useMutation(criarAuto,    'Erro ao guardar')
  const atualizador = useMutation(
    (id: string, input: AtualizarAuto) => atualizarAuto(id, input),
    'Erro ao guardar'
  )
  return {
    criar:    criador.mutate,
    atualizar: atualizador.mutate,
    loading:  criador.loading || atualizador.loading,
    error:    criador.error   || atualizador.error,
  }
}

export function useValidarAuto() {
  const { mutate: validar, loading } = useMutation(validarAuto, 'Erro ao validar')
  return { validar, loading }
}

export function useEliminarAuto() {
  const { mutate, loading } = useMutation(
    async (id: string): Promise<true> => { await eliminarAuto(id); return true }
  )
  const eliminar = async (id: string) => (await mutate(id)) === true
  return { eliminar, loading }
}
