import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { pendentesDoUtilizador, pendentesDeOutros, removeFromQueue, onQueueChange, isNetworkError, type PendingPicagem } from '../offlineQueue'
import { registarPicagemOffline } from '../services/picagensService'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/features/auth/AuthContext'

// Só deve existir UMA instância ativa deste hook (montada em OfflineSyncBanner).
export function usePicagensOfflineQueue() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [pending, setPending] = useState<PendingPicagem[]>(() => pendentesDoUtilizador(userId))
  const [deOutros, setDeOutros] = useState(() => pendentesDeOutros(userId))
  const [syncing, setSyncing] = useState(false)
  const flushingRef = useRef(false)

  const refresh = useCallback(() => {
    setPending(pendentesDoUtilizador(userId))
    setDeOutros(pendentesDeOutros(userId))
  }, [userId])
  useEffect(() => { refresh() }, [refresh])
  useEffect(() => onQueueChange(refresh), [refresh])

  const flush = useCallback(async () => {
    if (flushingRef.current) return
    const queue = pendentesDoUtilizador(userId)
    if (queue.length === 0 || !navigator.onLine) return

    // A guarda é ativada antes do await: o arranque e o evento "online" podem chamar
    // flush quase ao mesmo tempo e duplicariam as picagens.
    flushingRef.current = true
    const { data: { session } } = await supabase.auth.getSession()
    // Sessão expirada: manter fila intacta, sem notificar (movimentos já avisaram).
    // Defesa em profundidade: a sessão real tem de ser a do dono das picagens.
    if (!session || session.user.id !== userId) {
      flushingRef.current = false
      return
    }

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
  }, [refresh, userId])

  useEffect(() => {
    flush()
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [flush])

  return { pendingCount: pending.length, deOutros, syncing, flushNow: flush }
}
