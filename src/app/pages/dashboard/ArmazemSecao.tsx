import { Package, ArrowDownCircle, ArrowUpCircle, AlertTriangle, ChevronRight, RefreshCw } from 'lucide-react'
import { Link } from 'react-router'
import { StatCard } from '../../components/StatCard'
import { StockBadge } from '../../components/StockBadge'
import { MovementTypeBadge } from '../../components/MovementTypeBadge'
import { getUnitLabel } from '../../data/mockData'
import { useDashboard } from '@/features/dashboard/hooks/useDashboard'
import { AlertasWidget } from '@/features/alertas'

const MOVEMENT_TABLE_HEADERS = ['Data/Hora', 'Produto', 'Tipo', 'Quantidade', 'Responsável'] as const

function SkeletonRow() {
  return (
    <div className="px-5 py-4 flex items-center gap-4 border-b border-border last:border-0">
      <div className="skeleton h-3.5 w-16 shrink-0" />
      <div className="skeleton h-3.5 flex-1" />
      <div className="skeleton h-5 w-14 rounded-full shrink-0" />
      <div className="skeleton h-3.5 w-12 shrink-0" />
      <div className="skeleton h-3.5 w-20 shrink-0" />
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="p-3 rounded-lg border border-border space-y-2">
      <div className="flex justify-between">
        <div className="skeleton h-3.5 w-32" />
        <div className="skeleton h-5 w-16 rounded-full" />
      </div>
      <div className="flex justify-between">
        <div className="skeleton h-3 w-24" />
        <div className="skeleton h-3 w-16" />
      </div>
    </div>
  );
}

export function ArmazemSecao() {
  const { stats, loading, error, reload } = useDashboard()

  return (
    <section className="space-y-5" aria-labelledby="dash-armazem">
      <div className="flex items-center gap-2 pt-1">
        <Package className="w-4 h-4 text-muted-foreground" />
        <h2 id="dash-armazem" className="font-semibold text-base">Armazém</h2>
        <Link to="/armazem" className="ml-auto text-sm text-primary hover:underline flex items-center gap-1">
          Abrir armazém <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-card p-4 flex items-center gap-3" role="alert">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
          <p className="text-sm flex-1">Não foi possível carregar os dados do armazém. Os valores abaixo não são fiáveis.</p>
          <button onClick={reload} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-accent">
            <RefreshCw className="w-3.5 h-3.5" /> Tentar de novo
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          title="Total Produtos"
          value={loading ? '…' : error ? '—' : (stats?.totalProducts ?? 0)}
          icon={Package}
          variant="default"
          delay="delay-50"
        />
        <StatCard
          title="Entradas Hoje"
          value={loading ? '…' : error ? '—' : (stats?.todayEntries ?? 0)}
          icon={ArrowDownCircle}
          variant="success"
          delay="delay-100"
        />
        <StatCard
          title="Saídas Hoje"
          value={loading ? '…' : error ? '—' : (stats?.todayExits ?? 0)}
          icon={ArrowUpCircle}
          variant="warning"
          delay="delay-150"
        />
        <StatCard
          title="Stock Baixo/Crítico"
          value={loading ? '…' : error ? '—' : (stats?.lowStockProducts ?? 0)}
          icon={AlertTriangle}
          variant="danger"
          delay="delay-200"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        <div className="lg:col-span-2 bg-card rounded-xl border border-border enc-fade-up delay-150">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-base">Últimos Movimentos</h2>
          </div>

          {loading ? (
            <div className="hidden md:block">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : error ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Indisponível</div>
          ) : !stats?.recentMovements.length ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Sem movimentos registados</div>
          ) : (
            <>
              {/* Mobile: cards */}
              <div className="md:hidden divide-y divide-border">
                {stats.recentMovements.slice(0, 5).map((m, i) => (
                  <div
                    key={m.id}
                    className={`p-4 flex items-start gap-3 enc-fade-up delay-${[50,100,150,200,250][i] ?? 250}`}
                  >
                    <MovementTypeBadge type={m.type} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{m.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.quantity} {getUnitLabel(m.unit)} · {m.responsible}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {m.date.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>

              {/* Desktop: tabela */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      {MOVEMENT_TABLE_HEADERS.map((h) => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {stats.recentMovements.map((m) => (
                      <tr key={m.id} className="hover:bg-accent/50 transition-colors">
                        <td className="px-5 py-3 whitespace-nowrap text-sm">
                          {m.date.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })}{' '}
                          {m.date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-5 py-3 text-sm">{m.productName}</td>
                        <td className="px-5 py-3 whitespace-nowrap"><MovementTypeBadge type={m.type} /></td>
                        <td className="px-5 py-3 whitespace-nowrap text-sm">{m.quantity} {getUnitLabel(m.unit)}</td>
                        <td className="px-5 py-3 whitespace-nowrap text-sm">{m.responsible}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="p-4 border-t border-border">
            <Link
              to="/armazem/movimentos"
              className="text-sm text-primary hover:underline flex items-center gap-1 transition-colors"
            >
              Ver todo o histórico <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        <div className="space-y-5">
        <AlertasWidget />

        <div className="bg-card rounded-xl border border-border enc-fade-up delay-200">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-base">Alertas de Stock</h2>
            <AlertTriangle className="w-5 h-5 text-warning" />
          </div>
          <div className="p-4">
            {loading ? (
              <div className="space-y-3">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            ) : error ? (
              <p className="text-sm text-muted-foreground text-center py-6">Indisponível</p>
            ) : !stats?.lowStockItems.length ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Todos os produtos com stock adequado ✓
              </p>
            ) : (
              <div className="space-y-3">
                {stats.lowStockItems.map((p, i) => (
                  <Link
                    key={p.id}
                    to={`/armazem/produto/${p.id}`}
                    className={`block p-3 bg-accent/50 rounded-lg border border-border hover:border-primary/50 active:bg-accent transition-all enc-fade-up delay-${[50,100,150,200][i] ?? 200}`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <p className="text-sm font-medium leading-tight flex-1 mr-2">{p.name}</p>
                      <StockBadge status={p.status} />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Atual: <strong className="text-foreground">{p.currentStock} {getUnitLabel(p.unit)}</strong></span>
                      <span>Mín: <strong className="text-warning">{p.minStock}</strong></span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
          {!!stats?.lowStockItems.length && (
            <div className="px-4 pb-4">
              <Link
                to="/armazem/inventario"
                className="w-full py-2.5 border border-border rounded-lg text-sm text-foreground hover:bg-accent transition-colors flex items-center justify-center gap-1"
              >
                Ver todos os produtos <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
        </div>
      </div>
    </section>
  )
}
