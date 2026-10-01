import { useNavigate } from 'react-router'
import { ChevronLeft, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import type { EstadoObra, Saude } from '../db'
import { SAUDE_INFO, ESTADO_CLS, rotuloEstado } from '../lib/saude'
import { limitarPct } from '../lib/progresso'

export const inputCls =
  'w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-base disabled:opacity-60'

export const botaoPrimario =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60'
export const botaoSecundario =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-secondary/20 text-foreground rounded-xl text-sm font-medium hover:bg-secondary/30 transition-all disabled:opacity-60'

export function Cabecalho({ titulo, subtitulo, acoes }: { titulo: string; subtitulo?: ReactNode; acoes?: ReactNode }) {
  const navigate = useNavigate()
  return (
    <div className="flex items-start gap-3 flex-wrap">
      <button type="button" onClick={() => navigate(-1)} aria-label="Voltar"
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

const ICONES_SAUDE = { CheckCircle2, AlertTriangle, ShieldAlert }

// Cor + texto + ícone: o semáforo nunca depende só da cor
export function SaudeBadge({ saude, className = '' }: { saude: Saude; className?: string }) {
  const info = SAUDE_INFO[saude]
  const Icone = ICONES_SAUDE[info.icone]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${info.cls} ${className}`}>
      <Icone className="w-3 h-3" aria-hidden="true" /> {info.rotulo}
    </span>
  )
}

export function EstadoBadge({ estado }: { estado: EstadoObra }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${ESTADO_CLS[estado]}`}>
      {rotuloEstado(estado)}
    </span>
  )
}

// Anel de progresso real; a marca fina indica onde a obra devia estar
export function ProgressoAnel({
  pct, esperado = null, saude = 'ok', tamanho = 88,
}: { pct: number | null; esperado?: number | null; saude?: Saude; tamanho?: number }) {
  const real = limitarPct(pct)
  const prev = limitarPct(esperado)
  const raio = 40
  const circ = 2 * Math.PI * raio
  const cor = saude === 'critico' ? 'stroke-destructive' : saude === 'atencao' ? 'stroke-warning' : 'stroke-success'
  const ponto = (p: number) => {
    const ang = (p / 100) * 2 * Math.PI - Math.PI / 2
    return { x: 50 + Math.cos(ang) * raio, y: 50 + Math.sin(ang) * raio, xi: 50 + Math.cos(ang) * (raio - 7), yi: 50 + Math.sin(ang) * (raio - 7) }
  }
  const m = prev != null ? ponto(prev) : null
  return (
    <div className="relative shrink-0" style={{ width: tamanho, height: tamanho }}
      role="img" aria-label={real == null ? 'Sem progresso registado' : `Progresso ${Math.round(real)} por cento${prev != null ? `, previsto ${Math.round(prev)} por cento` : ''}`}>
      <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true">
        <circle cx="50" cy="50" r={raio} fill="none" strokeWidth="9" className="stroke-muted" />
        {real != null && real > 0 && (
          <circle cx="50" cy="50" r={raio} fill="none" strokeWidth="9" strokeLinecap="round"
            className={cor} strokeDasharray={`${(real / 100) * circ} ${circ}`} transform="rotate(-90 50 50)" />
        )}
        {m && <line x1={m.xi} y1={m.yi} x2={m.x + (m.x - m.xi) * 0.4} y2={m.y + (m.y - m.yi) * 0.4} strokeWidth="3" className="stroke-foreground" />}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold leading-none">{real == null ? '—' : `${Math.round(real)}%`}</span>
      </div>
    </div>
  )
}

// Barra com a marca do previsto (progresso) ou do limite (orçamento)
export function Barra({
  pct, marca = null, cor = 'bg-primary', rotulo,
}: { pct: number | null; marca?: number | null; cor?: string; rotulo: string }) {
  const v = limitarPct(pct) ?? 0
  const mk = limitarPct(marca)
  return (
    <div className="relative h-2 rounded-full bg-muted overflow-visible" role="img" aria-label={rotulo}>
      <div className={`h-full rounded-full ${cor}`} style={{ width: `${v}%` }} />
      {mk != null && <span className="absolute -top-0.5 w-0.5 h-3 bg-foreground rounded" style={{ left: `calc(${mk}% - 1px)` }} />}
    </div>
  )
}
