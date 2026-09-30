// Pede permissão de notificações push e guarda a subscrição no Supabase.
// Todos os papéis: quem pede abastecimento recebe a decisão, quem aprova
// recebe os pedidos, o mecânico recebe os alertas da frota. Quem recebe o
// quê decide-se no servidor (notificar-abastecimento, send-push-frota).
// Integrado no MainLayout — apenas corre para utilizadores autenticados.
import { useEffect, useRef } from 'react'
import { useRole } from '@/features/auth/useRole'
import { toast } from 'sonner'
import { estadoPush, pedirNotificacoes, subscreverSeNecessario } from '@/app/lib/push'

export function textoPedidoPush(role: string | null): string {
  if (role === 'mecanico') return 'Ativar notificações da frota (revisões, seguro, IPO)?'
  if (role === 'motorista') return 'Ativar notificações para saber quando o abastecimento é aprovado?'
  return 'Ativar notificações (pedidos de abastecimento e avisos)?'
}

export function PushSetup() {
  const { role } = useRole()
  const tentouRef = useRef(false)

  useEffect(() => {
    if (!role || role === 'leitura') return
    if (tentouRef.current) return
    const estado = estadoPush()
    if (estado === 'indisponivel' || estado === 'instalar-ios' || estado === 'bloqueado') return
    tentouRef.current = true

    // Já autorizado → subscrever em silêncio (ex.: após reinstalar o SW)
    if (estado === 'ativo') {
      subscreverSeNecessario().catch(() => {})
      return
    }

    // Por pedir → toast não intrusivo depois de 5 s (o botão é o gesto que o iPhone exige)
    const t = setTimeout(() => {
      toast(textoPedidoPush(role), {
        duration: 10_000,
        action: { label: 'Ativar', onClick: () => { pedirNotificacoes().catch(() => {}) } },
        cancel: { label: 'Agora não', onClick: () => {} },
      })
    }, 5_000)
    return () => clearTimeout(t)
  }, [role])

  return null
}
