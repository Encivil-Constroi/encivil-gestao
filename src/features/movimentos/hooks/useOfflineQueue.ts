import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { getQueue, removeFromQueue, onQueueChange, isNetworkError, type PendingMovimento } from '../offlineQueue'
import { registarMovimento } from '../services/movimentosService'
import { invalidateCache } from '@/app/lib/useAsync'

// Só deve existir UMA instância ativa deste hook na app (montada uma vez no
// MainLayout) — caso contrário duas instâncias tentariam sincronizar a
// mesma fila em simultâneo e duplicariam movimentos.
export function useOfflineQueue() {
  const [pending, setPending] = useState<PendingMovimento[]>(() => getQueue())
  const [syncing, setSyncing] = useState(false)
  const flushingRef = useRef(false)

  const refresh = useCallback(() => setPending(getQueue()), [])

  useEffect(() => onQueueChange(refresh), [refresh])

  const flush = useCallback(async () => {
    if (flushingRef.current) return
    const queue = getQueue()
    if (queue.length === 0 || !navigator.onLine) return

    flushingRef.current = true
    setSyncing(true)
    let okCount = 0
    let failCount = 0
    let stoppedByNetwork = false

    for (const item of queue) {
      try {
        const { queueId, queuedAt, ...input } = item
        void queuedAt
        await registarMovimento(input)
        removeFromQueue(queueId)
        okCount++
      } catch (e) {
        if (isNetworkError(e)) {
          stoppedByNetwork = true
          break // ainda sem ligação fiável — tenta de novo mais tarde, mantém o resto na fila
        }
        // Erro de negócio (ex: produto removido, stock alterado) — não tem como
        // resolver-se a sozinho com retentativas. Remove da fila e avisa o utilizador.
        removeFromQueue(item.queueId)
        failCount++
      }
    }

    setSyncing(false)
    flushingRef.current = false
    refresh()

    if (okCount > 0) {
      // Invalidar caches afetadas pelos movimentos sincronizados
      invalidateCache('produtos-ativos', 'produtos-*', 'dashboard', 'movimentos-*')
      toast.success(`${okCount} movimento${okCount !== 1 ? 's' : ''} pendente${okCount !== 1 ? 's' : ''} sincronizado${okCount !== 1 ? 's' : ''} com sucesso.`)
    }
    if (failCount > 0) {
      toast.error(`${failCount} movimento${failCount !== 1 ? 's' : ''} pendente${failCount !== 1 ? 's' : ''} não pôde${failCount !== 1 ? 'ram' : ''} ser sincronizado${failCount !== 1 ? 's' : ''} e foi${failCount !== 1 ? 'ram' : ''} removido${failCount !== 1 ? 's' : ''} da fila. Verifique o Histórico.`)
    }
    if (stoppedByNetwork && okCount === 0 && failCount === 0) {
      // ainda offline — não vale a pena notificar, já existe o banner persistente
    }
  }, [refresh])

  useEffect(() => {
    flush()
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [flush])

  return { pendingCount: pending.length, syncing, flushNow: flush }
}
