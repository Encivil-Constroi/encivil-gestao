import { useNavigate } from 'react-router'
import { Bell, AlertTriangle, XCircle, Wrench, ShieldAlert, CheckCircle2, ChevronRight, X } from 'lucide-react'
import type { AppNotification } from '@/features/notificacoes/hooks/useNotifications'

interface Props {
  notifications: AppNotification[]
  loading: boolean
  error?: boolean
  onClose: () => void
}

function iconFor(n: AppNotification) {
  if (n.kind === 'tool-overdue') return <Wrench className="w-4 h-4 text-destructive" />
  if (n.kind === 'pending') return <ShieldAlert className="w-4 h-4 text-info" />
  return n.severity === 'danger'
    ? <XCircle className="w-4 h-4 text-destructive" />
    : <AlertTriangle className="w-4 h-4 text-warning" />
}

function iconBg(n: AppNotification) {
  if (n.kind === 'pending') return 'bg-info/10'
  return n.severity === 'danger' ? 'bg-destructive/10' : 'bg-warning/10'
}

export function NotificationPanel({ notifications, loading, error, onClose }: Props) {
  const navigate = useNavigate()

  return (
    <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-card border border-border rounded-2xl shadow-xl z-50 overflow-hidden enc-slide-down">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-foreground" />
          <span className="font-semibold text-sm">Notificações</span>
          {notifications.length > 0 && (
            <span className="bg-destructive text-destructive-foreground text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center leading-tight">
              {notifications.length}
            </span>
          )}
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors" aria-label="Fechar notificações">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="max-h-72 overflow-y-auto overscroll-contain">
        {loading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">A carregar…</div>
        ) : error ? (
          <div className="p-6 flex flex-col items-center gap-2.5">
            <div className="w-11 h-11 bg-destructive/10 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>
            <p className="text-sm text-muted-foreground text-center">Erro ao carregar alertas. Tente de novo mais tarde.</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-6 flex flex-col items-center gap-2.5">
            <div className="w-11 h-11 bg-success/10 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-success" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold">Tudo em ordem</p>
              <p className="text-xs text-muted-foreground mt-0.5">Sem alertas pendentes</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {notifications.map(n => (
              <button
                key={n.id}
                onClick={() => { navigate(n.link); onClose() }}
                className="w-full px-4 py-3 flex items-start gap-3 hover:bg-accent/50 active:bg-accent/80 text-left transition-colors"
              >
                <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${iconBg(n)}`}>{iconFor(n)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.subtitle}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
