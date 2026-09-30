import { useAsync, invalidateCache } from '@/app/lib/useAsync'
import { useIntervaloVisivel } from '@/app/lib/useIntervaloVisivel'
import { fetchPodeAprovar, contarAguardam } from '../services/aprovacaoService'

// Leve de propósito: usado pelo menu lateral em todas as páginas
export function usePodeAprovar() {
  const { data, loading } = useAsync(fetchPodeAprovar, [],
    { cacheKey: 'pedidos-pode-aprovar', cacheTtl: 5 * 60_000 })
  return { podeAprovar: data === true, loading }
}

export function useContagemAguardam(enabled: boolean) {
  const { data } = useAsync(contarAguardam, [],
    { enabled, cacheKey: 'pedidos-contagem', cacheTtl: 15_000 })
  useIntervaloVisivel(() => invalidateCache('pedidos-contagem'), 20_000, enabled)
  return data ?? 0
}
