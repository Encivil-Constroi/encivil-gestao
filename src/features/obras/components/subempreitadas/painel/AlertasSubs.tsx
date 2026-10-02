import { Link } from 'react-router'
import { AlertTriangle, Info, ShieldAlert } from 'lucide-react'
import type { Gravidade, SubsAlerta } from '../../../db'

const ORDEM: Record<Gravidade, number> = { alta: 0, media: 1, baixa: 2 }
const INFO = {
  alta: { rotulo: 'Grave', cls: 'bg-destructive/10 text-destructive', Icone: ShieldAlert },
  media: { rotulo: 'Atenção', cls: 'bg-warning/15 text-warning', Icone: AlertTriangle },
  baixa: { rotulo: 'Informação', cls: 'bg-muted text-muted-foreground', Icone: Info },
} as const

export function ordenarAlertas(alertas: SubsAlerta[]): SubsAlerta[] {
  return [...alertas].sort((a, b) => ORDEM[a.gravidade] - ORDEM[b.gravidade])
}

export function AlertasSubs({ alertas }: { alertas: SubsAlerta[] }) {
  if (!alertas.length) return <p className="text-sm text-muted-foreground">Sem alertas ativos.</p>
  return (
    <ul className="space-y-2">
      {ordenarAlertas(alertas).map((a, i) => {
        const { rotulo, cls, Icone } = INFO[a.gravidade]
        const texto = a.sub_id
          ? <Link to={`/obras/subempreitada/${a.sub_id}`} className="underline-offset-2 hover:underline">{a.texto}</Link>
          : a.texto
        return (
          <li key={`${a.tipo}-${a.sub_id ?? 'x'}-${i}`} className="flex items-start gap-2 text-sm">
            <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
              <Icone className="h-3 w-3" aria-hidden="true" /> {rotulo}
            </span>
            <span className="min-w-0">{texto}</span>
          </li>
        )
      })}
    </ul>
  )
}
