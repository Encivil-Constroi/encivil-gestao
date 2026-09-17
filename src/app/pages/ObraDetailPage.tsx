import { useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router';
import {
  ChevronLeft, Pencil, Building2, User, MapPin, HardHat, Package,
  ArrowRight, CheckCircle2, FileEdit, Fuel, Wallet, TrendingUp, TrendingDown, Wrench, BarChart2, PieChart, BookOpen, Truck,
} from 'lucide-react';
import { fmtEuro, fmtNumber } from '../lib/format';
import { getUnitLabel } from '../data/mockData';
import { useRole } from '@/features/auth/useRole';
import { useObra } from '@/features/obras/hooks/useObras';
import { useSubempreiteirosComExecutado } from '@/features/subempreiteiros/hooks/useSubempreiteiros';
import { useMovimentos } from '@/features/movimentos/hooks/useMovimentos';
import { useAbastecimentos } from '@/features/combustivel/hooks/useCombustivel';
import { useEmprestimos } from '@/features/ferramentas/hooks/useEmprestimos';
import { useCustoObra } from '@/features/custos/useCustoObra';

export function ObraDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { podeObras } = useRole();

  const { obra, loading } = useObra(id);
  const { subs, loading: subsLoading } = useSubempreiteirosComExecutado(id);
  // Materiais, combustível e ferramentas desta obra — todos ligados por obra_id.
  const { movements, loading: movsLoading } = useMovimentos(id ? { tipo: 'saida', obraId: id } : {});
  const { entries: fuelEntries, loading: fuelLoading } = useAbastecimentos(id ? { obraId: id } : {});
  const { loans: tools, loading: toolsLoading } = useEmprestimos(id ? { obraId: id } : {});

  const { custo, loading: custoLoading } = useCustoObra(id, obra?.budget);

  const custoCombustivel = useMemo(() => fuelEntries.reduce((s, e) => s + e.totalCost, 0), [fuelEntries]);

  if (loading) return <div className="max-w-3xl mx-auto p-8 text-center text-sm text-muted-foreground">A carregar…</div>;
  if (!obra) return <div className="max-w-3xl mx-auto p-8 text-center text-sm text-muted-foreground">Obra não encontrada.</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-24">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label="Voltar" className="p-2 hover:bg-accent rounded-lg transition-colors shrink-0">
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
        </button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="bg-primary/10 rounded-xl p-2.5 shrink-0"><Building2 className="w-5 h-5 text-primary" /></div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-semibold truncate">{obra.name}</h1>
            <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
              obra.status === 'concluida' ? 'bg-muted text-muted-foreground' : 'bg-success/10 text-success'
            }`}>{obra.status === 'concluida' ? 'Concluída' : 'Ativa'}</span>
          </div>
        </div>
        <button
          onClick={() => navigate(`/obras/${obra.id}/custos`)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border hover:bg-accent transition-colors text-sm font-medium text-muted-foreground hover:text-foreground shrink-0"
          title="Custeio Consolidado"
        >
          <PieChart className="w-4 h-4" />
          <span className="hidden sm:inline">Custos</span>
        </button>
        <button
          onClick={() => navigate(`/obras/${obra.id}/livro`)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border hover:bg-accent transition-colors text-sm font-medium text-muted-foreground hover:text-foreground shrink-0"
          title="Livro de Obra Digital"
        >
          <BookOpen className="w-4 h-4" />
          <span className="hidden sm:inline">Livro</span>
        </button>
        <button
          onClick={() => navigate(`/obras/${obra.id}/guias`)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border hover:bg-accent transition-colors text-sm font-medium text-muted-foreground hover:text-foreground shrink-0"
          title="Guias de Transporte"
        >
          <Truck className="w-4 h-4" />
          <span className="hidden sm:inline">Guias</span>
        </button>
        <button
          onClick={() => window.open(`/obras/${obra.id}/relatorio`, '_blank')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border hover:bg-accent transition-colors text-sm font-medium text-muted-foreground hover:text-foreground shrink-0"
          title="Relatório Financeiro"
        >
          <BarChart2 className="w-4 h-4" />
          <span className="hidden sm:inline">Relatório</span>
        </button>
        {podeObras && (
          <button onClick={() => navigate(`/obras/${obra.id}/editar`)} className="flex items-center gap-1.5 px-3.5 py-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-colors text-sm font-semibold shrink-0">
            <Pencil className="w-4 h-4" /> <span className="hidden sm:inline">Editar</span>
          </button>
        )}
      </div>

      {(obra.client || obra.location) && (
        <div className="bg-card rounded-2xl border border-border divide-y divide-border">
          {obra.client && (
            <div className="px-5 py-3 flex items-center gap-2 text-sm"><User className="w-4 h-4 text-muted-foreground shrink-0" /> <span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{obra.client}</span></div>
          )}
          {obra.location && (
            <div className="px-5 py-3 flex items-center gap-2 text-sm"><MapPin className="w-4 h-4 text-muted-foreground shrink-0" /> <span className="text-muted-foreground">Local:</span> <span className="font-medium">{obra.location}</span></div>
          )}
        </div>
      )}

      {/* Resultado da obra (P&L) */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-2xl border border-border p-4 text-center">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Orçamento</p>
          <p className="text-base md:text-lg font-bold mt-1 text-foreground">{obra.budget != null ? fmtEuro(obra.budget) : '—'}</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4 text-center">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Custo Real</p>
          <p className="text-base md:text-lg font-bold mt-1 text-destructive">{custoLoading ? '…' : fmtEuro(custo?.total)}</p>
        </div>
        <div className={`rounded-2xl border p-4 text-center ${
          custo?.margem == null ? 'bg-card border-border'
            : custo.margem >= 0 ? 'bg-success/5 border-success/30' : 'bg-destructive/5 border-destructive/30'
        }`}>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center justify-center gap-1">
            Margem {custo?.margem != null && (custo.margem >= 0 ? <TrendingUp className="w-3 h-3 text-success" /> : <TrendingDown className="w-3 h-3 text-destructive" />)}
          </p>
          <p className={`text-base md:text-lg font-bold mt-1 ${
            custo?.margem == null ? 'text-muted-foreground' : custo.margem >= 0 ? 'text-success' : 'text-destructive'
          }`}>
            {custo?.margem != null ? fmtEuro(custo.margem) : '—'}
          </p>
        </div>
      </div>

      {/* Gauge de consumo do orçamento */}
      {obra.budget != null && custo && (
        <div className="bg-card rounded-2xl border border-border p-4">
          {(() => {
            const pct = Math.min(Math.round((custo.total / obra.budget!) * 100), 100);
            const color = pct >= 100 ? 'bg-destructive' : pct >= 90 ? 'bg-orange-500' : pct >= 70 ? 'bg-amber-400' : 'bg-success';
            const textColor = pct >= 90 ? 'text-destructive' : pct >= 70 ? 'text-amber-600' : 'text-success';
            const margemPct = custo.margem != null ? ((custo.margem / obra.budget!) * 100).toFixed(1) : null;
            return (
              <>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground">Consumo do orçamento</p>
                  <div className="flex items-center gap-2">
                    {margemPct != null && (
                      <span className={`text-xs font-semibold ${Number(margemPct) >= 0 ? 'text-success' : 'text-destructive'}`}>
                        Margem {margemPct}%
                      </span>
                    )}
                    <span className={`text-xs font-bold tabular-nums ${textColor}`}>{pct}%</span>
                  </div>
                </div>
                <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>€0</span>
                  <span>{fmtEuro(obra.budget)}</span>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Repartição do custo real */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-sm">Repartição do Custo</h2>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Materiais</p>
            <p className="text-sm md:text-base font-bold mt-1">{custoLoading ? '…' : fmtEuro(custo?.materiais)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Subempreiteiros</p>
            <p className="text-sm md:text-base font-bold mt-1">{custoLoading ? '…' : fmtEuro(custo?.subempreiteiros)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Combustível</p>
            <p className="text-sm md:text-base font-bold mt-1">{custoLoading ? '…' : fmtEuro(custo?.combustivel)}</p>
          </div>
        </div>
        {obra.budget == null && (
          <p className="text-xs text-muted-foreground text-center mt-3">Defina o orçamento da obra (em Editar) para ver a margem.</p>
        )}
      </div>

      {/* Subempreiteiros da obra */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border bg-muted/30 flex items-center justify-between">
          <h2 className="font-semibold text-sm flex items-center gap-2"><HardHat className="w-4 h-4" /> Subempreiteiros</h2>
          <Link to={`/subempreiteiros?obra=${obra.id}`} className="text-xs font-medium text-primary hover:underline">Ver todos</Link>
        </div>
        {subsLoading ? (
          <p className="px-5 py-6 text-sm text-muted-foreground text-center">A carregar…</p>
        ) : subs.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground text-center">Ainda não há subempreiteiros nesta obra.</p>
        ) : (
          <div className="divide-y divide-border">
            {subs.map(s => (
              <Link key={s.id} to={`/subempreiteiros/${s.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-accent/40 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    {s.status === 'validado'
                      ? <><CheckCircle2 className="w-3 h-3 text-success" /> Validado</>
                      : <><FileEdit className="w-3 h-3 text-warning" /> Rascunho</>}
                    · exec. {fmtEuro(s.executed)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-bold">{fmtEuro(s.agreedValue)}</span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Materiais enviados para a obra */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border bg-muted/30 flex items-center justify-between">
          <h2 className="font-semibold text-sm flex items-center gap-2"><Package className="w-4 h-4" /> Materiais enviados</h2>
          <Link to={`/historico?tipo=saida`} className="text-xs font-medium text-primary hover:underline">Histórico</Link>
        </div>
        {movsLoading ? (
          <p className="px-5 py-6 text-sm text-muted-foreground text-center">A carregar…</p>
        ) : movements.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground text-center">Sem saídas de material registadas para esta obra.</p>
        ) : (
          <div className="divide-y divide-border">
            {movements.slice(0, 10).map(m => (
              <div key={m.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{m.productName}</p>
                  <p className="text-xs text-muted-foreground">{m.date.toLocaleDateString('pt-PT')}{m.responsible ? ` · ${m.responsible}` : ''}</p>
                </div>
                <span className="text-sm font-semibold whitespace-nowrap">{fmtNumber(m.quantity)} {getUnitLabel(m.unit)}</span>
              </div>
            ))}
            {movements.length > 10 && (
              <p className="px-5 py-2.5 text-xs text-muted-foreground text-center">+ {movements.length - 10} mais no histórico</p>
            )}
          </div>
        )}
      </div>

      {/* Combustível imputado à obra */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border bg-muted/30 flex items-center justify-between">
          <h2 className="font-semibold text-sm flex items-center gap-2"><Fuel className="w-4 h-4" /> Combustível</h2>
          {custoCombustivel > 0 && <span className="text-sm font-bold">{fmtEuro(custoCombustivel)}</span>}
        </div>
        {fuelLoading ? (
          <p className="px-5 py-6 text-sm text-muted-foreground text-center">A carregar…</p>
        ) : fuelEntries.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground text-center">Sem combustível imputado a esta obra.</p>
        ) : (
          <div className="divide-y divide-border">
            {fuelEntries.slice(0, 10).map(e => (
              <div key={e.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{e.vehicleName ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">{e.date.toLocaleDateString('pt-PT')} · {fmtNumber(e.liters)} L</p>
                </div>
                <span className="text-sm font-semibold whitespace-nowrap">{fmtEuro(e.totalCost)}</span>
              </div>
            ))}
            {fuelEntries.length > 10 && (
              <p className="px-5 py-2.5 text-xs text-muted-foreground text-center">+ {fuelEntries.length - 10} mais</p>
            )}
          </div>
        )}
      </div>

      {/* Ferramentas ao serviço da obra */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border bg-muted/30 flex items-center justify-between">
          <h2 className="font-semibold text-sm flex items-center gap-2"><Wrench className="w-4 h-4" /> Ferramentas</h2>
          {tools.length > 0 && (
            <span className="text-xs text-muted-foreground">{tools.filter(t => t.status === 'ativo').length} em obra</span>
          )}
        </div>
        {toolsLoading ? (
          <p className="px-5 py-6 text-sm text-muted-foreground text-center">A carregar…</p>
        ) : tools.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground text-center">Sem ferramentas entregues a esta obra.</p>
        ) : (
          <div className="divide-y divide-border">
            {tools.slice(0, 10).map(t => (
              <div key={t.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{t.toolName} <span className="text-xs text-muted-foreground font-normal">{t.toolCode}</span></p>
                  <p className="text-xs text-muted-foreground">{t.employeeName} · {t.loanDate.toLocaleDateString('pt-PT')}</p>
                </div>
                {t.status === 'ativo' ? (
                  <span className="text-[11px] font-semibold text-warning whitespace-nowrap">Em obra</span>
                ) : (
                  <span className="text-[11px] font-semibold text-success whitespace-nowrap">Devolvida</span>
                )}
              </div>
            ))}
            {tools.length > 10 && (
              <p className="px-5 py-2.5 text-xs text-muted-foreground text-center">+ {tools.length - 10} mais</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
