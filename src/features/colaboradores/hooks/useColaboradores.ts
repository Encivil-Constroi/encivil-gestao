import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  listarColaboradores,
  buscarColaborador,
  criarColaborador,
  atualizarColaborador,
  arquivarColaborador,
  restaurarColaborador,
  type NovoColaborador,
  type AtualizarColaborador,
} from '../services/colaboradoresService'

const CACHE_ATIVOS     = 'colaboradores-ativos'
const CACHE_ARQUIVADOS = 'colaboradores-arquivados'
const CACHE_LISTAS     = [CACHE_ATIVOS, CACHE_ARQUIVADOS]

export function useColaboradores(apenasAtivos = true) {
  const { data, loading, error, reload } = useAsync(
    () => listarColaboradores(apenasAtivos), [apenasAtivos],
    { errorMsg: 'Erro ao carregar colaboradores', cacheKey: apenasAtivos ? CACHE_ATIVOS : CACHE_ARQUIVADOS }
  )
  return { colaboradores: data ?? [], loading, error, reload }
}

export function useColaborador(id: string | undefined) {
  const { data: colaborador, loading, error, reload } = useAsync(
    () => buscarColaborador(id!), [id],
    { enabled: !!id, errorMsg: 'Colaborador não encontrado', cacheKey: id ? `colaborador-${id}` : undefined }
  )
  return { colaborador, loading, error, reload }
}

export function useGuardarColaborador() {
  const criador     = useMutation(criarColaborador,    'Erro ao criar colaborador',    { invalidates: CACHE_LISTAS })
  const atualizador = useMutation(
    (id: string, input: AtualizarColaborador) => atualizarColaborador(id, input),
    'Erro ao atualizar colaborador',
    { invalidates: CACHE_LISTAS }
  )
  return {
    criar:     (input: NovoColaborador) => criador.mutate(input),
    atualizar: (id: string, input: AtualizarColaborador) => atualizador.mutate(id, input),
    loading:   criador.loading || atualizador.loading,
    error:     criador.error   || atualizador.error,
  }
}

export function useArquivarColaborador() {
  const { mutate, loading } = useMutation(
    async (id: string): Promise<true> => { await arquivarColaborador(id); return true },
    'Erro ao arquivar colaborador',
    { invalidates: CACHE_LISTAS }
  )
  const arquivar = async (id: string) => (await mutate(id)) === true
  return { arquivar, loading }
}

export function useRestaurarColaborador() {
  const { mutate, loading } = useMutation(
    async (id: string): Promise<true> => { await restaurarColaborador(id); return true },
    'Erro ao restaurar colaborador',
    { invalidates: CACHE_LISTAS }
  )
  const restaurar = async (id: string) => (await mutate(id)) === true
  return { restaurar, loading }
}
