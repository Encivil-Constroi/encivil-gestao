import { useNavigate } from 'react-router'
import { ChevronLeft, Clock, AlertTriangle, Flame } from 'lucide-react'
import type { ReactNode } from 'react'
import type { EstadoPedido } from '../../db'
import { ROTULO_ESTADO, nivelEspera, textoDuracao, type NivelEspera } from '../../lib/pedido'

export const inputCls =
  'w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-base disabled:opacity-60'

export const botaoPrimario =
  'inline-flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60'
export const botaoSecundario =
  'inline-flex items-center justify-center gap-2 px-4 py-3 border border-border rounded-xl text-sm font-medium hover:bg-accent transition-all disabled:opacity-60'
export const botaoPerigo =
  'inline-flex items-center justify-center gap-2 px-4 py-3 bg-destructive/10 text-destructive rounded-xl text-sm font-semibold hover:bg-destructive/20 active:scale-[0.98] transition-all disabled:opacity-60'

export function Cabecalho({ titulo, subtitulo, voltar = true, acoes }: {
  titulo: string; subtitulo?: ReactNode; voltar?: boolean; acoes?: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <div className="flex items-start gap-3 flex-wrap">
      {voltar && (
        <button onClick={() => navigate(-1)} aria-label="Voltar"
          className="p-2 hover:bg-accent rounded-lg transition-colors shrink-0">
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-xl md:text-2xl font-semibold">{titulo}</h1>
        {subtitulo && <p className="text-sm text-muted-foreground mt-0.5">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex gap-2 flex-wrap">{acoes}</div>}
    </div>
  )
}

export function Cartao({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`bg-card rounded-2xl border border-border p-4 space-y-3 ${className}`}>{children}</section>
}

const COR_ESTADO: Record<EstadoPedido, string> = {
  AGUARDA_AUTORIZACAO: 'bg-warning/15 text-warning',
  AUTORIZADO:          'bg-primary/10 text-primary',
  AGUARDA_APROVACAO:   'bg-muted text-muted-foreground',
  REJEITADO:           'bg-destructive/10 text-destructive',
  CONCLUIDO:           'bg-success/10 text-success',
  CANCELADO:           'bg-muted text-muted-foreground',
}

export function BadgeEstado({ estado }: { estado: EstadoPedido }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${COR_ESTADO[estado]}`}>
      {ROTULO_ESTADO[estado]}
    </span>
  )
}

const COR_ESPERA: Record<NivelEspera, string> = {
  normal:  'bg-muted text-muted-foreground',
  atencao: 'bg-warning/15 text-warning',
  critico: 'bg-destructive/10 text-destructive',
}

// Há quanto tempo o motorista espera pela decisão (30 min atenção, 1 h crítico)
export function BadgeEspera({ minutos }: { minutos: number }) {
  const nivel = nivelEspera(minutos)
  const Icone = nivel === 'critico' ? Flame : nivel === 'atencao' ? AlertTriangle : Clock
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${COR_ESPERA[nivel]}`}
      title="Tempo à espera de decisão">
      <Icone className="w-3 h-3" aria-hidden="true" />
      à espera há {textoDuracao(minutos)}
    </span>
  )
}

export function Aviso({ tipo = 'info', children }: { tipo?: 'info' | 'alerta' | 'erro' | 'ok'; children: ReactNode }) {
  const cls = {
    info:   'bg-primary/5 border-primary/15 text-foreground',
    alerta: 'bg-warning/10 border-warning/30 text-foreground',
    erro:   'bg-destructive/10 border-destructive/30 text-destructive',
    ok:     'bg-success/10 border-success/30 text-foreground',
  }[tipo]
  return (
    <div role={tipo === 'erro' ? 'alert' : 'status'} className={`p-3.5 border rounded-xl text-sm ${cls}`}>
      {children}
    </div>
  )
}
