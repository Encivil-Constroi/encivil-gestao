import { useState } from 'react'
import {
  CheckSquare, ChevronDown, ChevronLeft, ChevronRight,
  LogIn, LogOut, Coffee, Play,
  CheckCircle2, XCircle, Hourglass, Clock3, Pencil, X
} from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { useObras } from '@/features/obras/hooks/useObras'
import { usePicagensObra } from '../hooks/usePicagensDia'
import { useValidarPicagem, useCorrigirHoraPicagem } from '../hooks/usePicar'
import { invalidateCache } from '@/app/lib/useAsync'
import type { Picagem, TipoPicagem, ResultadoPicagem } from '@/app/types'

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().split('T')[0]
}

function horaLocal(d: Date): string {
  return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
}

const TIPO_LABELS: Record<TipoPicagem, string> = {
  ENTRADA: 'Entrada', SAIDA: 'Saída', PAUSA_INI: 'Início Pausa', PAUSA_FIM: 'Fim Pausa',
}

const TIPO_ICON: Record<TipoPicagem, typeof LogIn> = {
  ENTRADA: LogIn, SAIDA: LogOut, PAUSA_INI: Coffee, PAUSA_FIM: Play,
}

const TIPO_COR: Record<TipoPicagem, string> = {
  ENTRADA: 'bg-green-500/10 text-green-600',
  SAIDA: 'bg-amber-500/10 text-amber-600',
  PAUSA_INI: 'bg-muted/50 text-muted-foreground',
  PAUSA_FIM: 'bg-muted/50 text-muted-foreground',
}

const RESULTADO_BADGE: Record<ResultadoPicagem, { label: string; icon: typeof CheckCircle2; cls: string }> = {
  AUTORIZADA:          { label: 'Autorizada',    icon: CheckCircle2, cls: 'bg-green-500/10 text-green-700 dark:text-green-400' },
  RECUSADA:            { label: 'Recusada',       icon: XCircle,      cls: 'bg-destructive/10 text-destructive' },
  PENDENTE_VALIDACAO:  { label: 'Pendente',       icon: Hourglass,    cls: 'bg-muted text-muted-foreground' },
}

// Groups picagens by colaborador for this day's view
function groupByColab(picagens: Picagem[]): Map<string, { nome: string; picagens: Picagem[] }> {
  const map = new Map<string, { nome: string; picagens: Picagem[] }>()
  for (const p of picagens) {
    const entry = map.get(p.colaboradorId)
    if (entry) {
      entry.picagens.push(p)
    } else {
      map.set(p.colaboradorId, { nome: p.colaboradorNome ?? p.colaboradorId, picagens: [p] })
    }
  }
  return map
}

function CorrecaoHora({
  picagem,
  onSalvar,
  onCancelar,
  loading,
}: {
  picagem: Picagem
  onSalvar: (novaHora: string) => void
  onCancelar: () => void
  loading: boolean
}) {
  const original = picagem.horaFinalValidada ?? picagem.timestampDispositivo
  const [hora, setHora] = useState(() =>
    original.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
  )

  function buildISO(): string {
    const base = picagem.timestampDispositivo
    const [h, m] = hora.split(':').map(Number)
    const d = new Date(base)
    d.setHours(h, m, 0, 0)
    return d.toISOString()
  }

  return (
    <div className="flex items-center gap-2 mt-2">
      <Clock3 className="w-4 h-4 text-muted-foreground shrink-0" />
      <input
        type="time"
        value={hora}
        onChange={e => setHora(e.target.value)}
        className="border border-input rounded-lg px-2 py-1 text-sm bg-background w-24"
      />
      <button
        onClick={() => onSalvar(buildISO())}
        disabled={loading}
        className="px-3 py-1 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
      >
        Guardar
      </button>
      <button onClick={onCancelar} className="p-1 hover:bg-muted rounded">
        <X className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
    </div>
  )
}

