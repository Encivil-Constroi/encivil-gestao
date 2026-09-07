import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { captureError } from '@/app/lib/sentry'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
    captureError(error, { componentStack: info.componentStack ?? '' })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="bg-card border border-border rounded-2xl p-8 max-w-sm w-full text-center shadow-sm">
            <div className="w-14 h-14 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold mb-2">Algo correu mal</h2>
            <p className="text-sm text-muted-foreground mb-1">
              Ocorreu um erro inesperado na aplicação.
            </p>
            <p className="text-xs text-muted-foreground/70 mb-6 font-mono truncate px-2">
              {this.state.error.message}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => window.location.assign('/')}
                className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-colors"
              >
                Voltar ao Início
              </button>
              <button
                onClick={() => window.location.reload()}
                className="w-full py-3 border border-border rounded-xl text-sm font-medium hover:bg-accent transition-colors"
              >
                Recarregar Página
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
