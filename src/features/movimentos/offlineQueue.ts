import type { RegistarMovimentoInput } from './services/movimentosService'
import type { RegistarMovimentoArmazemInput } from './services/armazemService'

const STORAGE_KEY  = 'encivil_pending_movimentos'
const QUEUE_EVENT  = 'encivil:queue-changed'
const MAX_QUEUE_SIZE = 200

type Meta = { queueId: string; queuedAt: string; userId?: string }

// Registos novos guardam os argumentos da RPC registar_movimento_armazem.
// Os antigos (tipo/destinoObra, gravados antes da atualização num telemóvel
// que estava sem rede) continuam a sincronizar pela RPC antiga.
export type PendenteArmazem = RegistarMovimentoArmazemInput & Meta
export type PendenteLegado = RegistarMovimentoInput & Meta
export type PendingMovimento = PendenteArmazem | PendenteLegado

export function ehPendenteArmazem(i: PendingMovimento): i is PendenteArmazem {
  return 'subtipo' in i
}

// Tem de ser um UUID válido: vai para movimentos_stock.client_id (uuid)
export function novoIdRegisto(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16)
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Registos gravados por versões antigas podem ter um id que não é UUID: esses vão sem client_id
export function clientIdDoPendente(i: PendingMovimento): string | null {
  return UUID.test(i.queueId) ? i.queueId : null
}

function isValidItem(item: unknown): item is PendingMovimento {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false
  const i = item as Record<string, unknown>
  const tipoOk = (typeof i.subtipo === 'string' && i.subtipo.length > 0) || (typeof i.tipo === 'string' && i.tipo.length > 0)
  return (
    typeof i.queueId === 'string' && i.queueId.length > 0 &&
    typeof i.produtoId === 'string' && i.produtoId.length > 0 &&
    tipoOk &&
    typeof i.quantidade === 'number' && i.quantidade > 0 &&
    typeof i.responsavel === 'string' && i.responsavel.length > 0
  )
}

function readQueue(): PendingMovimento[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidItem)
  } catch {
    return []
  }
}

function writeQueue(queue: PendingMovimento[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT))
}

export function getQueue(): PendingMovimento[] {
  return readQueue()
}

// queueId = client_id já enviado ao servidor (se a rede caiu a meio), para o reenvio não duplicar
export function enqueuePendingMovimento(input: RegistarMovimentoArmazemInput, userId: string, queueId = novoIdRegisto()): PendenteArmazem {
  const current = readQueue()
  if (current.length >= MAX_QUEUE_SIZE) {
    throw new Error(`Fila offline cheia (máx. ${MAX_QUEUE_SIZE} registos). Sincronize antes de continuar.`)
  }
  const { clientId, ...dados } = input
  void clientId
  const item: PendenteArmazem = { ...dados, queueId, queuedAt: new Date().toISOString(), userId }
  writeQueue([...current, item])
  return item
}

// Só quem criou o movimento o envia: noutra sessão seria registado em nome de outra pessoa
export function pendentesDoUtilizador(userId: string | null): PendingMovimento[] {
  if (!userId) return []
  return readQueue().filter(i => !i.userId || i.userId === userId)
}

export function pendentesDeOutros(userId: string | null): number {
  return readQueue().filter(i => i.userId && i.userId !== userId).length
}

export function removeFromQueue(queueId: string) {
  writeQueue(readQueue().filter(i => i.queueId !== queueId))
}

export function onQueueChange(listener: () => void): () => void {
  window.addEventListener(QUEUE_EVENT, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(QUEUE_EVENT, listener)
    window.removeEventListener('storage', listener)
  }
}

// Heurística: sem navigator.onLine OU mensagem de erro típica de falha de rede/timeout
// (em browsers, falha de fetch por falta de ligação lança "Failed to fetch"/"NetworkError").
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e !== null && 'message' in e ? String(e.message) : String(e)
  return /failed to fetch|networkerror|network request failed|err_internet|err_connection|err_network|load failed|timeout/i.test(msg)
}

// As exceções das RPCs já vêm em português (RAISE EXCEPTION) —
// só precisamos de um fallback genérico para erros verdadeiramente inesperados.
export function friendlyErrorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message
  if (typeof e === 'object' && e !== null && 'message' in e && typeof e.message === 'string' && e.message) return e.message
  return 'Erro inesperado. Tente novamente.'
}
