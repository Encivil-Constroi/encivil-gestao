import { useMutation } from '@/app/lib/useMutation'
import { invalidateCache } from '@/app/lib/useAsync'
import { atribuirEpi, devolverEpi, type NovaAtribuicaoEpi } from '../services/episService'

export function useAtribuirEpi(colaboradorId?: string) {
  const { mutate, loading, error } = useMutation(
    (input: NovaAtribuicaoEpi) => atribuirEpi(input),
    'Erro ao atribuir EPI'
  )

  async function atribuir(input: NovaAtribuicaoEpi) {
    const result = await mutate(input)
    if (result && colaboradorId) {
      invalidateCache(`epis-colab-${colaboradorId}`)
    }
    return result
  }

  return { atribuir, loading, error }
}

export function useDevolverEpi(colaboradorId?: string) {
  const { mutate, loading, error } = useMutation(
    async (params: { id: string; dataDevolucao: string }) =>
      devolverEpi(params.id, params.dataDevolucao),
    'Erro ao registar devolução'
  )

  async function devolver(id: string, dataDevolucao: string) {
    const result = await mutate({ id, dataDevolucao })
    if (result && colaboradorId) {
      invalidateCache(`epis-colab-${colaboradorId}`)
    }
    return result
  }

  return { devolver, loading, error }
}
