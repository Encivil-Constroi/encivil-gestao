import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  listarProdutos, listarProdutosArquivados, buscarProduto,
  criarProduto, atualizarProduto, desativarProduto, restaurarProduto, deletarProduto,
  previsualizarCodigoProduto, listarMovimentosProduto,
} from '../services/produtosService'

const CACHE_ATIVOS     = 'produtos-ativos'
const CACHE_ARQUIVADOS = 'produtos-arquivados'
const CACHE_LISTAS     = [CACHE_ATIVOS, CACHE_ARQUIVADOS]
// Arquivar/restaurar/eliminar também mudam a ficha do artigo e a lista completa
const CACHE_TUDO       = [...CACHE_LISTAS, 'produtos-todos', 'produto-*']

export function useProdutos(apenasAtivos = true) {
  const { data, loading, error, reload } = useAsync(
    () => listarProdutos(apenasAtivos), [apenasAtivos],
    // useProdutos(false) devolve TODOS os produtos — cache key diferente de arquivados
    { errorMsg: 'Erro ao carregar produtos', cacheKey: apenasAtivos ? CACHE_ATIVOS : 'produtos-todos' }
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
  const { data, loading, error, reload } = useAsync(
    listarProdutosArquivados, [],
    { enabled, cacheKey: CACHE_ARQUIVADOS, errorMsg: 'Erro ao carregar produtos arquivados' }
  )
  return { products: data ?? [], loading, error, reload }
}

// Sem cache: é só a pré-visualização do próximo código da sequência
export function useCodigoProdutoPreview(enabled = true) {
  const { data, loading } = useAsync(previsualizarCodigoProduto, [], { enabled, errorMsg: 'Erro ao gerar código' })
  return { codigo: data ?? '', loading }
}

export function useMovimentosProduto(id: string | undefined, limite = 50) {
  const { data, loading, error, reload } = useAsync(
    () => listarMovimentosProduto(id!, limite), [id, limite],
    { enabled: !!id, errorMsg: 'Erro ao carregar os movimentos do artigo' }
  )
  return { movimentos: data ?? [], loading, error, reload }
}

export function useCriarProduto() {
  const { mutate: criar, loading, error } = useMutation(
    criarProduto, 'Erro ao criar produto', { invalidates: CACHE_LISTAS }
  )
  return { criar, loading, error }
}

export function useAtualizarProduto() {
  const { mutate: atualizar, loading, error } = useMutation(
    atualizarProduto, 'Erro ao atualizar produto', { invalidates: CACHE_TUDO }
  )
  return { atualizar, loading, error }
}

export function useDesativarProduto() {
  const { mutate, loading } = useMutation(
    async (id: string): Promise<true> => { await desativarProduto(id); return true },
    'Erro ao desativar produto',
    { invalidates: CACHE_TUDO }
  )
  const desativar = async (id: string) => (await mutate(id)) === true
  return { desativar, loading }
}

export function useRestaurarProduto() {
  const { mutate, loading } = useMutation(
    async (id: string): Promise<true> => { await restaurarProduto(id); return true },
    'Erro ao restaurar produto',
    { invalidates: CACHE_TUDO }
  )
  const restaurar = async (id: string) => (await mutate(id)) === true
  return { restaurar, loading }
}

export function useDeletarProduto() {
  const { mutate, loading } = useMutation(
    async (id: string): Promise<true> => { await deletarProduto(id); return true },
    'Erro ao eliminar produto',
    { invalidates: CACHE_TUDO }
  )
  const deletar = async (id: string) => (await mutate(id)) === true
  return { deletar, loading }
}
