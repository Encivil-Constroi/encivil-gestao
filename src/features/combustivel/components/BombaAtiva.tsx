import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Droplets, Loader2 } from 'lucide-react'
import { useEstadoPedidoBomba, usePararBomba } from '../hooks/useBombaPolo2'
import type { MotivoFimSessao } from '../services/bombaService'

const FIM_SESSAO: Record<MotivoFimSessao, string> = {
  TEMPO:        'tempo esgotado',
  TERMINEI:     'desligada por ti',
  EMERGENCIA:   'desligada pelo responsável',
  INTERROMPIDO: 'a bomba parou',
}

// O Shelly reporta a cada 5s: 20s sem confirmação = algo está errado
export const CONFIRMACAO_MAX_MS = 20_000

// Página do motorista (Polo 2), depois de a bomba arrancar
export function BombaAtiva({ ativadaEm, maxSegundos, pedidoId }: {
  ativadaEm:   string
  maxSegundos: number
  pedidoId:    string
}) {
  const estado = useEstadoPedidoBomba(pedidoId)
  const { parar, loading } = usePararBomba()
  const [agora, setAgora] = useState(() => Date.now())
  const [paragemPedida, setParagemPedida] = useState(false)
  const [falhou, setFalhou] = useState(false)
  const [fimVistoEm, setFimVistoEm] = useState<number | null>(null)

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1_000)
    return () => clearInterval(t)
  }, [])

  const restante = Math.max(0, Math.round((new Date(ativadaEm).getTime() + maxSegundos * 1_000 - agora) / 1_000))
  // Fim do tempo conta mesmo sem resposta do servidor: com o Shelly offline a sessão
  // nunca fecha, e o motorista tem de ver o alerta em vez de "0:00" para sempre
  const ativa = !paragemPedida && restante > 0 && (estado ? estado.sessaoAtiva : true)
  const pct   = Math.min(100, (restante / maxSegundos) * 100)
  const mmss  = `${Math.floor(restante / 60)}:${String(restante % 60).padStart(2, '0')}`

  useEffect(() => {
    if (!ativa && fimVistoEm === null) setFimVistoEm(Date.now())
  }, [ativa, fimVistoEm])

  const handleParar = async () => {
    setFalhou(false)
    if (await parar(pedidoId)) setParagemPedida(true)
    else setFalhou(true)
  }

  if (!ativa) {
    if (estado?.desligadaConfirmada) {
      return (
        <div role="status" className="flex items-center justify-center gap-2 p-4 bg-success/10 border border-success/30 rounded-2xl text-sm text-success font-semibold">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          Bomba desligada{estado.motivoFim ? ` — ${FIM_SESSAO[estado.motivoFim]}` : ''}
        </div>
      )
    }
    if (fimVistoEm !== null && agora - fimVistoEm > CONFIRMACAO_MAX_MS) {
      return (
        <div role="alert" className="flex items-start gap-2.5 p-4 bg-destructive/10 border border-destructive/30 rounded-2xl text-sm text-destructive">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>
            <strong>Não foi possível confirmar que a bomba desligou.</strong><br />
            Se ainda estiver a trabalhar, carrega no botão vermelho EMERGENZA do quadro.
          </span>
        </div>
      )
    }
    return (
      <div role="status" className="flex items-center justify-center gap-2 p-4 bg-muted border border-border rounded-2xl text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        {paragemPedida ? 'A desligar a bomba…' : 'A confirmar que a bomba desligou…'}
      </div>
    )
  }

  return (
    <div className="p-4 bg-info/10 border border-info/30 rounded-2xl space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-info font-semibold text-sm">
          <Droplets className="w-4 h-4 animate-pulse" />
          Bomba liberada
        </div>
        <span className="text-2xl font-bold tabular-nums text-info">{mmss}</span>
      </div>
      <div className="h-2 bg-info/10 rounded-full overflow-hidden">
        <div className="h-full bg-info rounded-full transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-info">
        Se a bomba não arrancar sozinha, carrega no botão verde (I) do quadro.
      </p>
      <button type="button" onClick={handleParar} disabled={loading}
        className="w-full py-3.5 bg-destructive text-destructive-foreground rounded-xl font-bold text-base active:scale-[0.98] transition-transform disabled:opacity-60 flex items-center justify-center gap-2">
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        Terminei — desligar bomba
      </button>
      {falhou && (
        <p role="alert" className="text-xs text-destructive font-medium text-center">
          Não foi possível desligar pela app. Usa o botão vermelho EMERGENZA no quadro.
        </p>
      )}
    </div>
  )
}
