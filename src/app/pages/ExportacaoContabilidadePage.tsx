import { useState, useEffect } from 'react'
import {
  Download, Package, Fuel, HardHat, BarChart2, FileDown, CheckCircle2, AlertTriangle, Loader2,
} from 'lucide-react'
import { exportarCsv } from '@/app/lib/exportCsv'
import { useObras } from '@/features/obras/hooks/useObras'
import {
  exportarMateriais, exportarCombustivel, exportarAutos, exportarPLObras,
  type FiltrosExport,
} from '@/features/contabilidade/contabilidadeService'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hoje(): string { return new Date().toISOString().split('T')[0] }
function primeiroDiaDoMes(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
}
function nomeFicheiro(prefixo: string, filtros: FiltrosExport): string {
  const de  = filtros.dataInicio ?? 'inicio'
  const ate = filtros.dataFim    ?? hoje()
  return `${prefixo}_${de}_ate_${ate}`
}

// ─── Estado por card ──────────────────────────────────────────────────────────

type CardStatus = 'idle' | 'loading' | 'done' | 'error'

function StatusBadge({ status }: { status: CardStatus }) {
  if (status === 'loading') return <Loader2 className="w-4 h-4 animate-spin text-primary" />
  if (status === 'done')    return <CheckCircle2 className="w-4 h-4 text-success" />
  if (status === 'error')   return <AlertTriangle className="w-4 h-4 text-destructive" />
  return null
}

// ─── Definições dos 4 exports ─────────────────────────────────────────────────

const EXPORTS = [
  {
    id:          'materiais' as const,
    icon:        Package,
    color:       'bg-emerald-500/10 text-emerald-600',
    title:       'Saídas de Materiais',
    description: 'Produtos saídos do armazém com custo unitário e total, organizados por data e obra.',
    prefixo:     'materiais_saidas',
    nota:        'Filtro de data e obra aplicado',
    filtraData:  true,
    filtraObra:  true,
  },
  {
    id:          'combustivel' as const,
    icon:        Fuel,
    color:       'bg-amber-500/10 text-amber-600',
    title:       'Abastecimentos de Combustível',
    description: 'Registos de abastecimento com custo por litro, viatura e obra associada.',
    prefixo:     'combustivel',
    nota:        'Filtro de data e obra aplicado',
    filtraData:  true,
    filtraObra:  true,
  },
  {
    id:          'autos' as const,
    icon:        HardHat,
    color:       'bg-orange-500/10 text-orange-600',
    title:       'Autos de Medição Validados',
    description: 'Todos os autos com estado validado: valor bruto, retenção, valor líquido e estado de pagamento.',
    prefixo:     'autos_medicao_validados',
    nota:        'Apenas autos validados; filtro de data aplicado',
    filtraData:  true,
    filtraObra:  false,
  },
  {
    id:          'pl' as const,
    icon:        BarChart2,
    color:       'bg-blue-500/10 text-blue-600',
    title:       'P&L Resumo por Obra',
    description: 'Uma linha por obra com orçamento, custos por categoria, margem total e percentagem.',
    prefixo:     'pl_obras',
    nota:        'Histórico acumulado de todas as obras (sem filtro de data)',
    filtraData:  false,
    filtraObra:  false,
  },
] as const

type ExportId = typeof EXPORTS[number]['id']

// ─── Componente principal ──────────────────────────────────────────────────────

