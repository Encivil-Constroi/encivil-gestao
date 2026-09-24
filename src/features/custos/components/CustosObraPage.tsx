import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router'
import {
  ArrowLeft, Package, Users, Fuel, FileText, HardHat,
  TrendingUp, TrendingDown, Minus, Download, Pencil, X, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { exportarXlsx } from '@/app/lib/exportXlsx'
import { useObra } from '@/features/obras/hooks/useObras'
import { useCustoConsolidado, useActualizarOrcamentos } from '../useCustoObra'
import { DashboardRentabilidade } from './DashboardRentabilidade'
import type { OrcamentosObra } from '../services/custosService'

// ── Categorias ────────────────────────────────────────────────────────────────

const CATS = [
  { key: 'materiais'      , label: 'Materiais',       icon: Package,  color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-100 dark:bg-blue-900/30'   },
  { key: 'maoDeObra'      , label: 'Mão de Obra',     icon: Users,    color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-100 dark:bg-violet-900/30'},
  { key: 'combustivel'    , label: 'Combustível',     icon: Fuel,     color: 'text-amber-600 dark:text-amber-400',  bg: 'bg-amber-100 dark:bg-amber-900/30'  },
  { key: 'fornecedores'   , label: 'Fornecedores',    icon: FileText, color: 'text-red-600 dark:text-red-400',     bg: 'bg-red-100 dark:bg-red-900/30'      },
  { key: 'subempreiteiros', label: 'Subempreiteiros', icon: HardHat,  color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30'},
] as const

type CatKey = (typeof CATS)[number]['key']

// ── Formatação ────────────────────────────────────────────────────────────────

const EUR  = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' })
const EUR0 = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

// ── Período ───────────────────────────────────────────────────────────────────

type Periodo = 'mes' | 'ano' | 'tudo'

function calcDatas(p: Periodo): { dataIni: string; dataFim: string } {
  const hoje = new Date()
  const iso   = (d: Date) => d.toISOString().slice(0, 10)
  if (p === 'mes') return { dataIni: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), dataFim: iso(hoje) }
  if (p === 'ano') return { dataIni: `${hoje.getFullYear()}-01-01`,                         dataFim: iso(hoje) }
  return { dataIni: '2000-01-01', dataFim: iso(hoje) }
}

// ── Modal de orçamentos ───────────────────────────────────────────────────────

function OrcamentosModal({ obraId, inicial, onClose, onSaved }: {
  obraId:  string
  inicial: OrcamentosObra
  onClose: () => void
  onSaved: () => void
}) {
  const { actualizar, loading } = useActualizarOrcamentos()
  const [vals, setVals] = useState<Record<CatKey, string>>({
    materiais:       inicial.materiais       != null ? String(inicial.materiais)       : '',
    maoDeObra:       inicial.maoDeObra       != null ? String(inicial.maoDeObra)       : '',
    combustivel:     inicial.combustivel     != null ? String(inicial.combustivel)     : '',
    fornecedores:    inicial.fornecedores    != null ? String(inicial.fornecedores)    : '',
    subempreiteiros: inicial.subempreiteiros != null ? String(inicial.subempreiteiros) : '',
  })

  const handleSave = async () => {
    const orcamentos: OrcamentosObra = {}
    for (const c of CATS) {
      const v = parseFloat(vals[c.key].replace(',', '.'))
      orcamentos[c.key] = isNaN(v) ? undefined : v
    }
    const result = await actualizar(obraId, orcamentos)
    if (result !== null) {
      toast.success('Orçamentos guardados.')
      onSaved()
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-2xl border border-border w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold text-base">Definir Orçamentos</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {CATS.map(c => {
            const Icon = c.icon
            return (
              <div key={c.key} className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${c.bg} shrink-0`}>
                  <Icon className={`w-4 h-4 ${c.color}`} />
                </div>
                <label className="flex-1 text-sm font-medium">{c.label}</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={vals[c.key]}
                  onChange={e => setVals(prev => ({ ...prev, [c.key]: e.target.value }))}
                  placeholder="€ —"
                  className="w-28 px-3 py-1.5 bg-input-background border border-input rounded-xl text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )
          })}
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
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Barra progresso budget vs real ───────────────────────────────────────────

function ProgressBar({ real, orcamento }: { real: number; orcamento?: number }) {
  if (!orcamento || orcamento <= 0) return null
  const pct = Math.min(real / orcamento * 100, 100)
  const over = real > orcamento
  return (
    <div className="mt-2 space-y-0.5">
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${over ? 'bg-destructive' : 'bg-primary'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{pct.toFixed(0)}% do orçamento</span>
        <span>{EUR0.format(orcamento)}</span>
      </div>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

export function CustosObraPage() {
  const { id } = useParams<{ id: string }>()
  const [periodo, setPeriodo]         = useState<Periodo>('ano')
  const [showOrcamentos, setShowOrc]  = useState(false)

  const { dataIni, dataFim } = useMemo(() => calcDatas(periodo), [periodo])
  const { obra, loading: obraLoading } = useObra(id)
  const { custo, loading, error, reload } = useCustoConsolidado(id, dataIni, dataFim)

  if (obraLoading || !obra) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  // ── Variação vs orçamento ──────────────────────────────────────────────────
  const totalOrc = custo?.orcamentos?.total
  const excede   = totalOrc != null && (custo?.total ?? 0) > totalOrc
  const VarIcon  = totalOrc == null ? Minus : excede ? TrendingDown : TrendingUp

  // ── Export CSV ─────────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!custo) return
    await exportarXlsx(
      CATS.map(c => ({
        Categoria:  c.label,
        Real:       custo[c.key as CatKey],
        Orcamento:  custo.orcamentos?.[c.key as CatKey] ?? '',
        Desvio:     custo.orcamentos?.[c.key as CatKey] != null
          ? custo[c.key as CatKey] - (custo.orcamentos![c.key as CatKey] ?? 0)
          : '',
      })),
      `custos-obra-${obra.name.replace(/\s+/g, '-').toLowerCase()}-${periodo}`,
      'Custos por Obra',
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
            <p className="text-xs text-muted-foreground">Custeio Consolidado</p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setShowOrc(true)}
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-xl text-xs font-medium hover:bg-accent transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Orçamentos</span>
          </button>
          <button
            onClick={handleExport}
            disabled={!custo}
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-xl text-xs font-medium hover:bg-accent transition-colors disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">CSV</span>
          </button>
        </div>
      </div>

      {/* Selector de período */}
      <div className="flex gap-1.5">
        {(['mes', 'ano', 'tudo'] as Periodo[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriodo(p)}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
              periodo === p ? 'bg-primary text-primary-foreground' : 'bg-accent text-foreground hover:bg-accent/70'
            }`}
          >
            {p === 'mes' ? 'Este mês' : p === 'ano' ? 'Este ano' : 'Tudo'}
          </button>
        ))}
      </div>

      {/* Erro */}
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive">
          {error}
        </div>
      )}

      {/* KPI total */}
      <div className={`bg-card rounded-2xl border p-5 ${
        excede ? 'border-destructive/40' : 'border-border'
      }`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Custo Total</p>
            <p className="text-3xl font-bold tabular-nums">
              {loading ? '—' : EUR.format(custo?.total ?? 0)}
            </p>
            {totalOrc != null && (
              <p className={`text-sm mt-0.5 ${excede ? 'text-destructive' : 'text-success'}`}>
                {excede ? '+' : ''}{EUR.format((custo?.total ?? 0) - totalOrc)} vs orçamento
              </p>
            )}
          </div>
          <div className={`p-3 rounded-xl ${excede ? 'bg-destructive/10' : 'bg-primary/10'}`}>
            <VarIcon className={`w-6 h-6 ${excede ? 'text-destructive' : 'text-primary'}`} />
          </div>
        </div>
        {totalOrc != null && custo && (
          <ProgressBar real={custo.total} orcamento={totalOrc} />
        )}
      </div>

      {/* Cards por categoria */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {CATS.map(c => {
          const Icon  = c.icon
          const valor = loading ? null : (custo?.[c.key as CatKey] ?? 0)
          const orc   = custo?.orcamentos?.[c.key as CatKey]

          return (
            <div key={c.key} className="bg-card rounded-2xl border border-border p-4">
              <div className="flex items-center gap-2.5 mb-3">
                <div className={`p-2 rounded-lg ${c.bg} shrink-0`}>
                  <Icon className={`w-4 h-4 ${c.color}`} />
                </div>
                <span className="text-sm font-medium">{c.label}</span>
              </div>
              {loading ? (
                <div className="h-7 skeleton rounded-lg w-28" />
              ) : (
                <p className="text-xl font-bold tabular-nums">{EUR.format(valor ?? 0)}</p>
              )}
              <ProgressBar real={valor ?? 0} orcamento={orc} />
            </div>
          )
        })}
      </div>

      {/* Gráfico */}
      {custo && custo.total > 0 && (
        <div className="bg-card rounded-2xl border border-border p-5">
          <p className="text-sm font-semibold mb-1">Distribuição por Categoria</p>
          <DashboardRentabilidade custo={custo} />
        </div>
      )}

      {/* Modal orçamentos */}
      {showOrcamentos && (
        <OrcamentosModal
          obraId={id!}
          inicial={custo?.orcamentos ?? {}}
          onClose={() => setShowOrc(false)}
          onSaved={reload}
        />
      )}
    </div>
  )
}
