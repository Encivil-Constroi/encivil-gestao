import { useState } from 'react'
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
 */
export function useMutation<TArgs extends unknown[], TResult>(
  mutateFn: (...args: TArgs) => Promise<TResult>,
  errorMsg = 'Erro',
  options: { invalidates?: string[] } = {}
): { mutate: (...args: TArgs) => Promise<TResult | null>; loading: boolean; error: string | null } {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const mutate = async (...args: TArgs): Promise<TResult | null> => {
    setLoading(true)
    setError(null)
    try {
      const result = await mutateFn(...args)
      if (options.invalidates?.length) invalidateCache(...options.invalidates)
      return result
    } catch (e) {
      setError(parseSupabaseError(e, errorMsg))
      captureError(e)
      return null
    } finally {
      setLoading(false)
    }
  }

  return { mutate, loading, error }
}
