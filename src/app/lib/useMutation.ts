import { useState, useCallback, useRef } from 'react'
import { captureError } from './sentry'
import { parseSupabaseError } from './parseSupabaseError'
import { invalidateCache } from './useAsync'

/**
 * Generic mutation hook. Wraps a single async operation with loading/error
 * state. Eliminates the 8-line try/catch/finally block repeated in every
 * mutation hook.
 *
 * `invalidates`: chaves de cache a limpar após sucesso da mutação.
 * Usar nas mesmas chaves passadas como `cacheKey` nos hooks de fetch
 * correspondentes, para garantir que a próxima visita busca dados frescos.
 *
 * `mutate` é estável (useCallback + useRef) — não quebrará dependências em
 * useCallback/useMemo dos componentes que o consomem, tornando React.memo eficaz.
 */
export function useMutation<TArgs extends unknown[], TResult>(
  mutateFn: (...args: TArgs) => Promise<TResult>,
  errorMsg = 'Erro',
  options: { invalidates?: string[] } = {}
): { mutate: (...args: TArgs) => Promise<TResult | null>; loading: boolean; error: string | null } {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  // Refs guardam sempre a versão mais recente sem forçar re-criação de mutate.
  // Permite que mutate tenha deps [] e seja referência estável entre renders.
  const mutateFnRef    = useRef(mutateFn)
  mutateFnRef.current  = mutateFn
  const invalidatesRef = useRef(options.invalidates)
  invalidatesRef.current = options.invalidates
  const errorMsgRef    = useRef(errorMsg)
  errorMsgRef.current  = errorMsg

  const mutate = useCallback(async (...args: TArgs): Promise<TResult | null> => {
    setLoading(true)
    setError(null)
    try {
      const result = await mutateFnRef.current(...args)
      if (invalidatesRef.current?.length) invalidateCache(...invalidatesRef.current)
      return result
    } catch (e) {
      setError(parseSupabaseError(e, errorMsgRef.current))
      captureError(e)
      return null
    } finally {
      setLoading(false)
    }
  }, []) // deps vazia — mutate é estável por design via useRef

  return { mutate, loading, error }
}