export function ExportacaoContabilidadePage() {
  const { obras, loading: obrasLoading } = useObras(false)

  const [dataInicio, setDataInicio] = useState(primeiroDiaDoMes)
  const [dataFim,    setDataFim]    = useState(hoje)
  const [obraId,     setObraId]     = useState('')

  const [status,  setStatus]  = useState<Record<ExportId, CardStatus>>({
    materiais: 'idle', combustivel: 'idle', autos: 'idle', pl: 'idle',
  })
  const [errors,  setErrors]  = useState<Record<ExportId, string | null>>({
    materiais: null, combustivel: null, autos: null, pl: null,
  })
  const [exportandoTudo, setExportandoTudo] = useState(false)

  // Reset status when filters change
  useEffect(() => {
    setStatus({ materiais: 'idle', combustivel: 'idle', autos: 'idle', pl: 'idle' })
    setErrors({ materiais: null, combustivel: null, autos: null, pl: null })
  }, [dataInicio, dataFim, obraId])

  const filtros: FiltrosExport = {
    dataInicio: dataInicio || undefined,
    dataFim:    dataFim    || undefined,
    obraId:     obraId     || undefined,
  }

  const exportarUm = async (id: ExportId) => {
    setStatus(s => ({ ...s, [id]: 'loading' }))
    setErrors(e => ({ ...e, [id]: null }))
    try {
      let rows
      const def = EXPORTS.find(x => x.id === id)!
      const filtrosCard: FiltrosExport = {
        dataInicio: def.filtraData ? filtros.dataInicio : undefined,
        dataFim:    def.filtraData ? filtros.dataFim    : undefined,
        obraId:     def.filtraObra ? filtros.obraId     : undefined,
      }
      if (id === 'materiais')    rows = await exportarMateriais(filtrosCard)
      else if (id === 'combustivel') rows = await exportarCombustivel(filtrosCard)
      else if (id === 'autos')   rows = await exportarAutos(filtrosCard)
      else                       rows = await exportarPLObras()

      if (rows.length === 0) {
        setErrors(e => ({ ...e, [id]: 'Nenhum registo encontrado para os filtros selecionados.' }))
        setStatus(s => ({ ...s, [id]: 'error' }))
        return
      }
      exportarCsv(rows, nomeFicheiro(def.prefixo, filtros))
      setStatus(s => ({ ...s, [id]: 'done' }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      setErrors(e => ({ ...e, [id]: msg }))
      setStatus(s => ({ ...s, [id]: 'error' }))
    }
  }

  const exportarTudo = async () => {
    setExportandoTudo(true)
    const ids: ExportId[] = ['materiais', 'combustivel', 'autos', 'pl']
    for (const id of ids) {
      await exportarUm(id)
      // Pequena pausa entre downloads para o browser processar
      await new Promise(r => setTimeout(r, 300))
    }
    setExportandoTudo(false)
  }

  const algumLoading = Object.values(status).some(s => s === 'loading')
  const todosFeitos  = EXPORTS.every(x => status[x.id] === 'done')

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold">Exportação para Contabilidade</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Descarregue ficheiros CSV prontos a importar no software de contabilidade.
          Todos os valores monetários são numéricos (sem símbolo €) para facilitar a importação.
        </p>
      </div>

      {/* Filtros */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Filtros</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">De</label>
            <input
              type="date"
              value={dataInicio}
              max={dataFim || undefined}
              onChange={e => setDataInicio(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Até</label>
            <input
              type="date"
              value={dataFim}
              min={dataInicio || undefined}
              onChange={e => setDataFim(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Obra</label>
            <select
              value={obraId}
              onChange={e => setObraId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Todas as obras</option>
              {obrasLoading
                ? <option disabled>A carregar…</option>
                : obras.map(o => <option key={o.id} value={o.id}>{o.name}</option>)
              }
            </select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          O P&L por Obra não usa filtro de data (é sempre acumulado). Para Autos, o filtro de obra não se aplica (autos são por subempreiteiro, não por obra directamente).
        </p>
      </div>

      {/* Cards de export */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {EXPORTS.map(def => {
          const Icon = def.icon
          const s    = status[def.id]
          const err  = errors[def.id]
          const isLoading = s === 'loading'
          return (
            <div key={def.id} className={`bg-card rounded-2xl border p-5 flex flex-col gap-3 transition-colors ${
              s === 'done' ? 'border-success/40 bg-success/5'
                : s === 'error' ? 'border-destructive/30'
                : 'border-border'
            }`}>
              <div className="flex items-start gap-3">
                <span className={`p-2.5 rounded-xl ${def.color} shrink-0`}>
                  <Icon className="w-5 h-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">{def.title}</p>
                    <StatusBadge status={s} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{def.description}</p>
                </div>
              </div>

              {err && (
                <div className="flex items-start gap-2 bg-destructive/10 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive">{err}</p>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 mt-auto">
                <span className="text-[11px] text-muted-foreground">{def.nota}</span>
                <button
                  onClick={() => exportarUm(def.id)}
                  disabled={isLoading || exportandoTudo}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  {isLoading
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> A exportar…</>
                    : <><Download className="w-3.5 h-3.5" /> Descarregar CSV</>
                  }
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Exportar Tudo */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-card rounded-2xl border border-border p-5">
        <div className="flex-1">
          <p className="font-semibold text-sm">Exportar Tudo</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Descarrega os 4 ficheiros CSV em sequência. Útil para enviar ao contabilista no fim do mês.
          </p>
        </div>
        <button
          onClick={exportarTudo}
          disabled={algumLoading || exportandoTudo}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {exportandoTudo
            ? <><Loader2 className="w-4 h-4 animate-spin" /> A exportar…</>
            : todosFeitos
              ? <><CheckCircle2 className="w-4 h-4" /> Exportado</>
              : <><FileDown className="w-4 h-4" /> Exportar 4 Ficheiros</>
          }
        </button>
      </div>

      {/* Legenda de colunas */}
      <details className="bg-card rounded-2xl border border-border">
        <summary className="px-5 py-3.5 text-sm font-semibold cursor-pointer select-none hover:bg-accent/40 rounded-2xl transition-colors">
          Estrutura dos ficheiros exportados
        </summary>
        <div className="px-5 pb-5 pt-2 grid grid-cols-1 sm:grid-cols-2 gap-5">
          {EXPORTS.map(def => (
            <div key={def.id}>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">{def.title}</p>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {COLS[def.id].map(c => <li key={c} className="font-mono">{c}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}

// ─── Colunas de cada export (para a legenda) ──────────────────────────────────

const COLS: Record<ExportId, string[]> = {
  materiais: [
    'Data', 'Produto', 'Código', 'Quantidade', 'Unidade',
    'Custo Unitário (€)', 'Custo Total (€)', 'Responsável', 'Obra',
  ],
  combustivel: [
    'Data', 'Viatura', 'Código Viatura', 'Litros', 'Custo/Litro (€)',
    'Custo Total (€)', 'Responsável', 'Obra', 'Local', 'Observações',
  ],
  autos: [
    'Nº Auto', 'Data Medição', 'Subempreiteiro', 'Obra',
    'Valor Bruto (€)', 'Retenção (%)', 'Valor Retido (€)', 'Valor Líquido (€)',
    'Estado Pagamento', 'Data Pagamento', 'Ref. Pagamento', 'Validado Em',
  ],
  pl: [
    'Obra', 'Cliente', 'Local', 'Estado', 'Orçamento (€)',
    'Materiais (€)', 'Subempreiteiros (€)', 'Combustível (€)',
    'Custo Total (€)', 'Margem (€)', 'Margem (%)',
  ],
}
