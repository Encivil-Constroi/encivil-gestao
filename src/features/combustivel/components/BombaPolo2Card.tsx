import { useState } from 'react'
import { Droplets, Power, WifiOff, AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useEstadoBomba, usePararBomba } from '../hooks/useBombaPolo2'

function tempoDesde(seg: number) {
  if (seg < 60)   return `${seg}s`
  if (seg < 3600) return `${Math.floor(seg / 60)} min`
  if (seg < 86_400) return `${Math.floor(seg / 3600)} h`
  return `${Math.floor(seg / 86_400)} dias`
}

export function BombaPolo2Card() {
  const { estado, loading, reload } = useEstadoBomba()
  const { parar, loading: parando } = usePararBomba()
  const [confirmar, setConfirmar] = useState(false)

  const handleParar = async () => {
    const ok = await parar()
    setConfirmar(false)
    if (ok) {
      toast.success('Comando enviado — a bomba desliga em até 5 segundos.')
      reload()
    } else {
      toast.error('Não foi possível enviar o comando. Use a EMERGENZA no quadro.')
    }
  }

  if (!estado) {
    return (
      <div className="bg-card rounded-2xl border border-border p-4 flex items-center gap-3">
        <div className="p-2 rounded-xl bg-muted"><Droplets className="w-4 h-4 text-muted-foreground" /></div>
        <p className="text-sm text-muted-foreground">
          {loading ? 'A ler estado da bomba Polo 2…' : 'Bomba Polo 2 ainda não comunicou com o sistema (Shelly por instalar).'}
        </p>
      </div>
    )
  }

  const aTrabalhar = estado.online && estado.relayOn === true

  return (
    <div className={`bg-card rounded-2xl border p-4 space-y-3 ${
      !estado.online ? 'border-destructive/40' : aTrabalhar ? 'border-blue-300' : 'border-border'
    }`}>
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-xl ${aTrabalhar ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-muted'}`}>
          {estado.online
            ? <Droplets className={`w-4 h-4 ${aTrabalhar ? 'text-blue-600 animate-pulse' : 'text-muted-foreground'}`} />
            : <WifiOff className="w-4 h-4 text-destructive" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Bomba Polo 2</p>
          <p className="text-xs text-muted-foreground">
            {!estado.online
              ? `Offline — sem contacto há ${tempoDesde(estado.segundosSemContacto)}`
              : aTrabalhar ? 'A trabalhar (relé ligado)' : 'Online · parada'}
          </p>
        </div>
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
          !estado.online ? 'bg-destructive' : aTrabalhar ? 'bg-blue-500 animate-pulse' : 'bg-success'
        }`} />
      </div>

      {estado.online && estado.nivelAlarme && (
        <p className="flex items-center gap-2 text-xs font-medium text-warning bg-warning/10 border border-warning/30 rounded-lg px-2.5 py-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Sensor de nível ativo (LIVELLO) — depósito em reserva
        </p>
      )}

      {estado.online && (
        confirmar ? (
          <div className="flex gap-2">
            <button
              onClick={handleParar}
              disabled={parando}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-destructive text-destructive-foreground rounded-xl text-sm font-semibold hover:bg-destructive/90 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {parando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
              Confirmar corte
            </button>
            <button
              onClick={() => setConfirmar(false)}
              className="flex-1 py-2.5 border border-border rounded-xl text-sm font-medium hover:bg-accent transition-colors"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmar(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2 bg-destructive/10 text-destructive rounded-xl text-xs font-semibold hover:bg-destructive/20 transition-colors"
          >
            <Power className="w-3.5 h-3.5" />
            Desligar bomba agora
          </button>
        )
      )}
    </div>
  )
}
