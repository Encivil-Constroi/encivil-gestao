import type { RegistarMovimentoInput } from './services/movimentosService'

const STORAGE_KEY  = 'encivil_pending_movimentos'
const QUEUE_EVENT  = 'encivil:queue-changed'
const MAX_QUEUE_SIZE = 200

export type PendingMovimento = RegistarMovimentoInput & {
  queueId: string
  queuedAt: string
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function isValidItem(item: unknown): item is PendingMovimento {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false
  const i = item as Record<string, unknown>
  return (
    typeof i.queueId === 'string' && i.queueId.length > 0 &&
    typeof i.produtoId === 'string' && i.produtoId.length > 0 &&
    typeof i.tipo === 'string' && i.tipo.length > 0 &&
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

export function enqueuePendingMovimento(input: RegistarMovimentoInput): PendingMovimento {
  const current = readQueue()
  if (current.length >= MAX_QUEUE_SIZE) {
    throw new Error(`Fila offline cheia (máx. ${MAX_QUEUE_SIZE} registos). Sincronize antes de continuar.`)
  }
  const item: PendingMovimento = { ...input, queueId: uuid(), queuedAt: new Date().toISOString() }
  writeQueue([...current, item])
  return item
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
  const msg = e instanceof Error ? e.message : String(e)
  return /failed to fetch|networkerror|network request failed|err_internet|err_connection|err_network|load failed|timeout/i.test(msg)
}

// As exceções da RPC registar_movimento já vêm em português (RAISE EXCEPTION) —
// só precisamos de um fallback genérico para erros verdadeiramente inesperados.
export function friendlyErrorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message
  return 'Erro inesperado. Tente novamente.'
}
