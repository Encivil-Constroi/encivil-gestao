import { useState, useMemo } from 'react';

const HISTORY_TABLE_HEADERS = ['Data','Produto','Tipo','Quantidade','Novo Stock','Responsável','Destino/Obra'] as const;
import { useSearchParams } from 'react-router';
import { History, ArrowDownCircle, ArrowUpCircle, LayoutList, X, ChevronLeft, ChevronRight, Search, Download } from 'lucide-react';
import { toast } from 'sonner';
import { MovementTypeBadge } from '../components/MovementTypeBadge';
import { EmptyState } from '../components/EmptyState';
import { getUnitLabel } from '../data/mockData';
import { exportarCsv } from '../lib/exportCsv';
import type { MovementType } from '../types';
import { useMovimentosPaginados } from '@/features/movimentos/hooks/useMovimentos';
import { type FiltrosMovimentos, PAGE_SIZE, exportarMovimentos } from '@/features/movimentos/services/movimentosService';

type PeriodFilter = 'todos' | 'hoje' | 'semana' | 'mes';
type TypeFilter   = MovementType | 'todos';

const periodOpts: { value: PeriodFilter; label: string }[] = [
  { value: 'todos',  label: 'Todos' },
  { value: 'hoje',   label: 'Hoje' },
  { value: 'semana', label: 'Esta Semana' },
  { value: 'mes',    label: 'Este Mês' },
];

const typeOpts: { value: TypeFilter; label: string }[] = [
  { value: 'todos',   label: 'Todos' },
  { value: 'saida',   label: 'Saídas' },
  { value: 'entrada', label: 'Entradas' },
  { value: 'ajuste',  label: 'Correções' },
];

