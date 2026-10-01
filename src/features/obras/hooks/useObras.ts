import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  listarObras, buscarObra, criarObra, atualizarObra,
  listarPainel, buscarVisao, guardarObra, listarColaboradoresAtivos,
  type AtualizarObra,
} from '../services/obrasService'

const CACHE_ATIVAS = 'obras-ativas'
const CACHE_TODAS  = 'obras-todas'
const CACHE_PAINEL = 'obras-painel'
const CACHE_LISTAS = [CACHE_ATIVAS, CACHE_TODAS, CACHE_PAINEL]

export function useObras(apenasAtivas = true) {
  const { data, loading, error, reload } = useAsync(
    () => listarObras(apenasAtivas), [apenasAtivas],
    { errorMsg: 'Erro ao carregar obras', cacheKey: apenasAtivas ? CACHE_ATIVAS : CACHE_TODAS }
  )
  return { obras: data ?? [], loading, error, reload }
}

export function useObra(id: string | undefined) {
  const { data: obra, loading, error, reload } = useAsync(
    () => buscarObra(id!), [id],
    { enabled: !!id, errorMsg: 'Obra não encontrada', cacheKey: id ? `obra-${id}` : undefined }
  )
  return { obra, loading, error, reload }
}

export function useCriarObra() {
  const { mutate: criar, loading, error } = useMutation(
    criarObra, 'Erro ao criar obra', { invalidates: CACHE_LISTAS }
  )
  return { criar, loading, error }
}

export function useAtualizarObra() {
  const { mutate: atualizar, loading, error } = useMutation(
    (id: string, input: AtualizarObra) => atualizarObra(id, input),
    'Erro ao atualizar obra',
    { invalidates: [...CACHE_LISTAS, 'obra-*', 'resumo-obras'] }
  )
  return { atualizar, loading, error }
}

export function usePainelObras() {
  const { data, loading, error, reload } = useAsync(
    listarPainel, [],
    { errorMsg: 'Erro ao carregar as obras', cacheKey: CACHE_PAINEL }
  )
  return { obras: data ?? [], loading, error, reload }
}

export function useVisaoObra(id: string | undefined) {
  const { data: visao, loading, error, reload } = useAsync(
    () => buscarVisao(id!), [id],
    { enabled: !!id, errorMsg: 'Obra não encontrada', cacheKey: id ? `obra-visao-${id}` : undefined }
  )
  return { visao, loading, error, reload }
}

export function useGuardarObra() {
  const { mutate: guardar, loading, error } = useMutation(
    guardarObra, 'Erro ao guardar a obra',
    { invalidates: [...CACHE_LISTAS, 'obra-*', 'resumo-obras'] }
  )
  return { guardar, loading, error }
}

export function useColaboradoresAtivos() {
  const { data, loading } = useAsync(
    listarColaboradoresAtivos, [],
    { errorMsg: 'Erro ao carregar colaboradores', cacheKey: 'colaboradores-ativos-opcoes' }
  )
  return { colaboradores: data ?? [], loading }
}
