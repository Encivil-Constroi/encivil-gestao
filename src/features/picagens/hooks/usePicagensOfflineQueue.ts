import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { pendentesDoUtilizador, pendentesDeOutros, removeFromQueue, onQueueChange, registarTentativaFalhada, type PendingPicagem } from '../offlineQueue'
import { registarPicagemOffline } from '../services/picagensService'
import { ehErroDefinitivo } from '@/app/lib/errosRede'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/features/auth/AuthContext'

const TENTATIVAS_ATE_AVISO = 5

async function sessaoAtual() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    return session
  } catch {
    return null
  }
}

// Só deve existir UMA instância ativa deste hook por separador (montada em OfflineSyncBanner).
// Entre separadores/janelas (PWA + browser), o lock 'encivil-picagens' serializa o envio:
// as picagens não têm client_id no servidor, por isso duas leituras da mesma fila duplicariam.
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

  const sincronizar = useCallback(async () => {
    // Relida dentro do lock: outro separador pode ter acabado de enviar parte da fila
    const queue = pendentesDoUtilizador(userId)
    if (queue.length === 0 || !navigator.onLine) return

    // Sessão expirada/indisponível: manter fila intacta, sem notificar (movimentos já avisaram).
    // Defesa em profundidade: a sessão real tem de ser a do dono das picagens.
    const session = await sessaoAtual()
    if (!session || session.user.id !== userId) return

    setSyncing(true)
    let okCount = 0
    let failCount = 0
    const agora = new Date()

    try {
      for (const item of queue) {
        try {
          const { queueId, queuedAt, tentativas, ...input } = item
          void queuedAt; void tentativas
          await registarPicagemOffline(input, agora)
          removeFromQueue(queueId)
          okCount++
        } catch (e) {
          if (ehErroDefinitivo(e)) {
            removeFromQueue(item.queueId)
            failCount++
            continue
          }
          // Rede, 5xx/429, timeout, JWT expirado: a picagem fica e tenta-se mais tarde
          if (registarTentativaFalhada(item.queueId) >= TENTATIVAS_ATE_AVISO) {
            toast.warning('Há uma picagem pendente que não consegue ser enviada. Continua guardada neste dispositivo; não termine a sessão e avise o encarregado.')
          }
          break
        }
      }
    } finally {
      setSyncing(false)
      refresh()
    }

    if (okCount > 0)
      toast.success(`${okCount} picagem${okCount !== 1 ? 's' : ''} sincronizada${okCount !== 1 ? 's' : ''} com sucesso.`)
    if (failCount > 0)
      toast.error(`${failCount} picagem${failCount !== 1 ? 's' : ''} não pôde${failCount !== 1 ? 'ram' : ''} ser sincronizada${failCount !== 1 ? 's' : ''}.`)
  }, [refresh, userId])

  const flush = useCallback(async () => {
    if (flushingRef.current) return
    if (pendentesDoUtilizador(userId).length === 0 || !navigator.onLine) return
    // A guarda é ativada antes do await: o arranque e o evento "online" podem chamar
    // flush quase ao mesmo tempo e duplicariam as picagens.
    flushingRef.current = true
    try {
      if (typeof navigator !== 'undefined' && navigator.locks?.request) {
        await navigator.locks.request('encivil-picagens', () => sincronizar())
      } else {
        await sincronizar()
      }
    } finally {
      flushingRef.current = false
    }
  }, [sincronizar, userId])

  useEffect(() => {
    flush()
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [flush])

  return { pendingCount: pending.length, deOutros, syncing, flushNow: flush }
}
