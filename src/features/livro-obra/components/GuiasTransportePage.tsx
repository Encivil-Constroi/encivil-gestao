import { useState } from 'react'
import { useParams, Link } from 'react-router'
import {
  ArrowLeft, Plus, Printer, X, Loader2, Truck,
  CheckCircle2, XCircle, Clock,
} from 'lucide-react'
import { toast } from 'sonner'
import { useObra } from '@/features/obras/hooks/useObras'
import { useGuias, useCriarGuia, useActualizarEstadoGuia } from '../hooks/useCriarGuia'
import { GuiaPrintView } from './GuiaPrintView'
import type { GuiaTransporte, EstadoGuia, LinhaGuia, CriarGuiaInput } from '../services/guiasTransporteService'

// ── Estado badges ─────────────────────────────────────────────────────────────

const ESTADO_CONFIG: Record<EstadoGuia, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  EMITIDA:  { label: 'Emitida',  icon: Clock,         color: 'text-amber-700 dark:text-amber-400',   bg: 'bg-amber-100 dark:bg-amber-900/30'   },
  ENTREGUE: { label: 'Entregue', icon: CheckCircle2,   color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  ANULADA:  { label: 'Anulada',  icon: XCircle,        color: 'text-red-700 dark:text-red-400',       bg: 'bg-red-100 dark:bg-red-900/30'       },
}

function EstadoBadge({ estado }: { estado: EstadoGuia }) {
  const cfg  = ESTADO_CONFIG[estado]
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-lg ${cfg.bg} ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  )
}

// ── Modal emitir guia ─────────────────────────────────────────────────────────

