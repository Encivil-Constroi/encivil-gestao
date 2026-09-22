import type { NovaPicagem } from './services/picagensService'

const STORAGE_KEY  = 'encivil_pending_picagens'
const QUEUE_EVENT  = 'encivil:picagens-queue-changed'
const MAX_QUEUE_SIZE = 200

export type PendingPicagem = NovaPicagem & {
  queueId: string
  queuedAt: string
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function isValidItem(item: unknown): item is PendingPicagem {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false
  const i = item as Record<string, unknown>
  return (
    typeof i.queueId === 'string' && i.queueId.length > 0 &&
    typeof i.colaboradorId === 'string' && i.colaboradorId.length > 0 &&
    typeof i.obraId === 'string' && i.obraId.length > 0 &&
    typeof i.tipo === 'string' && i.tipo.length > 0 &&
    typeof i.timestampDispositivo === 'string' && i.timestampDispositivo.length > 0
  )
}

function readQueue(): PendingPicagem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidItem)
  } catch {
    return []
  }
}

function writeQueue(queue: PendingPicagem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT))
}

export function getQueue(): PendingPicagem[] {
  return readQueue()
}

export function enqueuePendingPicagem(input: NovaPicagem): PendingPicagem {
  const current = readQueue()
  if (current.length >= MAX_QUEUE_SIZE) {
    throw new Error(`Fila offline cheia (máx. ${MAX_QUEUE_SIZE} registos). Sincronize antes de continuar.`)
  }
  const item: PendingPicagem = { ...input, queueId: uuid(), queuedAt: new Date().toISOString() }
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

export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const msg = e instanceof Error ? e.message : String(e)
  return /failed to fetch|networkerror|network request failed|err_internet|err_connection|err_network|load failed|timeout/i.test(msg)
}
