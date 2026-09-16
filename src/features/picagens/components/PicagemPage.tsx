import { useState, useEffect } from 'react'
import { Fingerprint, WifiOff, ChevronDown, Clock, LogIn, LogOut, Coffee, Play, CheckCircle2, AlertCircle, Hourglass, ExternalLink } from 'lucide-react'
import { Link } from 'react-router'
import { useAuth } from '@/features/auth/AuthContext'
import { useRole } from '@/features/auth/useRole'
import { useObras } from '@/features/obras/hooks/useObras'
import { useColaboradores } from '@/features/colaboradores/hooks/useColaboradores'
import { useColaboradorAtual } from '../hooks/useColaboradorAtual'
import { usePicagensDia } from '../hooks/usePicagensDia'
import { usePicar } from '../hooks/usePicar'
import { getQueue } from '../offlineQueue'
import type { TipoPicagem, ResultadoPicagem, Picagem } from '@/app/types'

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function horaLocal(d: Date): string {
  return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
}

function nextTipo(last: Picagem | undefined): TipoPicagem {
  if (!last) return 'ENTRADA'
  if (last.tipo === 'ENTRADA') return 'SAIDA'
  if (last.tipo === 'SAIDA') return 'ENTRADA'
  if (last.tipo === 'PAUSA_INI') return 'PAUSA_FIM'
  return 'SAIDA'
}

const TIPO_LABELS: Record<TipoPicagem, string> = {
  ENTRADA: 'Entrada', SAIDA: 'Saída', PAUSA_INI: 'Início Pausa', PAUSA_FIM: 'Fim Pausa',
}

const RESULTADO_ICON: Record<ResultadoPicagem, typeof CheckCircle2> = {
  AUTORIZADA: CheckCircle2,
  RECUSADA: AlertCircle,
  PENDENTE_VALIDACAO: Hourglass,
}
const RESULTADO_COR: Record<ResultadoPicagem, string> = {
  AUTORIZADA: 'text-green-600',
  RECUSADA: 'text-destructive',
  PENDENTE_VALIDACAO: 'text-muted-foreground',
}

function lsGet(key: string): string {
  try { return localStorage.getItem(key) ?? '' } catch { return '' }
}
function lsSet(key: string, val: string) {
  try { localStorage.setItem(key, val) } catch { /* silent */ }
}

