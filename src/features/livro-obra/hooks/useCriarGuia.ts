import { useAsync }   from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  listarGuias,
  criarGuia,
  actualizarEstadoGuia,
  type EstadoGuia,
} from '../services/guiasTransporteService'

function cacheKey(obraId: string) {
  return `guias-obra-${obraId}`
}

export function useGuias(obraId: string | undefined) {
  const key = obraId ? cacheKey(obraId) : undefined
  const { data: guias, loading, error, reload } = useAsync(
    () => listarGuias(obraId!),
    [obraId],
    { enabled: !!obraId, errorMsg: 'Erro ao carregar guias de transporte', cacheKey: key }
  )
  return { guias: guias ?? [], loading, error, reload }
}

export function useCriarGuia(obraId: string) {
  const { mutate, loading, error } = useMutation(
    criarGuia,
    'Erro ao criar guia de transporte',
    { invalidates: [cacheKey(obraId)] }
  )
  return { criar: mutate, loading, error }
}

export function useActualizarEstadoGuia(obraId: string) {
  const { mutate, loading, error } = useMutation(
    (id: string, estado: EstadoGuia) => actualizarEstadoGuia(id, estado),
    'Erro ao actualizar estado da guia',
    { invalidates: [cacheKey(obraId)] }
  )
  return { actualizar: mutate, loading, error }
}
