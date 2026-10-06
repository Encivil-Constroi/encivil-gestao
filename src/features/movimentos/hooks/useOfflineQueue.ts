import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { pendentesDoUtilizador, pendentesDeOutros, removeFromQueue, onQueueChange, isNetworkError, ehPendenteArmazem, type PendingMovimento } from '../offlineQueue'
import { registarMovimento } from '../services/movimentosService'
import { registarMovimentoArmazem } from '../services/armazemService'
import { invalidateCache } from '@/app/lib/useAsync'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/features/auth/AuthContext'

// Só deve existir UMA instância ativa deste hook na app (montada uma vez no
// MainLayout) — caso contrário duas instâncias tentariam sincronizar a
// mesma fila em simultâneo e duplicariam movimentos.
export function useOfflineQueue() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [pending, setPending] = useState<PendingMovimento[]>(() => pendentesDoUtilizador(userId))
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

    // Sessão pode ter expirado por inatividade (30 min) enquanto offline.
    // Não sincronizar sem sessão válida — mantém a fila intacta para quando o utilizador iniciar sessão.
    // A guarda é ativada antes do await: o arranque e o evento "online" podem chamar
    // flush quase ao mesmo tempo e duplicariam os movimentos.
    flushingRef.current = true
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      flushingRef.current = false
      toast.warning('Inicie sessão para sincronizar os registos pendentes.')
      return
    }
    // Defesa em profundidade: a sessão real tem de ser a do dono dos movimentos
    if (session.user.id !== userId) {
      flushingRef.current = false
      return
    }

    setSyncing(true)
    let okCount = 0
    let failCount = 0
    let stoppedByNetwork = false

    try {
      for (const item of queue) {
        try {
          if (ehPendenteArmazem(item)) {
            const { queueId, queuedAt, ...input } = item
            void queueId; void queuedAt
            await registarMovimentoArmazem(input)
          } else {
            const { queueId, queuedAt, ...input } = item
            void queueId; void queuedAt
            await registarMovimento(input)
          }
          removeFromQueue(item.queueId)
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
    } finally {
      setSyncing(false)
      flushingRef.current = false
      refresh()
    }

    if (okCount > 0) {
      // Invalidar caches afetadas pelos movimentos sincronizados
      invalidateCache('produtos-ativos', 'produtos-*', 'dashboard', 'movimentos-*', 'armazem-*')
      toast.success(`${okCount} movimento${okCount !== 1 ? 's' : ''} pendente${okCount !== 1 ? 's' : ''} sincronizado${okCount !== 1 ? 's' : ''} com sucesso.`)
    }
    if (failCount > 0) {
      toast.error(`${failCount} movimento${failCount !== 1 ? 's' : ''} pendente${failCount !== 1 ? 's' : ''} não pôde${failCount !== 1 ? 'ram' : ''} ser sincronizado${failCount !== 1 ? 's' : ''} e foi${failCount !== 1 ? 'ram' : ''} removido${failCount !== 1 ? 's' : ''} da fila. Verifique os Movimentos do armazém.`)
    }
    if (stoppedByNetwork && okCount === 0 && failCount === 0) {
      // ainda offline — não vale a pena notificar, já existe o banner persistente
    }
  }, [refresh, userId])

  useEffect(() => {
    flush()
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [flush])

  return { pendingCount: pending.length, deOutros, syncing, flushNow: flush }
}
