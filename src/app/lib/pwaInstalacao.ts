// O Chrome dispara beforeinstallprompt uma vez por carregamento, logo no arranque:
// tem de ser apanhado antes de a página da Ajuda (lazy) montar.

// Evento não normalizado (Chrome/Edge/Android); o Safari nunca o dispara.
export type EventoInstalar = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let evento: EventoInstalar | null = null
let iniciado = false
const ouvintes = new Set<() => void>()

function definir(e: EventoInstalar | null) {
  evento = e
  for (const f of ouvintes) f()
}

export function iniciarCapturaInstalacao(): void {
  if (iniciado || typeof window === 'undefined') return
  iniciado = true
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault()
    definir(e as EventoInstalar)
  })
  window.addEventListener('appinstalled', () => definir(null))
}

export function obterEventoInstalacao(): EventoInstalar | null {
  return evento
}

/** Devolve o evento e esquece-o: o navegador só aceita um prompt() por evento. */
export function consumirEventoInstalacao(): EventoInstalar | null {
  const e = evento
  if (e) definir(null)
  return e
}

export function subscrever(fn: () => void): () => void {
  ouvintes.add(fn)
  return () => { ouvintes.delete(fn) }
}
