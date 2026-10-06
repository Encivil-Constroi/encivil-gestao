import { useState } from 'react'
import { Droplets, Power, WifiOff, AlertTriangle, Loader2, Lock, Unlock, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { useEstadoBomba, useSessoesBomba, usePararBomba, useDefinirRegrasBomba } from '../hooks/useBombaPolo2'
import type { EstadoBomba, MotivoFimSessao, SessaoBomba } from '../services/bombaService'

const MOTIVO: Record<MotivoFimSessao, string> = {
  TEMPO:        'tempo esgotado',
  TERMINEI:     'terminou',
  EMERGENCIA:   'corte de emergência',
  INTERROMPIDO: 'interrompida',
}

function tempoDesde(seg: number) {
  if (seg < 60)   return `${seg}s`
  if (seg < 3600) return `${Math.floor(seg / 60)} min`
  if (seg < 86_400) return `${Math.floor(seg / 3600)} h`
  return `${Math.floor(seg / 86_400)} dias`
}

const hhmm = (d: string | number) => new Date(d).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })

function duracao(s: SessaoBomba) {
  const seg = Math.max(0, Math.round((new Date(s.fimEm!).getTime() - new Date(s.inicioEm).getTime()) / 1000))
  return seg < 60 ? `${seg}s` : `${Math.round(seg / 60)} min`
}

const btnSec = 'flex-1 py-2 border border-border rounded-xl text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50'
const inputCls = 'px-2.5 py-1.5 bg-input-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary'