function EmitirGuiaModal({ obraId, onClose, onSaved }: {
  obraId:  string
  onClose: () => void
  onSaved: (id: string) => void
}) {
  const { criar, loading } = useCriarGuia()

  const hoje = new Date().toISOString().slice(0, 10)

  const [dataCarga, setDataCarga] = useState(hoje)
  const [origem,    setOrigem]    = useState('')
  const [destino,   setDestino]   = useState('')
  const [linhas,    setLinhas]    = useState<LinhaGuia[]>([
    { descricao: '', quantidade: 1, unidade: 'un' },
  ])

  const addLinha = () => setLinhas(l => [...l, { descricao: '', quantidade: 1, unidade: 'un' }])

  const removeLinha = (idx: number) => setLinhas(l => l.filter((_, i) => i !== idx))

  const updateLinha = (idx: number, field: keyof LinhaGuia, value: string | number) =>
    setLinhas(l => l.map((row, i) => i === idx ? { ...row, [field]: value } : row))

  const handleSave = async () => {
    const linhasValidas = linhas.filter(l => l.descricao.trim())
    if (linhasValidas.length === 0) { toast.error('Adicione pelo menos um artigo.'); return }

    const input: CriarGuiaInput = {
      obraId,
      dataCarga,
      origem:  origem.trim() || undefined,
      destino: destino.trim() || undefined,
      linhas:  linhasValidas,
    }

    const id = await criar(input)
    if (id !== null) {
      toast.success('Guia de transporte emitida.')
      onSaved(id as string)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-2xl border border-border w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="font-semibold text-base">Emitir Guia de Transporte</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">Data de Carga</label>
              <input
                type="date"
                value={dataCarga}
                onChange={e => setDataCarga(e.target.value)}
                className="w-full px-3 py-2 bg-input-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">Origem</label>
              <input
                type="text"
                value={origem}
                onChange={e => setOrigem(e.target.value)}
                placeholder="Armazém / Local"
                className="w-full px-3 py-2 bg-input-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">Destino</label>
              <input
                type="text"
                value={destino}
                onChange={e => setDestino(e.target.value)}
                placeholder="Obra / Local"
                className="w-full px-3 py-2 bg-input-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Linhas */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Artigos</label>
              <button
                onClick={addLinha}
                className="text-xs text-primary hover:underline font-medium"
              >
                + Adicionar linha
              </button>
            </div>
            <div className="space-y-2">
              {linhas.map((linha, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={linha.descricao}
                    onChange={e => updateLinha(idx, 'descricao', e.target.value)}
                    placeholder="Descrição do artigo"
                    className="flex-1 px-3 py-2 bg-input-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={linha.quantidade}
                    onChange={e => updateLinha(idx, 'quantidade', Number(e.target.value))}
                    className="w-16 px-2 py-2 bg-input-background border border-input rounded-xl text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary tabular-nums"
                  />
                  <input
                    type="text"
                    value={linha.unidade}
                    onChange={e => updateLinha(idx, 'unidade', e.target.value)}
                    placeholder="un"
                    className="w-14 px-2 py-2 bg-input-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  {linhas.length > 1 && (
                    <button onClick={() => removeLinha(idx)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2 p-5 pt-0">
          <button onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-medium hover:bg-accent transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Emitir Guia
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Item de guia ──────────────────────────────────────────────────────────────

function GuiaItem({ guia, onImprimir, onEstado }: {
  guia:       GuiaTransporte
  onImprimir: (g: GuiaTransporte) => void
  onEstado:   (g: GuiaTransporte, e: EstadoGuia) => void
}) {
  const fmtData = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat('pt-PT').format(new Date(iso + 'T00:00:00')) : '—'

  return (
    <div className="bg-card rounded-2xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-primary/10 shrink-0">
            <Truck className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm tabular-nums">{guia.numero}</span>
              <EstadoBadge estado={guia.estado} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {fmtData(guia.dataCarga)}
              {guia.origem && ` · ${guia.origem}`}
              {guia.destino && ` → ${guia.destino}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {guia.linhas.length} {guia.linhas.length === 1 ? 'artigo' : 'artigos'}
            </p>
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={() => onImprimir(guia)}
            className="p-2 rounded-xl border border-border hover:bg-accent transition-colors"
            title="Imprimir guia"
          >
            <Printer className="w-3.5 h-3.5" />
          </button>
          {guia.estado === 'EMITIDA' && (
            <>
              <button
                onClick={() => onEstado(guia, 'ENTREGUE')}
                className="px-2.5 py-1.5 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-xl hover:opacity-80 transition-opacity"
              >
                Entregue
              </button>
              <button
                onClick={() => onEstado(guia, 'ANULADA')}
                className="px-2.5 py-1.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-xl hover:opacity-80 transition-opacity"
              >
                Anular
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────

export function GuiasTransportePage() {
  const { id } = useParams<{ id: string }>()

  const [showEmitir,    setShowEmitir]    = useState(false)
  const [printGuia,     setPrintGuia]     = useState<GuiaTransporte | null>(null)

  const { obra, loading: obraLoading }           = useObra(id)
  const { guias, loading, error, reload }         = useGuias(id)
  const { actualizar, loading: actualizarLoading } = useActualizarEstadoGuia()

  const handleEstado = async (guia: GuiaTransporte, estado: EstadoGuia) => {
    const r = await actualizar(guia.id, estado)
    if (r !== null) {
      toast.success(`Guia ${guia.numero} marcada como ${estado.toLowerCase()}.`)
      reload()
    }
  }

  if (obraLoading || !obra) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link to={`/obras/${id}`} className="p-1.5 rounded-lg hover:bg-accent transition-colors shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg md:text-xl font-semibold truncate">{obra.name}</h1>
            <p className="text-xs text-muted-foreground">Guias de Transporte</p>
          </div>
        </div>
        <button
          onClick={() => setShowEmitir(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-medium hover:bg-primary/90 transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Emitir Guia</span>
        </button>
      </div>

      {/* Erro */}
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Loading */}
      {(loading || actualizarLoading) && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Lista */}
      {!loading && guias.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Truck className="w-10 h-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Nenhuma guia de transporte emitida.</p>
          <button
            onClick={() => setShowEmitir(true)}
            className="mt-1 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Emitir Primeira Guia
          </button>
        </div>
      )}

      <div className="space-y-3">
        {guias.map(guia => (
          <GuiaItem
            key={guia.id}
            guia={guia}
            onImprimir={setPrintGuia}
            onEstado={handleEstado}
          />
        ))}
      </div>

      {/* Modal emitir */}
      {showEmitir && (
        <EmitirGuiaModal
          obraId={id!}
          onClose={() => setShowEmitir(false)}
          onSaved={() => reload()}
        />
      )}

      {/* Vista de impressão */}
      {printGuia && (
        <GuiaPrintView
          guia={printGuia}
          obraNome={obra.name}
          onClose={() => setPrintGuia(null)}
        />
      )}
    </div>
  )
}
