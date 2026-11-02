import { Link } from 'react-router'
import { ArrowDownCircle, ArrowUpCircle, Fuel, Truck, Undo2, Wrench, type LucideIcon } from 'lucide-react'

export type TomAtalho = 'saida' | 'entrada' | 'primario' | 'neutro'

// Saída e entrada mantêm a semântica com tinta suave; os restantes são neutros (sem blocos saturados no escuro)
const TOM: Record<TomAtalho, string> = {
  saida: 'border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15',
  entrada: 'border border-success/30 bg-success/10 text-success hover:bg-success/15',
  primario: 'border border-border bg-card text-foreground hover:bg-accent',
  neutro: 'border border-border bg-card text-foreground hover:bg-accent',
}

const ICONE: Record<string, LucideIcon> = {
  '/armazem/movimento/saida': ArrowUpCircle,
  '/armazem/movimento/entrada': ArrowDownCircle,
  '/abastecimento/pedir': Fuel,
  '/frota/entregar': Truck,
  '/frota/devolver': Undo2,
  '/frota/manutencao/nova': Wrench,
}

export function AtalhoRapido({ to, rotulo, tom }: { to: string; rotulo: string; tom: TomAtalho }) {
  const Icone = ICONE[to]
  return (
    <Link to={to}
      className={`flex min-h-11 flex-col sm:flex-row items-center justify-center gap-1.5 px-3 py-3 text-xs sm:text-sm text-center rounded-xl font-medium active:scale-95 transition-all ${TOM[tom]}`}>
      {Icone && <Icone className="size-5 shrink-0" aria-hidden="true" />}
      <span>{rotulo}</span>
    </Link>
  )
}
