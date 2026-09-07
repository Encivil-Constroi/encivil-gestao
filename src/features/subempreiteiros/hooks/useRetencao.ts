import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  listarLiberacoes, criarLiberacao, eliminarLiberacao,
  type NovaLiberacao,
} from '../services/retencaoService'
import type { Measurement } from '@/app/types'
import { useMemo } from 'react'

export function useLiberacoes(subId: string | undefined) {
  const { data, loading, error, reload } = useAsync(
    () => listarLiberacoes(subId!), [subId],
    { enabled: !!subId, errorMsg: 'Erro ao carregar libertações de retenção' }
  )
  return { liberacoes: data ?? [], loading, error, reload }
}

/** Calcula os totais de retenção para um subempreiteiro. */
export function useRetencaoTotais(
  autos: Measurement[],
  subId: string | undefined,
) {
  const { liberacoes, loading, reload } = useLiberacoes(subId)

  const totais = useMemo(() => {
    const validados = autos.filter(a => a.status === 'validado')
    const retencaoAcumulada = validados.reduce((s, a) => s + a.valorRetido, 0)
    const retencaoLibertada = liberacoes.reduce((s, l) => s + l.valor, 0)
    const retencaoEmAberto  = Math.max(0, retencaoAcumulada - retencaoLibertada)
    return { retencaoAcumulada, retencaoLibertada, retencaoEmAberto }
  }, [autos, liberacoes])

  return { ...totais, liberacoes, loading, reload }
}

export function useCriarLiberacao() {
  const { mutate: criar, loading, error } = useMutation(
    (input: NovaLiberacao) => criarLiberacao(input),
    'Erro ao registar libertação'
  )
  return { criar, loading, error }
}

export function useEliminarLiberacao() {
  const { mutate, loading } = useMutation(
    async (id: string): Promise<true> => { await eliminarLiberacao(id); return true }
  )
  const eliminar = async (id: string) => (await mutate(id)) === true
  return { eliminar, loading }
}