function PicagemRow({
  picagem,
  onValidar,
  onCorrigir,
  loadingId,
}: {
  picagem: Picagem
  onValidar: (id: string, resultado: ResultadoPicagem) => void
  onCorrigir: (id: string, original: string, nova: string) => void
  loadingId: string | null
}) {
  const [editando, setEditando] = useState(false)
  const { corrigir, loading: corrigindo } = useCorrigirHoraPicagem()
  const { user } = useAuth()
  const isLoading = loadingId === picagem.id
  const efetiva = picagem.horaFinalValidada ?? picagem.timestampDispositivo
  const Icon = TIPO_ICON[picagem.tipo]
  const badge = RESULTADO_BADGE[picagem.resultado]
  const BadgeIcon = badge.icon

  async function handleCorrigir(novaHora: string) {
    const original = picagem.horaFinalValidada?.toISOString() ?? picagem.timestampDispositivo.toISOString()
    await corrigir(picagem.id, original, novaHora, user?.id ?? '')
    onCorrigir(picagem.id, original, novaHora)
    setEditando(false)
  }

  return (
    <div className={`p-3 rounded-xl border ${isLoading ? 'opacity-60' : 'border-border/50 bg-card'}`}>
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 shrink-0 ${TIPO_COR[picagem.tipo]}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{TIPO_LABELS[picagem.tipo]}</span>
            <span className="text-sm tabular-nums">{horaLocal(efetiva)}</span>
            {picagem.horaFinalValidada && (
              <span className="text-xs text-muted-foreground line-through tabular-nums">
                {horaLocal(picagem.timestampDispositivo)}
              </span>
            )}
            {picagem.origem === 'OFFLINE' && (
              <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">offline</span>
            )}
          </div>
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium shrink-0 ${badge.cls}`}>
          <BadgeIcon className="w-3 h-3" />
          {badge.label}
        </div>
      </div>

      {/* Actions */}
      {picagem.resultado === 'PENDENTE_VALIDACAO' && (
        <div className="flex items-center gap-2 mt-2.5 ml-10 flex-wrap">
          <button
            onClick={() => onValidar(picagem.id, 'AUTORIZADA')}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 text-green-700 dark:text-green-400 rounded-lg text-xs font-medium hover:bg-green-500/20 transition-colors disabled:opacity-50"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Autorizar
          </button>
          <button
            onClick={() => onValidar(picagem.id, 'RECUSADA')}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-destructive/10 text-destructive rounded-lg text-xs font-medium hover:bg-destructive/20 transition-colors disabled:opacity-50"
          >
            <XCircle className="w-3.5 h-3.5" /> Recusar
          </button>
          <button
            onClick={() => setEditando(e => !e)}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            <Pencil className="w-3.5 h-3.5" /> Corrigir hora
          </button>
        </div>
      )}

      {editando && (
        <div className="ml-10">
          <CorrecaoHora
            picagem={picagem}
            onSalvar={handleCorrigir}
            onCancelar={() => setEditando(false)}
            loading={corrigindo}
          />
        </div>
      )}
    </div>
  )
}

export function ValidacaoPicagensPage() {
  const { user } = useAuth()
  const { obras } = useObras(true)
  const [obraId, setObraId] = useState<string>('')
  const [data, setData] = useState<string>(todayISO())
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const { picagens, reload } = usePicagensObra(obraId || undefined, data)
  const { validar } = useValidarPicagem()

  async function handleValidar(id: string, resultado: ResultadoPicagem) {
    setLoadingId(id)
    await validar(id, { resultado, validadaPor: user?.id ?? '' })
    invalidateCache(`picagens-obra-${obraId}-${data}`)
    reload()
    setLoadingId(null)
  }

  function handleCorrigir(id: string, _original: string, _nova: string) {
    invalidateCache(`picagens-obra-${obraId}-${data}`)
    reload()
    void id
  }

  const grupos = groupByColab(picagens)
  const pendentes = picagens.filter(p => p.resultado === 'PENDENTE_VALIDACAO').length

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 p-2.5 rounded-xl">
          <CheckSquare className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Validação de Picagens</h1>
          <p className="text-sm text-muted-foreground">
            {pendentes > 0
              ? `${pendentes} picagem${pendentes !== 1 ? 's' : ''} pendente${pendentes !== 1 ? 's' : ''}`
              : 'Tudo validado'}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block mb-1.5">Obra</label>
          <div className="relative">
            <select
              value={obraId}
              onChange={e => setObraId(e.target.value)}
              className="w-full appearance-none bg-background border border-input rounded-lg px-3 py-2.5 text-sm pr-8"
            >
              <option value="">— Selecionar obra —</option>
              {obras.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Date navigation */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block mb-1.5">Data</label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setData(d => addDays(d, -1))}
              className="p-2 border border-border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              value={data}
              onChange={e => setData(e.target.value)}
              className="flex-1 border border-input rounded-lg px-3 py-2 text-sm bg-background"
            />
            <button
              onClick={() => setData(d => addDays(d, 1))}
              disabled={data >= todayISO()}
              className="p-2 border border-border rounded-lg hover:bg-muted/50 transition-colors disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Picagens grouped by colaborador */}
      {!obraId && (
        <p className="text-center text-sm text-muted-foreground py-12">
          Seleciona uma obra para ver as picagens do dia.
        </p>
      )}

      {obraId && grupos.size === 0 && (
        <p className="text-center text-sm text-muted-foreground py-12">
          Sem picagens registadas para esta obra neste dia.
        </p>
      )}

      {obraId && grupos.size > 0 && Array.from(grupos.entries()).map(([colaboradorId, { nome, picagens: ps }]) => (
        <div key={colaboradorId} className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground px-1">{nome}</h3>
          {ps.map(p => (
            <PicagemRow
              key={p.id}
              picagem={p}
              onValidar={handleValidar}
              onCorrigir={handleCorrigir}
              loadingId={loadingId}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
