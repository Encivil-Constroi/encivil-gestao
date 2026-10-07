import { Link } from 'react-router'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

// Cada secção do Início trata sozinha o seu loading/erro: uma que falha não derruba as outras
export function Secao({ titulo, icone: Icone, para, paraRotulo = 'Abrir', children }: {
  titulo: string; icone: LucideIcon; para?: string; paraRotulo?: string; children: ReactNode
}) {
  return (
    <section className="bg-card rounded-2xl border border-border p-4 md:p-5 enc-fade-up" aria-label={titulo}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-semibold text-base flex items-center gap-2 min-w-0">
          <Icone className="w-4 h-4 text-primary shrink-0" aria-hidden="true" /> <span className="truncate">{titulo}</span>
        </h2>
        {para && (
          <Link to={para} className="text-sm text-primary hover:underline inline-flex items-center gap-0.5 shrink-0">
            {paraRotulo} <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

export function Esqueleto({ linhas = 2 }: { linhas?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="A carregar">
      {Array.from({ length: linhas }, (_, i) => <div key={i} className="skeleton h-4 w-full" />)}
    </div>
  )
}

export function ErroSecao({ mensagem, onRetry }: { mensagem: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 text-sm">
      <span className="text-destructive">{mensagem}</span>
      <button onClick={onRetry} className="px-3 py-1.5 border border-border rounded-lg hover:bg-accent shrink-0">
        Tentar de novo
      </button>
    </div>
  )
}

const COR = { neutro: 'text-foreground', sucesso: 'text-success', aviso: 'text-warning', perigo: 'text-destructive' } as const

export function Numero({ valor, rotulo, cor = 'neutro', para }: {
  valor: string | number; rotulo: string; cor?: keyof typeof COR; para?: string
}) {
  const corpo = (
    <>
      <p className={`text-2xl font-bold leading-tight ${COR[cor]}`}>{valor}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{rotulo}</p>
    </>
  )
  const cls = 'rounded-xl border border-border p-3 bg-background'
  return para
    ? <Link to={para} className={`${cls} hover:bg-accent/40 active:scale-[0.98] transition-all`}>{corpo}</Link>
    : <div className={cls}>{corpo}</div>
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}
