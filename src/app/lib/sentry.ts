import * as Sentry from '@sentry/react'

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined

export function initSentry() {
  if (!dsn) return  // dev sem DSN → silencioso

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Só amostrar 10% das transações de performance em produção
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    // Não enviar erros de rede comuns (offline, chunk stale)
    beforeSend(event) {
      const msg = event.exception?.values?.[0]?.value ?? ''
      if (
        msg.includes('Failed to fetch dynamically imported module') ||
        msg.includes('NetworkError') ||
        msg.includes('Load failed')
      ) return null
      return event
    },
  })
}

export function setSentryUser(id: string, email?: string) {
  Sentry.setUser({ id, email })
}

export function clearSentryUser() {
  Sentry.setUser(null)
}

export function captureError(error: unknown, context?: Record<string, unknown>) {
  if (!dsn) return
  Sentry.withScope(scope => {
    if (context) scope.setExtras(context)
    Sentry.captureException(error)
  })
}