export function HistoryPage() {
  const [searchParams] = useSearchParams();
  const produtoParam = searchParams.get('produto') ?? undefined;

  const [filterType,   setFilterType]   = useState<TypeFilter>('todos');
  const [filterPeriod, setFilterPeriod] = useState<PeriodFilter>('todos');
  const [filterDestino, setFilterDestino] = useState('');

  const filtros = useMemo((): FiltrosMovimentos => {
    const f: FiltrosMovimentos = {}
    if (produtoParam) f.produtoId = produtoParam
    if (filterType !== 'todos') f.tipo = filterType as MovementType
    if (filterDestino.trim()) f.destino = filterDestino.trim()
    if (filterPeriod === 'hoje') {
      const d = new Date(); d.setHours(0, 0, 0, 0); f.dataInicio = d
    } else if (filterPeriod === 'semana') {
      const d = new Date(); d.setDate(d.getDate() - 7); f.dataInicio = d
    } else if (filterPeriod === 'mes') {
      const d = new Date(); d.setMonth(d.getMonth() - 1); f.dataInicio = d
    }
    return f
  }, [produtoParam, filterType, filterPeriod, filterDestino])

  const { movements, count, page, totalPages, loading, setPage } = useMovimentosPaginados(filtros);
  const hasFilter = filterType !== 'todos' || filterPeriod !== 'todos' || filterDestino.trim() !== '';
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true)
    try {
      const all = await exportarMovimentos(filtros)
      const rows = all.map(m => ({
        Data: m.date.toLocaleDateString('pt-PT'),
        Hora: m.date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
        Produto: m.productName,
        Tipo: m.type,
        Quantidade: m.quantity,
        Unidade: m.unit,
        'Stock Antes': m.previousStock,
        'Stock Depois': m.newStock,
        Responsável: m.responsible,
        Destino: m.destination ?? '',
        Observações: m.notes ?? '',
      }))
      exportarCsv(rows, 'historico_movimentos')
      toast.success(`${all.length} movimento${all.length !== 1 ? 's' : ''} exportados`)
    } catch {
      toast.error('Erro ao exportar')
    } finally {
      setExporting(false)
    }
  }

  const selectCls = 'px-3 py-2.5 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm w-full';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Histórico</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading
              ? 'A carregar…'
              : count > 0
              ? `${count} movimento${count !== 1 ? 's' : ''}${totalPages > 1 ? ` · página ${page + 1} de ${totalPages}` : ''}`
              : 'Nenhum movimento'
            }
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || loading || count === 0}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border border-border hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          <Download className="w-4 h-4" />
          {exporting ? 'A exportar…' : 'Excel'}
        </button>
      </div>

      {/* Filtros — sempre visíveis */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Período</label>
            <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value as PeriodFilter)} className={selectCls}>
              {periodOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Tipo</label>
            <select value={filterType} onChange={e => setFilterType(e.target.value as TypeFilter)} className={selectCls}>
              {typeOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {hasFilter && (
            <div className="flex items-end">
              <button
                onClick={() => { setFilterType('todos'); setFilterPeriod('todos'); setFilterDestino(''); }}
                className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-xl transition-colors border border-border w-full sm:w-auto justify-center"
              >
                <X className="w-3.5 h-3.5" />
                Limpar
              </button>
            </div>
          )}
        </div>

        <div className="mt-3">
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Destino / Obra</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={filterDestino}
              onChange={e => setFilterDestino(e.target.value)}
              placeholder="Pesquisar por destino ou obra…"
              className="w-full pl-9 pr-3 py-2.5 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            />
          </div>
        </div>

        {/* Atalhos rápidos de tipo */}
        <div className="flex gap-2 mt-3 flex-wrap">
          <button
            onClick={() => setFilterType('saida')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              filterType === 'saida'
                ? 'bg-destructive/10 text-destructive border-destructive/30'
                : 'bg-transparent text-muted-foreground border-border hover:border-destructive/30'
            }`}
          >
            <ArrowUpCircle className="w-3 h-3" /> Só Saídas
          </button>
          <button
            onClick={() => setFilterType('entrada')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              filterType === 'entrada'
                ? 'bg-success/10 text-success border-success/30'
                : 'bg-transparent text-muted-foreground border-border hover:border-success/30'
            }`}
          >
            <ArrowDownCircle className="w-3 h-3" /> Só Entradas
          </button>
          <button
            onClick={() => setFilterPeriod('hoje')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              filterPeriod === 'hoje'
                ? 'bg-primary/10 text-primary border-primary/30'
                : 'bg-transparent text-muted-foreground border-border hover:border-primary/30'
            }`}
          >
            <LayoutList className="w-3 h-3" /> Hoje
          </button>
        </div>
      </div>

      {/* Lista de movimentos */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">A carregar…</div>
        ) : movements.length === 0 ? (
          <EmptyState icon={History} title="Nenhum movimento encontrado" description="Tente alterar os filtros." />
        ) : (
          <>
            {/* Mobile: cards */}
            <div className="md:hidden divide-y divide-border">
              {movements.map(m => (
                <div key={m.id} className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <MovementTypeBadge type={m.type} />
                      <span className="text-sm font-semibold truncate">{m.productName}</span>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                      {m.date.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs flex-wrap">
                    <span className="font-bold text-sm text-foreground">
                      {m.quantity} {getUnitLabel(m.unit)}
                    </span>
                    <span className="text-muted-foreground">
                      Stock: <strong className="text-foreground">{m.newStock}</strong> {getUnitLabel(m.unit)}
                    </span>
                    {m.responsible && (
                      <span className="text-muted-foreground">{m.responsible}</span>
                    )}
                    {m.destination && (
                      <span className="text-muted-foreground">→ {m.destination}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: tabela */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    {HISTORY_TABLE_HEADERS.map(h => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {movements.map(m => (
                    <tr key={m.id} className="hover:bg-accent/40 transition-colors">
                      <td className="px-5 py-3 whitespace-nowrap text-sm">
                        <div className="font-medium">{m.date.toLocaleDateString('pt-PT', { day:'2-digit', month:'2-digit', year:'numeric' })}</div>
                        <div className="text-xs text-muted-foreground">{m.date.toLocaleTimeString('pt-PT', { hour:'2-digit', minute:'2-digit' })}</div>
                      </td>
                      <td className="px-5 py-3 text-sm font-medium">{m.productName}</td>
                      <td className="px-5 py-3 whitespace-nowrap"><MovementTypeBadge type={m.type} /></td>
                      <td className="px-5 py-3 whitespace-nowrap text-sm font-bold">{m.quantity} {getUnitLabel(m.unit)}</td>
                      <td className="px-5 py-3 whitespace-nowrap text-sm">
                        <span className="font-semibold">{m.newStock}</span>
                        <span className="text-muted-foreground text-xs ml-1">{getUnitLabel(m.unit)}</span>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap text-sm text-muted-foreground">{m.responsible}</td>
                      <td className="px-5 py-3 text-sm text-muted-foreground">{m.destination ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Paginação — só aparece quando há mais de uma página */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-border flex items-center justify-between gap-3">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl border border-border hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </button>

            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span className="hidden sm:inline">Página</span>
              <span className="font-semibold text-foreground">{page + 1}</span>
              <span>de</span>
              <span className="font-semibold text-foreground">{totalPages}</span>
              <span className="hidden sm:inline text-xs">· {PAGE_SIZE} por página</span>
            </div>

            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1 || loading}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl border border-border hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Seguinte
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
