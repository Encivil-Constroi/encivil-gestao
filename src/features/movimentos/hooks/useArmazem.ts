import { useRef } from 'react'
import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  listarArtigosArmazem, listarFornecedoresUsados, listarMovimentosArmazem, listarMateriaisPorObra,
  listarEmprestimosAtivos, listarGarantiasFerramentas, registarMovimentoArmazem, POR_PAGINA,
  type FiltrosMovArmazem, type RegistarMovimentoArmazemInput,
} from '../services/armazemService'
import { enqueuePendingMovimento, isNetworkError, novoIdRegisto } from '../offlineQueue'
import { useAuth } from '@/features/auth/AuthContext'

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
  const chaveFiltros = `${JSON.stringify(filtros)}|${porPagina}`
  const chave = `${chaveFiltros}|${pagina}`
  const totalRef = useRef<{ chave: string; total: number } | null>(null)
  const { data, loading, error, reload } = useAsync(
    async () => {
      const conhecido = totalRef.current?.chave === chaveFiltros ? totalRef.current.total : undefined
      const r = await listarMovimentosArmazem(filtros, pagina, porPagina, conhecido)
      totalRef.current = { chave: chaveFiltros, total: r.total }
      return r
    }, [chave],
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
async function registarOuGuardar(input: RegistarMovimentoArmazemInput, userId: string | null, clientId: string): Promise<ResultadoRegisto> {
  if (!userId) throw new Error('Sessão terminada. Entre de novo para registar.')
  // O mesmo id vai no envio e na fila: se o servidor gravou e só a resposta se perdeu,
  // o reenvio devolve o movimento já gravado em vez de mexer outra vez no stock.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    enqueuePendingMovimento(input, userId, clientId)
    return 'guardado-offline'
  }
  try {
    await registarMovimentoArmazem({ ...input, clientId })
    return 'ok'
  } catch (e) {
    if (!isNetworkError(e)) throw e
    enqueuePendingMovimento(input, userId, clientId)
    return 'guardado-offline'
  }
}

export function useRegistarMovimentoArmazem() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const { mutate: registarComUtilizador, loading, error } = useMutation(registarOuGuardar, 'Erro ao registar o movimento', {
    invalidates: ['armazem-*', 'produtos-*', 'produtos-ativos', 'movimentos-*', 'dashboard', 'alertas-ativos'],
  })
  // O id sobrevive a um erro (ex.: 504 depois de o servidor gravar) para o reenvio manual não duplicar;
  // só se renova após sucesso ou quando os dados mudam.
  const tentativa = useRef<{ chave: string; id: string } | null>(null)
  const registar = async (input: RegistarMovimentoArmazemInput) => {
    const chave = JSON.stringify(input)
    if (tentativa.current?.chave !== chave) tentativa.current = { chave, id: novoIdRegisto() }
    const resultado = await registarComUtilizador(input, userId, tentativa.current.id)
    if (resultado !== null) tentativa.current = null
    return resultado
  }
  return { registar, loading, error }
}
