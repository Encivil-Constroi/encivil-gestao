import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import {
  pendentesDoUtilizador, pendentesDeOutros, removeFromQueue, onQueueChange, ehPendenteArmazem,
  clientIdDoPendente, registarTentativaFalhada, type PendingMovimento,
} from '../offlineQueue'
import { ehErroDefinitivo } from '@/app/lib/errosRede'
import { registarMovimento } from '../services/movimentosService'
import { registarMovimentoArmazem } from '../services/armazemService'
import { invalidateCache } from '@/app/lib/useAsync'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/features/auth/AuthContext'

const TENTATIVAS_ATE_AVISO = 5

// Só deve existir UMA instância ativa deste hook por separador (montada uma vez
// no MainLayout). Entre separadores/janelas, o lock do browser 'encivil-queue'
// serializa a sincronização; o client_id no servidor é a última defesa.
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

  const sincronizar = useCallback(async () => {
    // Relida aqui dentro: outro separador pode ter acabado de enviar parte da fila
    const queue = pendentesDoUtilizador(userId)
    if (queue.length === 0 || !navigator.onLine) return

    // Sessão pode ter expirado por inatividade (30 min) enquanto offline.
    // Não sincronizar sem sessão válida — mantém a fila intacta para quando o utilizador iniciar sessão.
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      toast.warning('Inicie sessão para sincronizar os registos pendentes.')
      return
    }
    // Defesa em profundidade: a sessão real tem de ser a do dono dos movimentos
    if (session.user.id !== userId) return

    setSyncing(true)
    let okCount = 0
    let failCount = 0

    try {
      for (const item of queue) {
        try {
          if (ehPendenteArmazem(item)) {
            const { queueId, queuedAt, ...input } = item
            void queueId; void queuedAt
            await registarMovimentoArmazem({ ...input, clientId: clientIdDoPendente(item) })
          } else {
            const { queueId, queuedAt, ...input } = item
            void queueId; void queuedAt
            await registarMovimento(input)
          }
          removeFromQueue(item.queueId)
          okCount++
        } catch (e) {
          // Erro de negócio (ex: produto removido, stock alterado) — não tem como
          // resolver-se sozinho com retentativas. Remove da fila e avisa o utilizador.
          if (ehErroDefinitivo(e)) {
            removeFromQueue(item.queueId)
            failCount++
            continue
          }
          // Rede, 5xx/429, timeout: o movimento fica e a ordem mantém-se (os seguintes
          // podem depender do stock deste). O client_id evita duplicar no reenvio.
          if (registarTentativaFalhada(item.queueId) >= TENTATIVAS_ATE_AVISO) {
            toast.warning('Há um movimento pendente que não consegue ser enviado. Continua guardado neste dispositivo; não termine a sessão e avise o responsável do armazém.')
          }
          break
        }
      }
    } finally {
      setSyncing(false)
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
  }, [refresh, userId])

  const flush = useCallback(async () => {
    if (flushingRef.current) return
    if (pendentesDoUtilizador(userId).length === 0 || !navigator.onLine) return
    // A guarda é ativada antes do await: o arranque e o evento "online" podem chamar
    // flush quase ao mesmo tempo e duplicariam os movimentos.
    flushingRef.current = true
    try {
      if (typeof navigator !== 'undefined' && navigator.locks?.request) {
        await navigator.locks.request('encivil-queue', () => sincronizar())
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
