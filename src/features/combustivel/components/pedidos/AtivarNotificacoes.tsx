import { useState } from 'react'
import { BellRing, Share } from 'lucide-react'
import { estadoPush, pedirNotificacoes, type EstadoPush } from '@/app/lib/push'

// Botão visível nos ecrãs do abastecimento: sem notificações o motorista não
// sabe que foi aprovado e o aprovador não sabe que há pedidos
export function AtivarNotificacoes({ motivo }: { motivo: string }) {
  const [estado, setEstado] = useState<EstadoPush>(() => estadoPush())
  const [aPedir, setAPedir] = useState(false)

  if (estado === 'ativo' || estado === 'indisponivel') return null

  if (estado === 'instalar-ios') {
    return (
      <div className="flex items-start gap-3 p-3.5 rounded-xl border border-primary/20 bg-primary/5 text-sm">
        <Share className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          <strong>Receber notificações no iPhone:</strong> toque em <strong>Partilhar</strong> →{' '}
          <strong>Adicionar ao ecrã principal</strong> e abra a app a partir do ícone.
        </p>
      </div>
    )
  }

  if (estado === 'bloqueado') {
    return (
      <p className="p-3.5 rounded-xl border border-warning/30 bg-warning/10 text-sm">
        As notificações estão bloqueadas neste telemóvel. Ative-as nas definições do browser para esta app.
      </p>
    )
  }

  const ativar = async () => {
    setAPedir(true)
    try { await pedirNotificacoes() } catch { /* o estado abaixo mostra o resultado */ }
    setAPedir(false)
    setEstado(estadoPush())
  }

  return (
    <button type="button" onClick={ativar} disabled={aPedir}
      className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-primary/30 bg-primary/5 text-left active:scale-[0.99] transition-transform disabled:opacity-60">
      <BellRing className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
      <span className="text-sm">
        <strong className="text-primary">Ativar notificações</strong> {motivo}.
      </span>
    </button>
  )
}
