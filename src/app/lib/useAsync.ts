import { useState, useEffect, useCallback, type DependencyList } from 'react'
import { captureError } from './sentry'
import { parseSupabaseError } from './parseSupabaseError'

/**
 * Generic async data-fetching hook. Runs `asyncFn` whenever `deps` change or
 * `enabled` flips to true. Avoids the loading/error/useCallback/useEffect
 * boilerplate repeated in every feature hook.
 */
export function useAsync<T>(
  asyncFn: () => Promise<T>,
  deps: DependencyList,
  options: { enabled?: boolean; errorMsg?: string } = {}
): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const { enabled = true, errorMsg = 'Erro' } = options
  const [data,    setData]    = useState<T | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error,   setError]   = useState<string | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(async () => {
    if (!enabled) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try   { setData(await asyncFn()) }
    catch (e) { setError(parseSupabaseError(e, errorMsg)); captureError(e) }
    finally   { setLoading(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps])

  useEffect(() => { run() }, [run])

  return { data, loading, error, reload: run }
}
