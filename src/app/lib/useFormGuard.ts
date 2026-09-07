import { useRef, useCallback } from 'react'

/**
 * Envolve um handler de submit para impedir dupla submissão por race condition:
 * - Ignora chamadas enquanto a promessa anterior ainda está em curso
 * - Funciona mesmo quando o `disabled={saving}` ainda não re-renderizou
 *
 * Uso:
 *   const handleSubmit = useFormGuard(async (e) => { ... })
 */
export function useFormGuard<T extends unknown[]>(
  fn: (...args: T) => Promise<void>
): (...args: T) => Promise<void> {
  const inFlight = useRef(false)

  return useCallback(
    async (...args: T) => {
      if (inFlight.current) return
      inFlight.current = true
      try {
        await fn(...args)
      } finally {
        inFlight.current = false
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn]
  )
}
