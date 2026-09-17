import { useState, useRef } from 'react'
import { useNavigate } from 'react-router'
import {
  FileText, Plus, Upload, X, Loader2,
  Bot, Tag, CheckCircle, Clock, Inbox,
  Building2, AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState } from '@/app/components/EmptyState'
import { useObras }    from '@/features/obras/hooks/useObras'
import { useRole }     from '@/features/auth/useRole'
import type { EstadoFatura, FaturaFornecedor } from '@/app/types'
import {
  useFaturas,
  useCriarFatura,
  useExtrairFatura,
  useEliminarFatura,
} from '../hooks/useFaturas'

// ── Badge de estado ───────────────────────────────────────────────────────────

const ESTADO_META: Record<EstadoFatura, { label: string; cls: string; icon: typeof FileText }> = {
  RECEBIDA:     { label: 'Recebida',     cls: 'bg-muted text-muted-foreground',   icon: Inbox },
  EXTRAIDA:     { label: 'Extraída',     cls: 'bg-warning/15 text-warning',       icon: Bot },
  CLASSIFICADA: { label: 'Classificada', cls: 'bg-primary/10 text-primary',       icon: Tag },
  LANCADA:      { label: 'Lançada',      cls: 'bg-success/15 text-success',       icon: CheckCircle },
}

type EstadoFilter = EstadoFatura | 'TODOS'

const FILTROS: { value: EstadoFilter; label: string }[] = [
  { value: 'TODOS',      label: 'Todas'       },
  { value: 'RECEBIDA',   label: 'Recebidas'   },
  { value: 'EXTRAIDA',   label: 'Extraídas'   },
  { value: 'CLASSIFICADA', label: 'Classificadas' },
  { value: 'LANCADA',    label: 'Lançadas'    },
]

// ── Modal de upload ───────────────────────────────────────────────────────────

function UploadModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { obras }    = useObras(true)
  const { criar, loading, error } = useCriarFatura()
  const fileRef      = useRef<HTMLInputElement>(null)

  const [fornecedor,  setFornecedor]  = useState('')
  const [obraId,      setObraId]      = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [file,        setFile]        = useState<File | null>(null)
  const [dragOver,    setDragOver]    = useState(false)

  const handleFile = (f: File | null) => {
    if (!f) return
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(f.type)) {
      toast.error('Formato não suportado. Use PDF, JPG, PNG ou WEBP.')
      return
    }
    if (f.size > 20 * 1024 * 1024) {
      toast.error('Ficheiro demasiado grande (máx. 20 MB).')
      return
    }
    setFile(f)
    if (!fornecedor) setFornecedor(f.name.replace(/\.[^.]+$/, ''))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file)        { toast.error('Seleciona um ficheiro.'); return }
    if (!fornecedor.trim()) { toast.error('O fornecedor é obrigatório.'); return }

    const result = await criar({
      fornecedor: fornecedor.trim(),
      obraId:     obraId || undefined,
      observacoes: observacoes.trim() || undefined,
      file,
    })
    if (result) {
      toast.success('Fatura carregada com sucesso.')
      onSuccess()
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-2xl border border-border w-full max-w-md shadow-2xl max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold text-base">Nova Fatura</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Upload área */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0] ?? null) }}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              dragOver
                ? 'border-primary bg-primary/5'
                : file
                  ? 'border-success/50 bg-success/5'
                  : 'border-border hover:border-primary/40 hover:bg-accent/50'
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={e => handleFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="flex flex-col items-center gap-1.5">
                <FileText className="w-8 h-8 text-success" />
                <p className="font-medium text-sm truncate max-w-[220px]">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <Upload className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm font-medium">Arrasta aqui ou clica para selecionar</p>
                <p className="text-xs text-muted-foreground">PDF, JPG, PNG ou WEBP · máx. 20 MB</p>
              </div>
            )}
          </div>

          {/* Fornecedor */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Fornecedor <span className="text-destructive">*</span></label>
            <input
              type="text"
              value={fornecedor}
              onChange={e => setFornecedor(e.target.value)}
              placeholder="Nome do fornecedor"
              className="w-full px-3 py-2.5 bg-input-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          {/* Obra (opcional) */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Obra <span className="text-muted-foreground text-xs">(opcional)</span></label>
            <select
              value={obraId}
              onChange={e => setObraId(e.target.value)}
              className="w-full px-3 py-2.5 bg-input-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">— Sem obra específica —</option>
              {obras.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>

          {/* Observações */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Observações <span className="text-muted-foreground text-xs">(opcional)</span></label>
            <textarea
              value={observacoes}
              onChange={e => setObservacoes(e.target.value)}
              placeholder="Notas adicionais..."
              rows={2}
              className="w-full px-3 py-2.5 bg-input-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-border rounded-xl text-sm font-medium hover:bg-accent transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" />A carregar…</> : 'Carregar Fatura'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Card de fatura ────────────────────────────────────────────────────────────

function FaturaCard({ fatura, onExtrair, onEliminar, isExtraindo }: {
  fatura:       FaturaFornecedor
  onExtrair:    (id: string) => void
  onEliminar:   (id: string) => void
  isExtraindo:  boolean
}) {
  const navigate = useNavigate()
  const meta = ESTADO_META[fatura.estado]
  const Icon = meta.icon

  const totalFmt = fatura.totalFatura != null
    ? new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(fatura.totalFatura)
    : null

  const dataFmt = fatura.dataFatura
    ? new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(fatura.dataFatura)
    : null

  return (
    <div className="bg-card rounded-2xl border border-border p-4 flex flex-col gap-3 hover:border-primary/30 hover:shadow-sm transition-all">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="bg-primary/10 rounded-lg p-2 shrink-0">
            <FileText className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold truncate">{fatura.fornecedor}</p>
            {fatura.numeroFatura && (
              <p className="text-xs text-muted-foreground truncate">Nº {fatura.numeroFatura}</p>
            )}
          </div>
        </div>
        <span className={`shrink-0 flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${meta.cls}`}>
          <Icon className="w-3 h-3" />
          {meta.label}
        </span>
      </div>

      {/* Metadados */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {dataFmt && (
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{dataFmt}</span>
        )}
        {fatura.obraNome && (
          <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{fatura.obraNome}</span>
        )}
        {totalFmt && (
          <span className="font-semibold text-foreground">{totalFmt}</span>
        )}
        {fatura.linhas && fatura.linhas.length > 0 && (
          <span>{fatura.linhas.length} linha{fatura.linhas.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Acções por estado */}
      <div className="flex gap-2 pt-0.5">
        {fatura.estado === 'RECEBIDA' && (
          <>
            <button
              onClick={() => onExtrair(fatura.id)}
              disabled={isExtraindo}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-medium hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {isExtraindo
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />A extrair…</>
                : <><Bot className="w-3.5 h-3.5" />Extrair com IA</>
              }
            </button>
            <button
              onClick={() => onEliminar(fatura.id)}
              className="px-3 py-2 border border-border rounded-xl text-xs font-medium hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        {fatura.estado === 'EXTRAIDA' && (
          <button
            onClick={() => navigate(`/faturas/${fatura.id}/classificar`)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-violet-600 text-white rounded-xl text-xs font-medium hover:bg-violet-700 active:scale-[0.98] transition-all"
          >
            <Tag className="w-3.5 h-3.5" />Classificar Linhas
          </button>
        )}

        {fatura.estado === 'CLASSIFICADA' && (
          <button
            onClick={() => navigate(`/faturas/${fatura.id}/classificar`)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-success text-white rounded-xl text-xs font-medium hover:bg-success/90 active:scale-[0.98] transition-all"
          >
            <CheckCircle className="w-3.5 h-3.5" />Ver e Lançar
          </button>
        )}

        {fatura.estado === 'LANCADA' && (
          <button
            onClick={() => navigate(`/faturas/${fatura.id}/classificar`)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-border rounded-xl text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />Ver Detalhe
          </button>
        )}
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export function FaturasPage() {
  const { isGestor, isAdmin } = useRole()
  const podeGerirFaturas = isGestor || isAdmin

  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>('TODOS')
  const [showUpload,   setShowUpload]   = useState(false)
  const [extraindoId,  setExtraindoId]  = useState<string | null>(null)

  const filtros = estadoFilter !== 'TODOS' ? { estado: estadoFilter } : {}
  const { faturas, loading, error, reload } = useFaturas(filtros)
  const { extrair, loading: extraindo } = useExtrairFatura()
  const { eliminar } = useEliminarFatura()

  const handleExtrair = async (id: string) => {
    setExtraindoId(id)
    const result = await extrair(id)
    setExtraindoId(null)
    if (result) {
      const autoMsg = result.auto_classificadas > 0
        ? ` (${result.auto_classificadas} auto-classificadas)`
        : ''
      toast.success(`Extração concluída — ${result.linhas} linha${result.linhas !== 1 ? 's' : ''} encontradas${autoMsg}.`)
      reload()
    }
  }

  const handleEliminar = async (id: string) => {
    if (!confirm('Eliminar esta fatura? Esta acção não pode ser desfeita.')) return
    const ok = await eliminar(id)
    if (ok) { toast.success('Fatura eliminada.'); reload() }
  }

  // Contagens por estado para os tabs
  const totais = faturas.reduce<Record<EstadoFilter, number>>(
    (acc, f) => { acc[f.estado] = (acc[f.estado] ?? 0) + 1; acc.TODOS++; return acc },
    { TODOS: 0, RECEBIDA: 0, EXTRAIDA: 0, CLASSIFICADA: 0, LANCADA: 0 }
  )

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Faturas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? 'A carregar…' : `${totais.TODOS} fatura${totais.TODOS !== 1 ? 's' : ''}`}
          </p>
        </div>
        {podeGerirFaturas && (
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 active:scale-[0.98] transition-all shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nova Fatura</span>
          </button>
        )}
      </div>

      {/* Filtros de estado */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {FILTROS.map(f => (
          <button
            key={f.value}
            onClick={() => setEstadoFilter(f.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
              estadoFilter === f.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-accent text-foreground hover:bg-accent/70'
            }`}
          >
            {f.label}
            {totais[f.value] > 0 && (
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                estadoFilter === f.value ? 'bg-white/20' : 'bg-muted text-muted-foreground'
              }`}>
                {totais[f.value]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Erro */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-card rounded-2xl border border-border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="skeleton h-8 w-8 rounded-lg shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-3.5 w-32" />
                  <div className="skeleton h-3 w-20" />
                </div>
                <div className="skeleton h-5 w-20 rounded-full" />
              </div>
              <div className="skeleton h-3 w-24" />
              <div className="skeleton h-8 rounded-xl" />
            </div>
          ))}
        </div>
      ) : faturas.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhuma fatura encontrada"
          description={
            estadoFilter !== 'TODOS'
              ? `Não há faturas no estado "${ESTADO_META[estadoFilter as EstadoFatura]?.label ?? estadoFilter}".`
              : 'Carregue a primeira fatura para começar a automatizar a classificação de compras.'
          }
          action={podeGerirFaturas && estadoFilter === 'TODOS'
            ? { label: 'Carregar Fatura', onClick: () => setShowUpload(true) }
            : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {faturas.map(f => (
            <FaturaCard
              key={f.id}
              fatura={f}
              onExtrair={handleExtrair}
              onEliminar={handleEliminar}
              isExtraindo={extraindoId === f.id && extraindo}
            />
          ))}
        </div>
      )}

      {/* Modal de upload */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={reload}
        />
      )}
    </div>
  )
}
