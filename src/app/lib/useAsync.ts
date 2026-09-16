import { useState, useEffect, useCallback, type DependencyList } from 'react'
import { captureError } from './sentry'
import { parseSupabaseError } from './parseSupabaseError'

// ── Cache em memória ─────────────────────────────────────────────────────────
// Sobrevive à navegação entre rotas (o módulo fica carregado), mas é limpo no
// reload completo da página. Invalidado por mutações via invalidateCache().
const _cache = new Map<string, { data: unknown; ts: number }>()

/** Remove as entradas de cache com as chaves indicadas. Chamar após mutações
 *  que alteram os dados em lista (criar, atualizar, arquivar, eliminar). */
export function invalidateCache(...keys: string[]): void {
  for (const k of keys) _cache.delete(k)
}

/**
 * Generic async data-fetching hook. Runs `asyncFn` whenever `deps` change or
 * `enabled` flips to true. Avoids the loading/error/useCallback/useEffect
 * boilerplate repeated in every feature hook.
 *
 * `cacheKey` ativa o cache em memória: dados frescos (< `cacheTtl` ms) são
 * servidos imediatamente sem spinner; dados obsoletos ou em falta disparam
 * o fetch normal e atualizam o cache. Usar em listas que não mudam com
 * frequência (produtos, obras, colaboradores…).
 */
export function useAsync<T>(
  asyncFn: () => Promise<T>,
  deps: DependencyList,
  options: {
    enabled?: boolean
    errorMsg?: string
    cacheKey?: string
    cacheTtl?: number   // ms; omitir = 60 s
  } = {}
): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const { enabled = true, errorMsg = 'Erro', cacheKey, cacheTtl = 60_000 } = options

  // Lazy initializers: lêem o cache sincronamente na primeira renderização,
  // evitando um frame de loading desnecessário quando os dados já existem.
  const [data, setData] = useState<T | null>(() => {
    if (!cacheKey) return null
    const hit = _cache.get(cacheKey)
    return hit && Date.now() - hit.ts < cacheTtl ? (hit.data as T) : null
  })
  const [loading, setLoading] = useState(() => {
    if (!enabled) return false
    if (!cacheKey) return true
    const hit = _cache.get(cacheKey)
    return !(hit && Date.now() - hit.ts < cacheTtl)
  })
  const [error, setError] = useState<string | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(async () => {
    if (!enabled) { setLoading(false); return }

    // Cache hit: dados frescos — sem fetch, sem spinner
    if (cacheKey) {
      const hit = _cache.get(cacheKey)
      if (hit && Date.now() - hit.ts < cacheTtl) {
        setData(hit.data as T)
        setLoading(false)
        return
      }
    }

    setLoading(true)
    setError(null)
    try {
      const result = await asyncFn()
      if (cacheKey) _cache.set(cacheKey, { data: result, ts: Date.now() })
      setData(result)
    } catch (e) {
      setError(parseSupabaseError(e, errorMsg))
      captureError(e)
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, cacheKey, cacheTtl, ...deps])

  useEffect(() => { void run() }, [run])

  return { data, loading, error, reload: run }
}
