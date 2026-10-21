import { useAsync } from '@/app/lib/useAsync'
import { useRole } from '@/features/auth/useRole'
import { useIntervaloVisivel } from '@/app/lib/useIntervaloVisivel'
import { carregarNotificacoes, type AppNotification } from '../services/notificacoesService'

export type { AppNotification, NotificationKind, NotificationSeverity } from '../services/notificacoesService'

export function useNotifications() {
  const { podeValidar, podeCombustivel, isMecanico, isMotorista } = useRole()
  // O mecânico e o motorista não gerem stock nem autos: o sino fica vazio
  const semSino = isMecanico || isMotorista

  const { data, loading, error, reload } = useAsync(
    () => carregarNotificacoes({ podeValidar, podeCombustivel }),
    [podeValidar, podeCombustivel],
    { enabled: !semSino, errorMsg: 'Erro ao carregar notificações' },
  )

  // Voltar à app/separador já recarrega (useIntervaloVisivel); o 'focus' repetia o pedido
  useIntervaloVisivel(reload, 60_000, !semSino)

  const items: AppNotification[] = semSino ? [] : (data ?? [])
  return { notifications: items, count: items.length, loading, error: !!error, reload }
}