export function PicagemPage() {
  const { user } = useAuth()
  const { isGestor, isAdmin } = useRole()
  const canValidate = isGestor || isAdmin

  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const up = () => setIsOnline(true)
    const dn = () => setIsOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', dn)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', dn) }
  }, [])

  const { colaboradorAtual, loading: loadingAtual } = useColaboradorAtual()
  const { obras } = useObras(true)
  const { colaboradores } = useColaboradores(true)

  const [colaboradorId, setColaboradorId] = useState<string>(() => lsGet('enc_pic_colab'))
  const [obraId, setObraId] = useState<string>(() => lsGet('enc_pic_obra'))
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null)
  const [feedbackTipo, setFeedbackTipo] = useState<'ok' | 'queue'>('ok')

  // Auto-select current user's colaborador when loaded
  useEffect(() => {
    if (colaboradorAtual && !colaboradorId) {
      setColaboradorId(colaboradorAtual.id)
      lsSet('enc_pic_colab', colaboradorAtual.id)
    }
  }, [colaboradorAtual, colaboradorId])

  const today = todayISO()
  const { picagens, pendentes, reload } = usePicagensDia(colaboradorId || undefined, today)
  const { picar, loading: picando } = usePicar()

  const allToday = [...picagens].sort((a, b) =>
    a.timestampDispositivo.getTime() - b.timestampDispositivo.getTime()
  )
  const lastPicagem = allToday[allToday.length - 1]
  const primary = nextTipo(lastPicagem)

  const pendingCount = getQueue().filter(
    p => p.colaboradorId === colaboradorId && p.timestampDispositivo.startsWith(today)
  ).length + pendentes.length

  async function handlePicar(tipo: TipoPicagem) {
    if (!colaboradorId || !obraId) return
    setFeedbackMsg(null)

    const result = await picar({
      colaboradorId,
      obraId,
      tipo,
      timestampDispositivo: new Date().toISOString(),
    })

    if (!result) return

    if (result.queued) {
      setFeedbackMsg(`${TIPO_LABELS[tipo]} guardada — será enviada quando tiver ligação.`)
      setFeedbackTipo('queue')
    } else {
      setFeedbackMsg(`${TIPO_LABELS[tipo]} registada com sucesso.`)
      setFeedbackTipo('ok')
      reload()
    }

    setTimeout(() => setFeedbackMsg(null), 4000)
  }

  const ready = !!colaboradorId && !!obraId

  return (
    <div className="max-w-md mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2.5 rounded-xl">
            <Fingerprint className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Picagem</h1>
            <p className="text-sm text-muted-foreground">
              {new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
        </div>
        {canValidate && (
          <Link
            to="/picagens/validacao"
            className="flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            Validar <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>

      {/* Offline badge */}
      {!isOnline && (
        <div className="flex items-center gap-2 bg-warning/10 border border-warning/30 rounded-xl px-4 py-2.5 text-sm text-foreground">
          <WifiOff className="w-4 h-4 text-warning shrink-0" />
          <span>Sem ligação — picagens serão guardadas e enviadas depois.</span>
        </div>
      )}

      {/* Feedback */}
      {feedbackMsg && (
        <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
          feedbackTipo === 'ok'
            ? 'bg-green-500/10 border border-green-500/20 text-green-700 dark:text-green-400'
            : 'bg-warning/10 border border-warning/20 text-foreground'
        }`}>
          {feedbackTipo === 'ok'
            ? <CheckCircle2 className="w-4 h-4 shrink-0" />
            : <WifiOff className="w-4 h-4 shrink-0" />}
          {feedbackMsg}
        </div>
      )}

      {/* Colaborador selector */}
      {!loadingAtual && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block mb-1.5">
              Colaborador
            </label>
            {colaboradorAtual ? (
              <div className="flex items-center gap-2 py-2 px-3 bg-muted/50 rounded-lg text-sm font-medium">
                {colaboradorAtual.nome}
                <span className="ml-auto text-xs text-muted-foreground">conta própria</span>
              </div>
            ) : (
              <div className="relative">
                <select
                  value={colaboradorId}
                  onChange={e => { setColaboradorId(e.target.value); lsSet('enc_pic_colab', e.target.value) }}
                  className="w-full appearance-none bg-background border border-input rounded-lg px-3 py-3 text-sm pr-8 min-h-[48px]"
                >
                  <option value="">— Selecionar colaborador —</option>
                  {colaboradores.map(c => (
                    <option key={c.id} value={c.id}>{c.nome} ({c.numeroMecan})</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block mb-1.5">
              Obra
            </label>
            <div className="relative">
              <select
                value={obraId}
                onChange={e => { setObraId(e.target.value); lsSet('enc_pic_obra', e.target.value) }}
                className="w-full appearance-none bg-background border border-input rounded-lg px-3 py-3 text-sm pr-8 min-h-[48px]"
              >
                <option value="">— Selecionar obra —</option>
                {obras.map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        </div>
      )}

      {/* Big action button */}
      <div className="space-y-3">
        {/* Primary action */}
        <button
          onClick={() => handlePicar(primary)}
          disabled={!ready || picando}
          className={`
            w-full min-h-[120px] rounded-2xl font-bold text-xl flex flex-col items-center justify-center gap-3
            transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed
            ${primary === 'ENTRADA'
              ? 'bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/20'
              : primary === 'SAIDA'
              ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20'
              : 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20'}
            ${picando ? 'animate-pulse' : ''}
          `}
        >
          {picando ? (
            <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              {primary === 'ENTRADA' && <LogIn className="w-10 h-10" />}
              {primary === 'SAIDA' && <LogOut className="w-10 h-10" />}
              {primary === 'PAUSA_INI' && <Coffee className="w-10 h-10" />}
              {primary === 'PAUSA_FIM' && <Play className="w-10 h-10" />}
              <span>{TIPO_LABELS[primary]}</span>
            </>
          )}
        </button>

        {/* Secondary: pausa, se a primary é outra coisa */}
        {(primary === 'ENTRADA' || primary === 'SAIDA') && lastPicagem?.tipo === 'ENTRADA' && (
          <button
            onClick={() => handlePicar('PAUSA_INI')}
            disabled={!ready || picando}
            className="w-full min-h-[60px] rounded-xl font-medium text-sm flex items-center justify-center gap-2 border border-border bg-card hover:bg-muted/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Coffee className="w-5 h-5 text-muted-foreground" />
            Início de Pausa
          </button>
        )}
      </div>

      {/* Pending indicator */}
      {pendingCount > 0 && (
        <div className="text-center text-xs text-muted-foreground">
          {pendingCount} picagem{pendingCount !== 1 ? 's' : ''} aguarda{pendingCount !== 1 ? 'm' : ''} sincronização
        </div>
      )}

      {/* Today's history */}
      {(allToday.length > 0 || pendentes.length > 0) && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border/50">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Hoje
            </p>
          </div>
          <ul className="divide-y divide-border/50">
            {allToday.map(p => {
              const Icon = RESULTADO_ICON[p.resultado]
              const efetiva = p.horaFinalValidada ?? p.timestampDispositivo
              return (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <div className={`${
                    p.tipo === 'ENTRADA' ? 'bg-green-500/10' :
                    p.tipo === 'SAIDA' ? 'bg-amber-500/10' : 'bg-muted/50'
                  } rounded-lg p-2`}>
                    {p.tipo === 'ENTRADA' && <LogIn className="w-4 h-4 text-green-600" />}
                    {p.tipo === 'SAIDA' && <LogOut className="w-4 h-4 text-amber-600" />}
                    {p.tipo === 'PAUSA_INI' && <Coffee className="w-4 h-4 text-muted-foreground" />}
                    {p.tipo === 'PAUSA_FIM' && <Play className="w-4 h-4 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{TIPO_LABELS[p.tipo]}</p>
                    <p className="text-xs text-muted-foreground">
                      {horaLocal(efetiva)}
                      {p.origem === 'OFFLINE' && ' · offline'}
                    </p>
                  </div>
                  <Icon className={`w-4 h-4 shrink-0 ${RESULTADO_COR[p.resultado]}`} />
                </li>
              )
            })}
            {/* Pending (offline queue) */}
            {pendentes.map(p => (
              <li key={p.queueId} className="flex items-center gap-3 px-4 py-3 opacity-60">
                <div className="bg-warning/10 rounded-lg p-2">
                  {p.tipo === 'ENTRADA' && <LogIn className="w-4 h-4 text-warning" />}
                  {p.tipo === 'SAIDA' && <LogOut className="w-4 h-4 text-warning" />}
                  {(p.tipo === 'PAUSA_INI' || p.tipo === 'PAUSA_FIM') && <Coffee className="w-4 h-4 text-warning" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{TIPO_LABELS[p.tipo as TipoPicagem]}</p>
                  <p className="text-xs text-muted-foreground">
                    {horaLocal(new Date(p.timestampDispositivo))} · a aguardar envio
                  </p>
                </div>
                <Hourglass className="w-4 h-4 shrink-0 text-warning" />
              </li>
            ))}
          </ul>
        </div>
      )}

      {!loadingAtual && !colaboradorId && !user && (
        <p className="text-center text-sm text-muted-foreground py-8">
          Seleciona um colaborador para começar.
        </p>
      )}
    </div>
  )
}
