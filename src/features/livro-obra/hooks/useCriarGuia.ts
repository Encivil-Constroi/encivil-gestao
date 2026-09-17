import { useAsync }   from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  listarGuias,
  criarGuia,
  actualizarEstadoGuia,
  type EstadoGuia,
} from '../services/guiasTransporteService'

export function useGuias(obraId: string | undefined) {
  const { data: guias, loading, error, reload } = useAsync(
    () => listarGuias(obraId!),
    [obraId],
    { enabled: !!obraId, errorMsg: 'Erro ao carregar guias de transporte' }
  )
  return { guias: guias ?? [], loading, error, reload }
}

export function useCriarGuia() {
  const { mutate, loading, error } = useMutation(criarGuia, 'Erro ao criar guia de transporte')
  return { criar: mutate, loading, error }
}

export function useActualizarEstadoGuia() {
  const { mutate, loading, error } = useMutation(
    (id: string, estado: EstadoGuia) => actualizarEstadoGuia(id, estado),
    'Erro ao actualizar estado da guia'
  )
  return { actualizar: mutate, loading, error }
}
