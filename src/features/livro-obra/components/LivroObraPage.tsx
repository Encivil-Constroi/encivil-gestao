import { useState, useMemo, useCallback, memo } from 'react'
import { useParams, Link } from 'react-router'
import type { ElementType } from 'react'
import {
  ArrowLeft, Plus, Printer, X, Loader2,
  AlertCircle, Users, Cloud, HardHat, Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import { useObra } from '@/features/obras/hooks/useObras'
import { useLivroObra, useRegistarOcorrencia, useEditarRegisto } from '../hooks/useLivroObra'
import {
  CATEGORIAS,
  type CategoriaRegisto,
  type RegistoObra,
  type CriarRegistoInput,
} from '../services/livroObraService'

// ── Ícones por categoria ───────────────────────────────────────────────────────

const CAT_CONFIG: Record<CategoriaRegisto, { icon: ElementType; color: string; bg: string }> = {
  OCORRENCIA:      { icon: AlertCircle, color: 'text-red-600 dark:text-red-400',       bg: 'bg-red-100 dark:bg-red-900/30'        },
  VISITA:          { icon: Users,       color: 'text-blue-600 dark:text-blue-400',     bg: 'bg-blue-100 dark:bg-blue-900/30'      },
  CONDICOES_METEO: { icon: Cloud,       color: 'text-sky-600 dark:text-sky-400',       bg: 'bg-sky-100 dark:bg-sky-900/30'        },
  PESSOAL:         { icon: Users,       color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-100 dark:bg-violet-900/30'  },
  EQUIPAMENTO:     { icon: Wrench,      color: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-100 dark:bg-amber-900/30'    },
}

const CATEGORIA_LABELS: Record<CategoriaRegisto, string> = {
  OCORRENCIA:      'Ocorrência',
  VISITA:          'Visita',
  CONDICOES_METEO: 'Condições Meteo',
  PESSOAL:         'Pessoal',
  EQUIPAMENTO:     'Equipamento',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })

function formatarData(iso: string) {
  return fmt.format(new Date(iso + 'T00:00:00'))
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10)
}

// ── Modal de novo/editar registo ───────────────────────────────────────────────

function RegistoModal({ obraId, registo, onClose, onSaved }: {
  obraId:   string
  registo?: RegistoObra
  onClose:  () => void
  onSaved:  () => void
}) {
  const { registar, loading: criarLoading } = useRegistarOcorrencia(obraId)
  const { editar,   loading: editarLoading } = useEditarRegisto(obraId)

  const [data,      setData]      = useState(() => registo?.data      ?? hoje())
  const [categoria, setCategoria] = useState<CategoriaRegisto>(() => registo?.categoria ?? 'OCORRENCIA')
  const [descricao, setDescricao] = useState(() => registo?.descricao ?? '')

  const loading = criarLoading || editarLoading

  const handleSave = async () => {
    if (!descricao.trim()) { toast.error('Descrição obrigatória.'); return }

    let ok: boolean
    if (registo) {
      const r = await editar(registo.id, { data, categoria, descricao })
      ok = r !== null
    } else {
      const input: CriarRegistoInput = { obraId, data, categoria, descricao }
      const r = await registar(input)
      ok = r !== null
    }

    if (ok) {
      toast.success(registo ? 'Registo actualizado.' : 'Registo criado.')
      onSaved()
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-2xl border border-border w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold text-base">{registo ? 'Editar Registo' : 'Novo Registo'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">Data</label>
            <input
              type="date"
              value={data}
              onChange={e => setData(e.target.value)}
              className="w-full px-3 py-2 bg-input-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">Categoria</label>
            <select
              value={categoria}
              onChange={e => setCategoria(e.target.value as CategoriaRegisto)}
              className="w-full px-3 py-2 bg-input-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {CATEGORIAS.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">Descrição</label>
            <textarea
              rows={4}
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Descreva a ocorrência, visita ou condição..."
              className="w-full px-3 py-2 bg-input-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
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
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Item da timeline (memo — lista potencialmente longa) ──────────────────────

const RegistoItem = memo(function RegistoItem({
  registo, onEdit,
}: {
  registo: RegistoObra
  onEdit:  (r: RegistoObra) => void
}) {
  const cfg  = CAT_CONFIG[registo.categoria]
  const Icon = cfg.icon

  return (
    <div
      className="flex gap-3 group cursor-pointer"
      onClick={() => onEdit(registo)}
    >
      <div className="flex flex-col items-center">
        <div className={`p-2 rounded-xl ${cfg.bg} shrink-0 mt-0.5 group-hover:scale-105 transition-transform`}>
          <Icon className={`w-4 h-4 ${cfg.color}`} />
        </div>
        <div className="w-px flex-1 bg-border mt-2" />
      </div>
      <div className="flex-1 pb-4 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${cfg.bg} ${cfg.color}`}>
            {CATEGORIA_LABELS[registo.categoria]}
          </span>
        </div>
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{registo.descricao}</p>
      </div>
    </div>
  )
})

// ── Página principal ───────────────────────────────────────────────────────────

export function LivroObraPage() {
  const { id } = useParams<{ id: string }>()

  const [filtro,      setFiltro]      = useState<CategoriaRegisto | undefined>(undefined)
  const [showModal,   setShowModal]   = useState(false)
  const [editRegisto, setEditRegisto] = useState<RegistoObra | undefined>(undefined)

  const { obra, loading: obraLoading }         = useObra(id)
  const { registos, loading, error, reload }   = useLivroObra(id, filtro)

  // Agrupamento por data — calculado a partir da lista já filtrada no hook.
  // Usa push (O(n)) em vez de spread (O(n²)) para grupos com muitas entradas.
  const groups = useMemo(() => {
    const map = new Map<string, RegistoObra[]>()
    for (const r of registos) {
      let arr = map.get(r.data)
      if (!arr) { arr = []; map.set(r.data, arr) }
      arr.push(r)
    }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a))
  }, [registos])

  const handleNovoRegisto = useCallback(() => {
    setEditRegisto(undefined)
    setShowModal(true)
  }, [])

  const handleEdit = useCallback((r: RegistoObra) => {
    setEditRegisto(r)
    setShowModal(true)
  }, [])

  const handleCloseModal = useCallback(() => {
    setShowModal(false)
    setEditRegisto(undefined)
  }, [])

  if (obraLoading || !obra) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <>
      <style>{`
        @media print {
          body { font-size: 12px; }
          .print-hidden { display: none !important; }
          .print-full { max-width: 100% !important; }
          @page { size: A4; margin: 15mm; }
        }
      `}</style>

      <div className="space-y-4 pb-8 print-full">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-3 print-hidden">
          <div className="flex items-center gap-2.5 min-w-0">
            <Link to={`/obras/${id}`} className="p-1.5 rounded-lg hover:bg-accent transition-colors shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-lg md:text-xl font-semibold truncate">{obra.name}</h1>
              <p className="text-xs text-muted-foreground">Livro de Obra Digital</p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-xl text-xs font-medium hover:bg-accent transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Imprimir</span>
            </button>
            <button
              onClick={handleNovoRegisto}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Novo Registo</span>
            </button>
          </div>
        </div>

        {/* Cabeçalho de impressão */}
        <div className="hidden print:block mb-6 border-b-2 border-gray-900 pb-4">
          <h1 className="text-2xl font-black text-gray-900">{obra.name}</h1>
          <p className="text-sm text-gray-500 font-semibold uppercase tracking-widest mt-0.5">
            Livro de Obra Digital · {new Date().toLocaleDateString('pt-PT')}
          </p>
        </div>

        {/* Filtro por categoria */}
        <div className="flex flex-wrap gap-1.5 print-hidden">
          <button
            onClick={() => setFiltro(undefined)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              !filtro ? 'bg-primary text-primary-foreground' : 'bg-accent text-foreground hover:bg-accent/70'
            }`}
          >
            Todos
          </button>
          {CATEGORIAS.map(c => (
            <button
              key={c.value}
              onClick={() => setFiltro(prev => prev === c.value ? undefined : c.value)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                filtro === c.value ? 'bg-primary text-primary-foreground' : 'bg-accent text-foreground hover:bg-accent/70'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive print-hidden">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-8 print-hidden">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && groups.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-center print-hidden">
            <HardHat className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {filtro ? 'Nenhum registo nesta categoria.' : 'Sem registos no livro de obra.'}
            </p>
            <button
              onClick={handleNovoRegisto}
              className="mt-1 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Criar Primeiro Registo
            </button>
          </div>
        )}

        {groups.map(([data, items]) => (
          <div key={data} className="space-y-0">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide shrink-0">
                {formatarData(data)}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="bg-card rounded-2xl border border-border p-4 space-y-0">
              {items.map((registo, idx) => (
                <div key={registo.id}>
                  <RegistoItem registo={registo} onEdit={handleEdit} />
                  {idx < items.length - 1 && <div className="h-px bg-border -mx-4 mb-3" />}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <RegistoModal
          obraId={id!}
          registo={editRegisto}
          onClose={handleCloseModal}
          onSaved={reload}
        />
      )}
    </>
  )
}
