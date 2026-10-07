import { Link } from 'react-router'
import { ChevronUp, ChevronDown, Minus } from 'lucide-react'
import type { Tendencia } from '@/app/lib/relatorios/tendencia'

type Props = {
  label: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  iconBg: string
  valueColor: string
  trend?: Tendencia
  loading?: boolean
  to?: string
}

export function KpiCard({ label, value, icon: Icon, iconBg, valueColor, trend = null, loading = false, to }: Props) {
  const corpo = (
    <div className={`bg-card rounded-2xl border border-border p-5 flex flex-col gap-3 h-full ${to ? 'hover:border-primary/40 transition-colors' : ''}`}>
      <div className="flex items-start justify-between">
        <div className={`p-2.5 rounded-xl ${iconBg}`}><Icon className={`w-5 h-5 ${valueColor}`} /></div>
        {trend ? (
          <span className={`flex items-center gap-0.5 text-xs font-semibold px-2 py-1 rounded-full ${
            trend.dir === 'up' ? 'bg-success/10 text-success' : trend.dir === 'down' ? 'bg-destructive/10 text-destructive' : 'bg-muted/50 text-muted-foreground'
          }`}>
            {trend.dir === 'up' ? <ChevronUp className="w-3 h-3" /> : trend.dir === 'down' ? <ChevronDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {trend.pct}%
          </span>
        ) : <span className="text-xs text-muted-foreground">—</span>}
      </div>
      <div>
        <p className={`text-2xl md:text-3xl font-bold ${valueColor}`}>{loading ? '…' : value}</p>
        <p className="text-xs text-muted-foreground mt-1 leading-tight">{label}</p>
      </div>
    </div>
  )
  return to ? <Link to={to} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl">{corpo}</Link> : corpo
}
