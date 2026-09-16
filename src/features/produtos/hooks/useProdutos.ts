import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  listarProdutos, listarProdutosArquivados, buscarProduto,
  criarProduto, atualizarProduto, desativarProduto, restaurarProduto, deletarProduto,
} from '../services/produtosService'

const CACHE_ATIVOS     = 'produtos-ativos'
const CACHE_ARQUIVADOS = 'produtos-arquivados'
const CACHE_LISTAS     = [CACHE_ATIVOS, CACHE_ARQUIVADOS]

export function useProdutos(apenasAtivos = true) {
  const { data, loading, error, reload } = useAsync(
    () => listarProdutos(apenasAtivos), [apenasAtivos],
    { errorMsg: 'Erro ao carregar produtos', cacheKey: apenasAtivos ? CACHE_ATIVOS : CACHE_ARQUIVADOS }
  )
  return { products: data ?? [], loading, error, reload }
}

export function useProduto(id: string | undefined) {
  const { data: product, loading, error, reload } = useAsync(
    () => buscarProduto(id!), [id],
    { enabled: !!id, errorMsg: 'Produto não encontrado', cacheKey: id ? `produto-${id}` : undefined }
  )
  return { product, loading, error, reload }
}

export function useProdutosArquivados(enabled = true) {
  const { data, loading, reload } = useAsync(
    listarProdutosArquivados, [],
    { enabled, cacheKey: CACHE_ARQUIVADOS }
  )
  return { products: data ?? [], loading, reload }
}

export function useCriarProduto() {
  const { mutate: criar, loading, error } = useMutation(
    criarProduto, 'Erro ao criar produto', { invalidates: CACHE_LISTAS }
  )
  return { criar, loading, error }
}

export function useAtualizarProduto() {
  const { mutate: atualizar, loading, error } = useMutation(
    atualizarProduto, 'Erro ao atualizar produto', { invalidates: CACHE_LISTAS }
  )
  return { atualizar, loading, error }
}

export function useDesativarProduto() {
  const { mutate, loading } = useMutation(
    async (id: string): Promise<true> => { await desativarProduto(id); return true },
    'Erro ao desativar produto',
    { invalidates: CACHE_LISTAS }
  )
  const desativar = async (id: string) => (await mutate(id)) === true
  return { desativar, loading }
}

export function useRestaurarProduto() {
  const { mutate, loading } = useMutation(
    async (id: string): Promise<true> => { await restaurarProduto(id); return true },
    'Erro ao restaurar produto',
    { invalidates: CACHE_LISTAS }
  )
  const restaurar = async (id: string) => (await mutate(id)) === true
  return { restaurar, loading }
}

export function useDeletarProduto() {
  const { mutate, loading } = useMutation(
    async (id: string): Promise<true> => { await deletarProduto(id); return true },
    'Erro ao eliminar produto',
    { invalidates: CACHE_LISTAS }
  )
  const deletar = async (id: string) => (await mutate(id)) === true
  return { deletar, loading }
}
