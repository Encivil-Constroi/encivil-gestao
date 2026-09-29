import { useNavigate } from 'react-router'
import { ChevronLeft, ShieldAlert, AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { ReactNode } from 'react'
import type { EstadoItem } from '../db'
import type { Severidade } from '../lib/frota'

export const inputCls =
  'w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-base disabled:opacity-60'

export function Cabecalho({ titulo, subtitulo, acoes }: { titulo: string; subtitulo?: ReactNode; acoes?: ReactNode }) {
  const navigate = useNavigate()
  return (
    <div className="flex items-start gap-3 flex-wrap">
      <button onClick={() => navigate(-1)} aria-label="Voltar"
        className="p-2 hover:bg-accent rounded-lg transition-colors shrink-0">
        <ChevronLeft className="w-5 h-5" aria-hidden="true" />
      </button>
      <div className="flex-1 min-w-0">
        <h1 className="text-xl md:text-2xl font-semibold truncate">{titulo}</h1>
        {subtitulo && <p className="text-sm text-muted-foreground mt-0.5">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex gap-2 flex-wrap">{acoes}</div>}
    </div>
  )
}

export function BadgeSeveridade({ severidade }: { severidade: Severidade }) {
  if (severidade === 'URGENTE') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-destructive/10 text-destructive">
      <ShieldAlert className="w-3 h-3" aria-hidden="true" /> Urgente
    </span>
  )
  if (severidade === 'ATENCAO') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-warning/15 text-warning">
      <AlertTriangle className="w-3 h-3" aria-hidden="true" /> Atenção
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success">
      <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> Em dia
    </span>
  )
}

const ESTADO_CLS: Record<EstadoItem, string> = {
  OK:      'bg-success/10 text-success',
  ATENCAO: 'bg-warning/15 text-warning',
  MAU:     'bg-destructive/10 text-destructive',
}
const ESTADO_TXT: Record<EstadoItem, string> = { OK: 'OK', ATENCAO: 'Atenção', MAU: 'Mau' }

export function BadgeEstado({ estado }: { estado: EstadoItem }) {
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${ESTADO_CLS[estado]}`}>{ESTADO_TXT[estado]}</span>
}

export function Seccao({ titulo, icone, acao, children }: { titulo: string; icone?: ReactNode; acao?: ReactNode; children: ReactNode }) {
  return (
    <section className="bg-card rounded-2xl border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        {icone}
        <h2 className="text-sm font-semibold flex-1">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  )
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground py-2">{children}</p>
}

export const botaoPrimario =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60'
export const botaoSecundario =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-secondary/20 text-foreground rounded-xl text-sm font-medium hover:bg-secondary/30 transition-all disabled:opacity-60'

export function formatarEuros(n: number): string {
  return n.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

export function formatarKm(n: number | null | undefined): string {
  return n == null ? '—' : `${Number(n).toLocaleString('pt-PT')} km`
}
