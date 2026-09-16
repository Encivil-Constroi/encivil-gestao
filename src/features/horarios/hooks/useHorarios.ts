import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  listarHorarios, buscarHorario, criarHorario, atualizarHorario, arquivarHorario,
  listarHorarioColaborador, atribuirHorario,
} from '../services/horariosService'
import type { Horario } from '@/app/types'

type HorarioInput = Omit<Horario, 'id' | 'createdAt'>

const CACHE_ATIVOS = 'horarios-ativos'
const CACHE_TODOS  = 'horarios-todos'
const CACHE_LISTAS = [CACHE_ATIVOS, CACHE_TODOS]

export function useHorarios(apenasAtivos = true) {
  const { data, loading, error, reload } = useAsync(
    () => listarHorarios(apenasAtivos), [apenasAtivos],
    { errorMsg: 'Erro ao carregar horários', cacheKey: apenasAtivos ? CACHE_ATIVOS : CACHE_TODOS }
  )
  return { horarios: data ?? [], loading, error, reload }
}

export function useHorario(id: string | undefined) {
  const { data: horario, loading, error, reload } = useAsync(
    () => buscarHorario(id!), [id],
    { enabled: !!id, errorMsg: 'Horário não encontrado', cacheKey: id ? `horario-${id}` : undefined }
  )
  return { horario, loading, error, reload }
}

export function useGuardarHorario() {
  const criador     = useMutation(criarHorario,    'Erro ao criar horário',    { invalidates: CACHE_LISTAS })
  const atualizador = useMutation(
    (id: string, input: Partial<HorarioInput>) => atualizarHorario(id, input),
    'Erro ao atualizar horário',
    { invalidates: CACHE_LISTAS }
  )
  return {
    criar:     (input: HorarioInput) => criador.mutate(input as Omit<Horario, 'id'>),
    atualizar: (id: string, input: Partial<HorarioInput>) => atualizador.mutate(id, input),
    loading:   criador.loading || atualizador.loading,
    error:     criador.error   || atualizador.error,
  }
}

export function useArquivarHorario() {
  const { mutate, loading } = useMutation(
    async (id: string): Promise<true> => { await arquivarHorario(id); return true },
    'Erro ao arquivar horário',
    { invalidates: CACHE_LISTAS }
  )
  const arquivar = async (id: string) => (await mutate(id)) === true
  return { arquivar, loading }
}

export function useHorarioColaborador(colaboradorId: string | undefined) {
  const { data, loading, error, reload } = useAsync(
    () => listarHorarioColaborador(colaboradorId!), [colaboradorId],
    {
      enabled: !!colaboradorId,
      errorMsg: 'Erro ao carregar horário do colaborador',
      cacheKey: colaboradorId ? `horario-colab-${colaboradorId}` : undefined,
    }
  )
  return { atribuicoes: data ?? [], loading, error, reload }
}

export function useAtribuirHorario() {
  const { mutate, loading, error } = useMutation(
    (colaboradorId: string, horarioId: string, validoDe: string, validoAte?: string) =>
      atribuirHorario(colaboradorId, horarioId, validoDe, validoAte),
    'Erro ao atribuir horário',
    { invalidates: CACHE_LISTAS }
  )
  return { atribuir: mutate, loading, error }
}
