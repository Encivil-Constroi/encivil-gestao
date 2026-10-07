import { AlertTriangle, RefreshCw } from 'lucide-react'

export function Carregando() {
  return <div className="bg-card rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground" role="status">A carregar…</div>
}

export function Erro({ mensagem, onRetry }: { mensagem: string; onRetry?: () => void }) {
  return (
    <div className="bg-card rounded-2xl border border-destructive/40 p-6 flex items-center gap-3" role="alert">
      <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
      <p className="text-sm flex-1">{mensagem}</p>
      {onRetry && (
        <button onClick={onRetry} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-accent">
          <RefreshCw className="w-3.5 h-3.5" /> Tentar de novo
        </button>
      )}
    </div>
  )
}

export function Vazio({ texto }: { texto: string }) {
  return <div className="bg-card rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground">{texto}</div>
}

export function Painel({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border bg-muted/30">
        <h2 className="font-semibold text-base">{titulo}</h2>
        {subtitulo && <p className="text-xs text-muted-foreground mt-0.5">{subtitulo}</p>}
      </div>
      {children}
    </div>
  )
}
