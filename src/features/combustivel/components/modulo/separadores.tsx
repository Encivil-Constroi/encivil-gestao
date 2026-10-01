import { useRole } from '@/features/auth/useRole'
import { usePodeAprovar } from '../../hooks/useAprovacao'
import { BombaPolo2Card } from '../BombaPolo2Card'
import { ListaPedidos } from '../pedidos/ListaPedidos'
import { AtivarNotificacoes } from '../pedidos/AtivarNotificacoes'

export function SeparadorPedidos() {
  const { isMotorista } = useRole()
  const { podeAprovar } = usePodeAprovar()
  // Quem aprova vê e controla todos; os outros só os seus (o motorista já é limitado pela RLS)
  const veTodos = !isMotorista && podeAprovar
  return (
    <div className="space-y-4">
      {podeAprovar && <AtivarNotificacoes motivo="para receber os pedidos na hora" />}
      {/* key: ao saber que aprova, a lista recomeça com o filtro "A aguardar" */}
      <ListaPedidos key={String(veTodos)} veTodos={veTodos} />
    </div>
  )
}

export function SeparadorBomba() {
  return <BombaPolo2Card />
}
