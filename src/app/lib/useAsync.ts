import { useState, useEffect, useCallback, useRef, type DependencyList } from 'react'
import { captureError } from './sentry'
import { parseSupabaseError } from './parseSupabaseError'

// ── Cache em memória ─────────────────────────────────────────────────────────
// Sobrevive à navegação entre rotas (o módulo fica carregado), mas é limpo no
// reload completo da página. Invalidado por mutações via invalidateCache().
const _cache = new Map<string, { data: unknown; ts: number }>()

// Hooks montados com cacheKey — sem isto, invalidar só apagava o cache e uma
// lista já no ecrã continuava a mostrar dados antigos até recarregar a página
const _ouvintes = new Set<(keys: string[]) => void>()

function corresponde(cacheKey: string, keys: string[]): boolean {
  return keys.some(k => k.endsWith('*') ? cacheKey.startsWith(k.slice(0, -1)) : cacheKey === k)
}

/** Remove entradas de cache pelas chaves indicadas e recarrega os hooks montados
 *  que as usam. Chaves terminadas em '*' invalidam por prefixo (ex: 'abastecimentos-*'). */
export function invalidateCache(...keys: string[]): void {
  for (const ck of [..._cache.keys()]) {
    if (corresponde(ck, keys)) _cache.delete(ck)
  }
  for (const ouvinte of [..._ouvintes]) ouvinte(keys)
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

  // Proteção contra atualizações de estado após desmontagem ou mudança de deps:
  // cada execução de run() captura o valor corrente de genRef; o cleanup do
  // useEffect incrementa-o, tornando inválida qualquer execução anterior em voo.
  const genRef = useRef(0)

  // Ref estável para asyncFn — evita stale closures quando o consumer passa uma
  // função que fecha sobre valores mutáveis não incluídos em deps.
  // Mesmo padrão usado em useMutation.ts para mutateFnRef.
  const asyncFnRef = useRef(asyncFn)
  asyncFnRef.current = asyncFn

  const temDadosRef = useRef(data !== null)

  // silencioso: refresh em segundo plano (invalidação) — mantém os dados atuais
  // no ecrã em vez de os trocar por um skeleton
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(async (silencioso = false) => {
    if (!enabled) { setLoading(false); return }
    const gen = ++genRef.current

    // Cache hit: dados frescos — sem fetch, sem spinner
    if (cacheKey) {
      const hit = _cache.get(cacheKey)
      if (hit && Date.now() - hit.ts < cacheTtl) {
        if (genRef.current === gen) { setData(hit.data as T); temDadosRef.current = true; setLoading(false) }
        return
      }
    }

    if (!(silencioso && temDadosRef.current)) setLoading(true)
    setError(null)
    try {
      const result = await asyncFnRef.current()
      if (genRef.current !== gen) return
      if (cacheKey) _cache.set(cacheKey, { data: result, ts: Date.now() })
      setData(result)
      temDadosRef.current = true
    } catch (e) {
      if (genRef.current !== gen) return
      setError(parseSupabaseError(e, errorMsg))
      captureError(e)
    } finally {
      if (genRef.current === gen) setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, cacheKey, cacheTtl, ...deps])

  useEffect(() => {
    void run()
    return () => { genRef.current++ }
  }, [run])

  useEffect(() => {
    if (!cacheKey || !enabled) return
    const ouvinte = (keys: string[]) => { if (corresponde(cacheKey, keys)) void run(true) }
    _ouvintes.add(ouvinte)
    return () => { _ouvintes.delete(ouvinte) }
  }, [cacheKey, enabled, run])

  // Sem argumentos: onClick={reload} passaria o evento como "silencioso"
  const reload = useCallback(() => { void run() }, [run])

  return { data, loading, error, reload }
}
