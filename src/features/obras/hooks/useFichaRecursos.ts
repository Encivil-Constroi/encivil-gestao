import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  listarEquipaObra, alocarColaborador, removerColaborador, listarAutoresObra, definirAutoresObra,
  listarFrotaObra, listarFerramentasObra, listarMateriaisObra,
} from '../services/fichaRecursosService'

export function useEquipaObra(obraId: string) {
  const { data, loading, error, reload } = useAsync(() => listarEquipaObra(obraId), [obraId],
    { errorMsg: 'Erro ao carregar equipa', cacheKey: `obra-equipa-${obraId}` })
  return { equipa: data ?? [], loading, error, reload }
}

export function useAutoresObra(obraId: string, enabled: boolean) {
  const { data, loading, error, reload } = useAsync(() => listarAutoresObra(obraId), [obraId],
    { enabled, errorMsg: 'Erro ao carregar autores', cacheKey: `obra-autores-${obraId}` })
  return { autores: data ?? [], loading, error, reload }
}

export function useGerirEquipa(obraId: string) {
  const invalidates = [`obra-equipa-${obraId}`, `obra-visao-${obraId}`, 'obras-painel']
  const alocacao = useMutation(
    (colaboradorId: string, funcao: string, desde: string) => alocarColaborador(obraId, colaboradorId, funcao, desde),
    'Erro ao alocar colaborador', { invalidates })
  const remocao = useMutation(
    (alocacaoId: string, ate: string) => removerColaborador(alocacaoId, ate),
    'Erro ao remover colaborador', { invalidates })
  const autores = useMutation(
    (userIds: string[]) => definirAutoresObra(obraId, userIds),
    'Erro ao guardar autores', { invalidates: [`obra-autores-${obraId}`] })
  return {
    alocar: alocacao.mutate, remover: remocao.mutate, definirAutores: autores.mutate,
    loading: alocacao.loading || remocao.loading || autores.loading,
    error: alocacao.error || remocao.error || autores.error,
  }
}

export function useFrotaObra(obraId: string) {
  const { data, loading, error, reload } = useAsync(() => listarFrotaObra(obraId), [obraId],
    { errorMsg: 'Erro ao carregar frota' })
  return { frota: data ?? [], loading, error, reload }
}

export function useFerramentasObra(obraId: string) {
  const { data, loading, error, reload } = useAsync(() => listarFerramentasObra(obraId), [obraId],
    { errorMsg: 'Erro ao carregar ferramentas' })
  return { ferramentas: data ?? [], loading, error, reload }
}

export function useMateriaisObra(obraId: string) {
  const { data, loading, error, reload } = useAsync(() => listarMateriaisObra(obraId), [obraId],
    { errorMsg: 'Erro ao carregar materiais' })
  return { materiais: data ?? [], loading, error, reload }
}
