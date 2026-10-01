import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  listarArtigosArmazem, listarFornecedoresUsados, listarMovimentosArmazem, listarMateriaisPorObra,
  listarEmprestimosAtivos, listarGarantiasFerramentas, registarMovimentoArmazem, POR_PAGINA,
  type FiltrosMovArmazem, type RegistarMovimentoArmazemInput,
} from '../services/armazemService'
import { enqueuePendingMovimento, isNetworkError } from '../offlineQueue'

export function useArtigosArmazem() {
  const { data, loading, error, reload } = useAsync(listarArtigosArmazem, [],
    { cacheKey: 'armazem-artigos', errorMsg: 'Erro ao carregar artigos' })
  return { artigos: data ?? [], loading, error, reload }
}

export function useFornecedoresUsados() {
  const { data } = useAsync(listarFornecedoresUsados, [],
    { cacheKey: 'armazem-fornecedores', cacheTtl: 300_000, errorMsg: 'Erro ao carregar fornecedores' })
  return data ?? []
}

export function useMovimentosArmazem(filtros: FiltrosMovArmazem, pagina = 0, porPagina = POR_PAGINA) {
  const chave = `${JSON.stringify(filtros)}|${pagina}|${porPagina}`
  const { data, loading, error, reload } = useAsync(
    () => listarMovimentosArmazem(filtros, pagina, porPagina), [chave],
    { cacheKey: `armazem-mov-${chave}`, cacheTtl: 15_000, errorMsg: 'Erro ao carregar movimentos' })
  return { movimentos: data?.movimentos ?? [], total: data?.total ?? 0, loading, error, reload }
}

export function useMateriaisPorObra() {
  const { data, loading, error, reload } = useAsync(listarMateriaisPorObra, [],
    { cacheKey: 'armazem-materiais-obras', errorMsg: 'Erro ao carregar materiais por obra' })
  return { materiais: data ?? [], loading, error, reload }
}

export function useEmprestimosAtivos() {
  const { data, loading, error, reload } = useAsync(listarEmprestimosAtivos, [],
    { cacheKey: 'armazem-emprestimos-ativos', errorMsg: 'Erro ao carregar ferramentas emprestadas' })
  return { emprestimos: data ?? [], loading, error, reload }
}

export function useGarantiasFerramentas() {
  const { data, loading, error } = useAsync(listarGarantiasFerramentas, [],
    { cacheKey: 'armazem-garantias', errorMsg: 'Erro ao carregar garantias' })
  return { garantias: data ?? [], loading, error }
}

export type ResultadoRegisto = 'ok' | 'guardado-offline'

// Sem rede (ou se a ligação cair a meio), o movimento fica na fila offline e é
// enviado pelo useOfflineQueue; erros de negócio (stock, obra concluída…) sobem.
async function registarOuGuardar(input: RegistarMovimentoArmazemInput): Promise<ResultadoRegisto> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    enqueuePendingMovimento(input)
    return 'guardado-offline'
  }
  try {
    await registarMovimentoArmazem(input)
    return 'ok'
  } catch (e) {
    if (!isNetworkError(e)) throw e
    enqueuePendingMovimento(input)
    return 'guardado-offline'
  }
}

export function useRegistarMovimentoArmazem() {
  const { mutate: registar, loading, error } = useMutation(registarOuGuardar, 'Erro ao registar o movimento', {
    invalidates: ['armazem-*', 'produtos-*', 'produtos-ativos', 'movimentos-*', 'dashboard', 'alertas-ativos'],
  })
  return { registar, loading, error }
}