export function BombaPolo2Card() {
  const { estado, loading } = useEstadoBomba()
  const { sessoes } = useSessoesBomba()
  const { parar, loading: parando } = usePararBomba()
  const [confirmar, setConfirmar] = useState(false)

  const ativa      = sessoes.find(s => s.fimEm === null)
  const anteriores = sessoes.filter(s => s.fimEm !== null).slice(0, 3)

  const handleParar = async () => {
    const ok = await parar()
    setConfirmar(false)
    if (ok) {
      toast.success('Comando enviado — a bomba desliga em até 5 segundos.')
    } else {
      toast.error('Não foi possível enviar o comando. Use a EMERGENZA no quadro.')
    }
  }

  if (!estado) {
    return (
      <div className="bg-card rounded-2xl border border-border p-4 flex items-center gap-3">
        <div className="p-2 rounded-xl bg-muted"><Droplets className="w-4 h-4 text-muted-foreground" /></div>
        <p className="text-sm text-muted-foreground">
          {loading ? 'A ler estado da bomba Polo 2…' : 'Não foi possível ler o estado da bomba Polo 2.'}
        </p>
      </div>
    )
  }

  const aTrabalhar = estado.online && estado.relayOn === true
  const manual     = ativa?.origem === 'MANUAL'

  return (
    <div className={`bg-card rounded-2xl border p-4 space-y-3 ${
      manual ? 'border-destructive/50'
        : !estado.online && !estado.nuncaComunicou ? 'border-destructive/40'
        : aTrabalhar ? 'border-info/30' : 'border-border'
    }`}>
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-xl ${aTrabalhar ? 'bg-info/10' : 'bg-muted'}`}>
          {estado.online || estado.nuncaComunicou
            ? <Droplets className={`w-4 h-4 ${aTrabalhar ? 'text-info animate-pulse' : 'text-muted-foreground'}`} />
            : <WifiOff className="w-4 h-4 text-destructive" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Bomba Polo 2</p>
          <p className="text-xs text-muted-foreground">
            {estado.nuncaComunicou
              ? 'Ainda não comunicou (Shelly por instalar)'
              : !estado.online
                ? `Offline — sem contacto há ${tempoDesde(estado.segundosSemContacto ?? 0)}`
                : aTrabalhar ? 'A trabalhar (relé ligado)' : 'Online · parada'}
          </p>
        </div>
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
          estado.nuncaComunicou ? 'bg-muted-foreground/40'
            : !estado.online ? 'bg-destructive'
            : aTrabalhar ? 'bg-info animate-pulse' : 'bg-success'
        }`} />
      </div>

      {manual && (
        <p className="flex items-start gap-2 text-xs font-medium text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-2.5 py-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          Bomba ligada FORA DA APP desde as {hhmm(ativa.inicioEm)} (app Shelly ou Web UI). Sem registo de motorista.
        </p>
      )}

      {ativa && !manual && (
        <p className="text-xs bg-info/10 border border-info/30 text-info rounded-lg px-2.5 py-1.5">
          Em uso: <strong>{ativa.veiculoNome ?? 'viatura'}</strong>
          {ativa.funcionarioNome && <> · {ativa.funcionarioNome}</>}
          {' '}· até às {hhmm(new Date(ativa.inicioEm).getTime() + ativa.segundosAutorizados * 1000)}
        </p>
      )}

      {estado.bloqueioMotivo && (
        <p className="flex items-center gap-2 text-xs font-medium text-warning bg-warning/10 border border-warning/30 rounded-lg px-2.5 py-1.5">
          <Lock className="w-3.5 h-3.5 shrink-0" />
          {estado.bloqueioMotivo} — não aceita novas autorizações
        </p>
      )}

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
            <button onClick={() => setConfirmar(false)} className={btnSec}>Cancelar</button>
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

      <RegrasBomba estado={estado} />

      {anteriores.length > 0 && (
        <ul className="border-t border-border pt-2.5 space-y-1">
          {anteriores.map(s => (
            <li key={s.id} className="flex items-baseline gap-2 text-xs text-muted-foreground">
              <span className="tabular-nums shrink-0">{hhmm(s.inicioEm)}</span>
              <span className="truncate flex-1 min-w-0">
                {s.origem === 'MANUAL'
                  ? <span className="text-destructive font-medium">fora da app</span>
                  : <>
                      <span className="text-foreground">{s.veiculoNome ?? 'viatura'}</span>
                      {s.funcionarioNome && <> · {s.funcionarioNome}</>}
                    </>}
              </span>
              <span className={`shrink-0 tabular-nums ${s.motivoFim === 'EMERGENCIA' || s.motivoFim === 'INTERROMPIDO' ? 'text-warning' : ''}`}>
                {duracao(s)}
                {s.origem === 'APP' && s.motivoFim && <> · {MOTIVO[s.motivoFim]}</>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RegrasBomba({ estado }: { estado: EstadoBomba }) {
  const { definir, loading, error } = useDefinirRegrasBomba()
  const [editar, setEditar] = useState<'bloqueio' | 'horario' | null>(null)
  const [motivo, setMotivo] = useState('')
  const [inicio, setInicio] = useState(estado.horarioInicio ?? '07:00')
  const [fim,    setFim]    = useState(estado.horarioFim ?? '19:00')

  const atuais = {
    bloqueada: estado.bloqueada, motivo: estado.motivo,
    horarioInicio: estado.horarioInicio, horarioFim: estado.horarioFim,
  }

  const guardar = async (alteracao: Partial<typeof atuais>, msg: string) => {
    if (await definir({ ...atuais, ...alteracao })) {
      toast.success(msg)
      setEditar(null)
    }
  }

  return (
    <div className="border-t border-border pt-2.5 space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground">Horário:</span>
        <span className="font-medium tabular-nums flex-1">
          {estado.horarioInicio ? `${estado.horarioInicio}–${estado.horarioFim}` : 'sempre'}
        </span>
        {editar !== 'horario' && (
          <button onClick={() => setEditar('horario')} className="text-primary font-medium hover:underline">Alterar</button>
        )}
      </div>

      {editar === 'horario' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input type="time" value={inicio} onChange={e => setInicio(e.target.value)} className={inputCls} aria-label="Início" />
            <span className="text-xs text-muted-foreground">até</span>
            <input type="time" value={fim} onChange={e => setFim(e.target.value)} className={inputCls} aria-label="Fim" />
          </div>
          <div className="flex gap-2">
            <button disabled={loading} onClick={() => guardar({ horarioInicio: inicio, horarioFim: fim }, 'Horário guardado.')}
              className="flex-1 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-semibold hover:bg-primary/90 disabled:opacity-50">
              Guardar
            </button>
            <button disabled={loading} onClick={() => guardar({ horarioInicio: null, horarioFim: null }, 'Horário removido — bomba disponível a qualquer hora.')}
              className={btnSec}>
              Sem horário
            </button>
            <button onClick={() => setEditar(null)} className={btnSec}>Cancelar</button>
          </div>
        </div>
      )}

      {estado.bloqueada ? (
        <button disabled={loading} onClick={() => guardar({ bloqueada: false, motivo: null }, 'Bomba desbloqueada.')}
          className="w-full flex items-center justify-center gap-1.5 py-2 border border-border rounded-xl text-xs font-semibold hover:bg-accent transition-colors disabled:opacity-50">
          <Unlock className="w-3.5 h-3.5" />
          Desbloquear bomba
        </button>
      ) : editar === 'bloqueio' ? (
        <div className="space-y-2">
          <input value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={120}
            placeholder="Motivo (opcional) — ex.: manutenção do filtro"
            className={`${inputCls} w-full`} />
          <div className="flex gap-2">
            <button disabled={loading} onClick={() => guardar({ bloqueada: true, motivo: motivo || null }, 'Bomba bloqueada.')}
              className="flex-1 py-2 bg-warning text-warning-foreground rounded-xl text-xs font-semibold hover:bg-warning/90 disabled:opacity-50">
              Confirmar bloqueio
            </button>
            <button onClick={() => setEditar(null)} className={btnSec}>Cancelar</button>
          </div>
          <p className="text-[11px] text-muted-foreground">Bloquear impede novos abastecimentos. Para parar quem está a abastecer use “Desligar bomba agora”.</p>
        </div>
      ) : (
        <button onClick={() => { setMotivo(''); setEditar('bloqueio') }}
          className="w-full flex items-center justify-center gap-1.5 py-2 border border-border rounded-xl text-xs font-medium hover:bg-accent transition-colors">
          <Lock className="w-3.5 h-3.5" />
          Bloquear bomba
        </button>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
