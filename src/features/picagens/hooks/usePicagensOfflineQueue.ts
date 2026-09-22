import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { getQueue, removeFromQueue, onQueueChange, isNetworkError, type PendingPicagem } from '../offlineQueue'
import { registarPicagemOffline } from '../services/picagensService'
import { supabase } from '@/integrations/supabase/client'

// Só deve existir UMA instância ativa deste hook (montada em OfflineSyncBanner).
export function usePicagensOfflineQueue() {
  const [pending, setPending] = useState<PendingPicagem[]>(() => getQueue())
  const [syncing, setSyncing] = useState(false)
  const flushingRef = useRef(false)

  const refresh = useCallback(() => setPending(getQueue()), [])
  useEffect(() => onQueueChange(refresh), [refresh])

  const flush = useCallback(async () => {
    if (flushingRef.current) return
    const queue = getQueue()
    if (queue.length === 0 || !navigator.onLine) return

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return  // sessão expirada — manter fila intacta, sem notificar (movimentos já avisaram)

    flushingRef.current = true
    setSyncing(true)
    let okCount = 0
    let failCount = 0
    const agora = new Date()

    for (const item of queue) {
      try {
        const { queueId, queuedAt, ...input } = item
        void queuedAt
        await registarPicagemOffline(input, agora)
        removeFromQueue(queueId)
        okCount++
      } catch (e) {
        if (isNetworkError(e)) { break }
        removeFromQueue(item.queueId)
        failCount++
      }
    }

    setSyncing(false)
    flushingRef.current = false
    refresh()

    if (okCount > 0)
      toast.success(`${okCount} picagem${okCount !== 1 ? 's' : ''} sincronizada${okCount !== 1 ? 's' : ''} com sucesso.`)
    if (failCount > 0)
      toast.error(`${failCount} picagem${failCount !== 1 ? 's' : ''} não pôde${failCount !== 1 ? 'ram' : ''} ser sincronizada${failCount !== 1 ? 's' : ''}.`)
  }, [refresh])

  useEffect(() => {
    flush()
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [flush])

  return { pendingCount: pending.length, syncing, flushNow: flush }
}
