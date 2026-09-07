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

export function useColaboradores(apenasAtivos = true) {
  const { data, loading, error, reload } = useAsync(
    () => listarColaboradores(apenasAtivos), [apenasAtivos],
    { errorMsg: 'Erro ao carregar colaboradores' }
  )
  return { colaboradores: data ?? [], loading, error, reload }
}

export function useColaborador(id: string | undefined) {
  const { data: colaborador, loading, error, reload } = useAsync(
    () => buscarColaborador(id!), [id],
    { enabled: !!id, errorMsg: 'Colaborador não encontrado' }
  )
  return { colaborador, loading, error, reload }
}

export function useGuardarColaborador() {
  const criador     = useMutation(criarColaborador,    'Erro ao criar colaborador')
  const atualizador = useMutation(
    (id: string, input: AtualizarColaborador) => atualizarColaborador(id, input),
    'Erro ao atualizar colaborador'
  )
  return {
    criar:    (input: NovoColaborador) => criador.mutate(input),
    atualizar: (id: string, input: AtualizarColaborador) => atualizador.mutate(id, input),
    loading:  criador.loading || atualizador.loading,
    error:    criador.error   || atualizador.error,
  }
}

export function useArquivarColaborador() {
  const { mutate, loading } = useMutation(
    async (id: string): Promise<true> => { await arquivarColaborador(id); return true }
  )
  const arquivar = async (id: string) => (await mutate(id)) === true
  return { arquivar, loading }
}

export function useRestaurarColaborador() {
  const { mutate, loading } = useMutation(
    async (id: string): Promise<true> => { await restaurarColaborador(id); return true }
  )
  const restaurar = async (id: string) => (await mutate(id)) === true
  return { restaurar, loading }
}
