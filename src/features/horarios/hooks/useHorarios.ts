import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  listarHorarios, criarHorario, atualizarHorario, arquivarHorario,
  listarTiposFalta, listarFaltas, registarFalta, atualizarEstadoFalta,
  type NovoHorario, type FiltrosFaltas, type NovaFalta,
} from '../services/horariosService'
import type { FaltaEstado } from '@/app/types'

export function useHorarios(apenasAtivos = true) {
  const { data: horarios, loading, error, reload } = useAsync(
    () => listarHorarios(apenasAtivos),
    [apenasAtivos],
    { errorMsg: 'Erro ao carregar horários' },
  )
  return { horarios: horarios ?? [], loading, error, reload }
}

export function useGuardarHorario() {
  const criador    = useMutation(criarHorario, 'Erro ao guardar horário')
  const atualizador = useMutation(
    (id: string, input: Partial<NovoHorario>) => atualizarHorario(id, input),
    'Erro ao guardar horário',
  )
  return {
    criar:     criador.mutate,
    atualizar: atualizador.mutate,
    loading:   criador.loading || atualizador.loading,
    error:     criador.error   || atualizador.error,
  }
}

export function useArquivarHorario() {
  const { mutate, loading } = useMutation(
    async (id: string): Promise<true> => { await arquivarHorario(id); return true },
  )
  const arquivar = async (id: string) => (await mutate(id)) === true
  return { arquivar, loading }
}

export function useTiposFalta() {
  const { data, loading, error } = useAsync(
    () => listarTiposFalta(),
    [],
    { errorMsg: 'Erro ao carregar tipos de falta' },
  )
  return { tiposFalta: data ?? [], loading, error }
}

export function useFaltas(filtros: FiltrosFaltas = {}) {
  const deps = [filtros.colaboradorId, filtros.estado, filtros.dataInicio, filtros.dataFim] as const
  const { data, loading, error, reload } = useAsync(
    () => listarFaltas(filtros),
    deps,
    { errorMsg: 'Erro ao carregar faltas' },
  )
  return { faltas: data ?? [], loading, error, reload }
}

export function useRegistarFalta() {
  const { mutate: registar, loading, error } = useMutation(
    (input: NovaFalta) => registarFalta(input),
    'Erro ao registar falta',
  )
  return { registar, loading, error }
}

export function useAtualizarEstadoFalta() {
  const { mutate, loading, error } = useMutation(
    (id: string, estado: FaltaEstado) => atualizarEstadoFalta(id, estado),
    'Erro ao atualizar estado',
  )
  return { atualizar: mutate, loading, error }
}
