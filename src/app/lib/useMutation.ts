import { useState } from 'react'

/**
 * Generic mutation hook. Wraps a single async operation with loading/error
 * state. Eliminates the 8-line try/catch/finally block repeated in every
 * mutation hook.
 */
export function useMutation<TArgs extends unknown[], TResult>(
  mutateFn: (...args: TArgs) => Promise<TResult>,
  errorMsg = 'Erro'
): { mutate: (...args: TArgs) => Promise<TResult | null>; loading: boolean; error: string | null } {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const mutate = async (...args: TArgs): Promise<TResult | null> => {
    setLoading(true)
    setError(null)
    try   { return await mutateFn(...args) }
    catch (e) { setError(e instanceof Error ? e.message : errorMsg); return null }
    finally   { setLoading(false) }
  }

  return { mutate, loading, error }
}
