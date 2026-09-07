import { Bell, ChevronRight, AlertTriangle, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router'
import { useAlertasAtivos } from '../hooks/useAlertas'
import { labelTipo } from '../services/alertasService'
import type { Alerta } from '@/app/types'

function AlertaRow({ alerta }: { alerta: Alerta }) {
  const isUrgent = alerta.severidade === 'URGENTE'
  return (
    <div className={`p-3 rounded-lg border transition-colors ${
      isUrgent
        ? 'bg-destructive/5 border-destructive/20'
        : 'bg-warning/5 border-warning/20'
    }`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-sm font-medium leading-tight flex-1 truncate">
          {alerta.entidadeNome ?? '—'}
        </p>
        <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
          isUrgent
            ? 'bg-destructive/10 text-destructive'
            : 'bg-warning/15 text-warning'
        }`}>
          {isUrgent
            ? <ShieldAlert className="w-3 h-3" />
            : <AlertTriangle className="w-3 h-3" />
          }
          {isUrgent ? 'Urgente' : 'Atenção'}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{labelTipo(alerta.regraTipo)}</p>
    </div>
  )
}

export function AlertasWidget() {
  const { alertas, loading } = useAlertasAtivos()

  const urgentes = alertas.filter(a => a.severidade === 'URGENTE' && a.estado === 'ATIVO').length
  const total = alertas.filter(a => a.estado === 'ATIVO').length
  const preview = alertas.filter(a => a.estado === 'ATIVO').slice(0, 4)

  return (
    <div className="bg-card rounded-xl border border-border enc-fade-up">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="font-semibold text-base flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" /> Alertas de Manutenção
        </h2>
        {total > 0 && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            urgentes > 0 ? 'bg-destructive/10 text-destructive' : 'bg-warning/15 text-warning'
          }`}>
            {total}
          </span>
        )}
      </div>

      <div className="p-4">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="p-3 rounded-lg border border-border space-y-2">
                <div className="skeleton h-3.5 w-3/4" />
                <div className="skeleton h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : total === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Sem alertas ativos ✓
          </p>
        ) : (
          <div className="space-y-3">
            {preview.map(a => <AlertaRow key={a.id} alerta={a} />)}
          </div>
        )}
      </div>

      {total > 0 && (
        <div className="px-4 pb-4">
          <Link
            to="/alertas"
            className="w-full py-2.5 border border-border rounded-lg text-sm text-foreground hover:bg-accent transition-colors flex items-center justify-center gap-1"
          >
            Ver todos os alertas <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  )
}
