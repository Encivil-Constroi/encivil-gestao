import { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router';
import {
  Fuel, Plus, Truck, Droplet, Building2, Gauge, Pencil, QrCode,
  Printer, ClipboardList, ChevronLeft, ChevronRight, Calendar, Download, BarChart2, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { EmptyState } from '../components/EmptyState';
import { SkeletonList } from '../components/Skeletons';
import { fmtEuro, fmtNumber } from '../lib/format';
import { exportarXlsx } from '../lib/exportXlsx';
import { getVehicleTypeLabel, getFuelTypeLabel } from '@/features/combustivel/labels';
import { useAbastecimentos, useVeiculos } from '@/features/combustivel/hooks/useCombustivel';
import { useContagemAguardam } from '@/features/combustivel/hooks/usePedidos';
import { ListaPedidos } from '@/features/combustivel/pedidos';
import { BombaPolo2Card } from '@/features/combustivel/components/BombaPolo2Card';
import { useRole } from '@/features/auth/useRole';
import type { FuelEntry } from '@/app/types';

type Tab = 'abastecimentos' | 'veiculos' | 'pendentes' | 'analise';
type PeriodoTipo = 'mes' | 'tudo';

function mesLabel(d: Date) {
  return d.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })
}

function primeiroDiaMes(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function ultimoDiaMes(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

function toISO(d: Date) {
  return d.toISOString().split('T')[0]
}

function diaLabel(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  const hoje = toISO(new Date())
  const ontem = toISO(new Date(Date.now() - 86_400_000))
  if (dateStr === hoje)  return 'Hoje'
  if (dateStr === ontem) return 'Ontem'
  return d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'short' })
}

export function CombustivelPage() {
  const navigate = useNavigate();
  const { podeCombustivel } = useRole();
  const [tab, setTab] = useState<Tab>('abastecimentos');

  // Filtros da aba de abastecimentos
  const [periodoTipo, setPeriodoTipo] = useState<PeriodoTipo>('mes');
  const [mesRef, setMesRef] = useState(() => primeiroDiaMes(new Date()));
  const [veiculoFiltro, setVeiculoFiltro] = useState('');

  const filtros = useMemo(() => ({
    veiculoId: veiculoFiltro || undefined,
    dataInicio: periodoTipo === 'mes' ? toISO(primeiroDiaMes(mesRef)) : undefined,
    dataFim:    periodoTipo === 'mes' ? toISO(ultimoDiaMes(mesRef))   : undefined,
  }), [periodoTipo, mesRef, veiculoFiltro]);

  const { entries, loading }          = useAbastecimentos(filtros);

  // Para análise por viatura: só carrega quando o utilizador abre o separador "analise"
  const filtrosAnalise = useMemo(() => ({
    dataInicio: periodoTipo === 'mes' ? toISO(primeiroDiaMes(mesRef)) : undefined,
    dataFim:    periodoTipo === 'mes' ? toISO(ultimoDiaMes(mesRef))   : undefined,
  }), [periodoTipo, mesRef]);
  const { entries: allEntries, loading: aLoading } = useAbastecimentos(filtrosAnalise, tab === 'analise');

  const { vehicles, loading: vLoading } = useVeiculos(true);
  const aguardam = useContagemAguardam(true);
  const [exporting, setExporting] = useState(false);

  async function handleExportCombustivel() {
    if (entries.length === 0) return
    setExporting(true)
    try {
      const rows = entries.map(e => ({
        Data: e.date.toLocaleDateString('pt-PT'),
        Viatura: e.vehicleName ?? '',
        Matrícula: e.vehicleCode ?? '',
        'Litros': e.liters,
        'Custo Total (€)': e.totalCost,
        'Preço/L (€)': e.pricePerLiter,
        Contador: e.counter ?? '',
        Local: e.location ?? '',
        Responsável: e.responsible ?? '',
        Obra: e.obraName ?? '',
        Observações: e.notes ?? '',
        Foto: e.photoUrl ?? '',
      }))
      await exportarXlsx(rows, 'combustivel', 'Combustível')
      toast.success(`${rows.length} abastecimento${rows.length !== 1 ? 's' : ''} exportados`)
    } catch {
      toast.error('Erro ao exportar')
    } finally {
      setExporting(false)
    }
  }

  const totalGasto  = useMemo(() => entries.reduce((s, e) => s + e.totalCost, 0), [entries]);
  const totalLitros = useMemo(() => entries.reduce((s, e) => s + e.liters, 0), [entries]);

  // Análise por viatura
  const porViatura = useMemo(() => {
    type VStats = { name: string; code: string; count: number; litros: number; custo: number; lper100: number | null }
    const map = new Map<string, VStats>()
    for (const e of allEntries) {
      if (!map.has(e.vehicleId)) {
        map.set(e.vehicleId, { name: e.vehicleName ?? e.vehicleId, code: e.vehicleCode ?? '', count: 0, litros: 0, custo: 0, lper100: null })
      }
      const s = map.get(e.vehicleId)!
      s.count++
      s.litros += e.liters
      s.custo  += e.totalCost
    }
    // Calcular L/100km por viatura (requer pelo menos 2 leituras de contador em km)
    for (const [vid, stats] of map) {
      const withKm = allEntries
        .filter(e => e.vehicleId === vid && e.counter != null && e.counterUnit === 'km')
        .sort((a, b) => a.counter! - b.counter!)
      if (withKm.length >= 2) {
        const km = withKm[withKm.length - 1].counter! - withKm[0].counter!
        if (km > 0) {
          const litersInRange = withKm.slice(1).reduce((s, e) => s + e.liters, 0)
          stats.lper100 = (litersInRange / km) * 100
        }
      }
    }
    return [...map.values()].sort((a, b) => b.custo - a.custo)
  }, [allEntries])

  // Agrupa entradas por data (YYYY-MM-DD), mantém ordem decrescente
  const porDia = useMemo(() => {
    const map = new Map<string, FuelEntry[]>();
    for (const e of entries) {
      const k = toISO(e.date);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [entries]);

  const abrirQR = (id: string, name: string, code: string) => {
    window.open(`/pub/imprimir-qr?v=${id}&vn=${encodeURIComponent(name)}&vc=${encodeURIComponent(code)}`, '_blank');
  };

  const subtitleMap: Record<Tab, string> = {
    abastecimentos: loading
      ? 'A carregar…'
      : `${entries.length} abastecimento${entries.length !== 1 ? 's' : ''} · ${fmtEuro(totalGasto)} · ${fmtNumber(totalLitros)} L`,
    veiculos: vLoading
      ? 'A carregar…'
      : `${vehicles.length} viatura${vehicles.length !== 1 ? 's' : ''}/máquina${vehicles.length !== 1 ? 's' : ''}`,
    pendentes: `${aguardam} pedido${aguardam !== 1 ? 's' : ''} à espera de autorização`,
    analise: aLoading
      ? 'A carregar…'
      : `${porViatura.length} viatura${porViatura.length !== 1 ? 's' : ''} com dados`,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Combustível</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{subtitleMap[tab]}</p>
        </div>
        {podeCombustivel && tab !== 'pendentes' && (
          <button
            onClick={() => navigate(tab === 'abastecimentos' ? '/combustivel/abastecimento' : '/combustivel/veiculo')}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 active:scale-[0.98] transition-all shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{tab === 'abastecimentos' ? 'Novo Abastecimento' : 'Nova Viatura'}</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border overflow-x-auto">
        {([
          ['abastecimentos', 'Abastecimentos', Droplet],
          ['veiculos',       'Viaturas & Máquinas', Truck],
          ['analise',        'Análise', BarChart2],
          ['pendentes',      'Pedidos', ClipboardList],
        ] as const).map(([v, label, Icon]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === v ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {v === 'pendentes' && aguardam > 0 && (
              <span className="ml-0.5 bg-warning text-warning-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
                {aguardam}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Abastecimentos ─────────────────────────────── */}
      {tab === 'abastecimentos' && (
        <div className="space-y-3">

          {/* Barra de filtros */}
          <div className="flex flex-col sm:flex-row gap-2">

            {/* Navegador de período */}
            <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1 flex-1 min-w-0">
              <button
                onClick={() => setPeriodoTipo('tudo')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors shrink-0 ${
                  periodoTipo === 'tudo' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                Tudo
              </button>
              <div className={`flex items-center gap-1 flex-1 min-w-0 transition-opacity ${periodoTipo !== 'mes' ? 'opacity-40 pointer-events-none' : ''}`}>
                <button
                  onClick={() => { setPeriodoTipo('mes'); setMesRef(d => new Date(d.getFullYear(), d.getMonth() - 1, 1)); }}
                  className="p-1.5 hover:bg-accent rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPeriodoTipo('mes')}
                  className={`flex-1 min-w-0 text-center text-sm font-semibold capitalize truncate px-1 py-2 rounded-lg transition-colors ${
                    periodoTipo === 'mes' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                  }`}
                >
                  {mesLabel(mesRef)}
                </button>
                <button
                  onClick={() => { setPeriodoTipo('mes'); setMesRef(d => new Date(d.getFullYear(), d.getMonth() + 1, 1)); }}
                  disabled={mesRef >= primeiroDiaMes(new Date())}
                  className="p-1.5 hover:bg-accent rounded-lg transition-colors disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Filtro de viatura */}
            <select
              value={veiculoFiltro}
              onChange={e => setVeiculoFiltro(e.target.value)}
              className="bg-card border border-border rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 sm:w-48"
            >
              <option value="">Todas as viaturas</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.name} {v.code ? `(${v.code})` : ''}</option>
              ))}
            </select>

            {/* Exportar CSV */}
            <button
              onClick={handleExportCombustivel}
              disabled={exporting || loading || entries.length === 0}
              title="Exportar para Excel"
              className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border rounded-xl text-sm font-medium hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">{exporting ? 'A exportar…' : 'Excel'}</span>
            </button>
          </div>

          {/* Sumário do período */}
          {!loading && entries.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-card border border-border rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground mb-0.5">Abastecimentos</p>
                <p className="text-lg font-bold">{entries.length}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground mb-0.5">Total litros</p>
                <p className="text-lg font-bold">{fmtNumber(totalLitros)} L</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground mb-0.5">Custo total</p>
                <p className="text-lg font-bold">{fmtEuro(totalGasto)}</p>
              </div>
            </div>
          )}

          {/* Lista agrupada por dia */}
          {loading ? (
            <SkeletonList rows={5} cols={4} />
          ) : entries.length === 0 ? (
            <EmptyState
              icon={Fuel}
              title="Sem abastecimentos"
              description={periodoTipo === 'mes' ? `Nenhum abastecimento em ${mesLabel(mesRef)}.` : 'Nenhum abastecimento registado.'}
            />
          ) : (
            <div className="space-y-4">
              {porDia.map(([dia, dayEntries]) => (
                <div key={dia}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1 capitalize">
                    {diaLabel(dia)}
                    <span className="ml-2 font-normal normal-case">
                      · {fmtEuro(dayEntries.reduce((s, e) => s + e.totalCost, 0))}
                      · {fmtNumber(dayEntries.reduce((s, e) => s + e.liters, 0))} L
                    </span>
                  </p>
                  <div className="bg-card rounded-2xl border border-border divide-y divide-border overflow-hidden">
                    {dayEntries.map(e => (
                      <Link
                        key={e.id}
                        to={`/combustivel/abastecimento/${e.id}/editar`}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/40 active:bg-accent/60 transition-colors"
                      >
                        <div className="min-w-0 flex items-center gap-3">
                          {e.photoUrl ? (
                            <img
                              src={e.photoUrl}
                              alt="Foto do abastecimento"
                              loading="lazy"
                              className="w-10 h-10 rounded-lg object-cover border border-border shrink-0 bg-muted"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                              <Fuel className="w-4 h-4 text-primary" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">
                              {e.vehicleName ?? '—'}
                              {e.vehicleCode && <span className="text-xs font-normal text-muted-foreground ml-1">{e.vehicleCode}</span>}
                            </p>
                            <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
                              <span>{fmtNumber(e.liters)} L · {fmtEuro(e.pricePerLiter)}/L</span>
                              {e.obraName && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{e.obraName}</span>}
                              {e.location && <span>{e.location}</span>}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold">{fmtEuro(e.totalCost)}</p>
                          {e.responsible && <p className="text-xs text-muted-foreground">{e.responsible}</p>}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Viaturas & Máquinas ────────────────────────── */}
      {tab === 'veiculos' && (
        vLoading ? (
          <SkeletonList rows={4} cols={3} />
        ) : vehicles.length === 0 ? (
          <EmptyState icon={Truck} title="Sem viaturas registadas" description="Adicione as viaturas e máquinas da empresa para poder registar abastecimentos." />
        ) : (
          <>
            <div className="flex items-start gap-3 p-3.5 bg-primary/5 border border-primary/15 rounded-xl text-sm">
              <QrCode className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <p className="text-muted-foreground">
                Clique em <strong className="text-foreground">Imprimir QR</strong> em cada viatura, imprima e cole no interior.
                O motorista lê o QR code, entra com a sua conta e o pedido abre com a viatura já escolhida.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {vehicles.map(v => (
                <div key={v.id} className="bg-card rounded-2xl border border-border p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{v.name} <span className="text-xs text-muted-foreground font-normal">{v.code}</span></p>
                      <p className="text-xs text-muted-foreground mt-0.5">{getVehicleTypeLabel(v.type)} · {getFuelTypeLabel(v.fuelType)}</p>
                      {v.identification && <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><Gauge className="w-3 h-3" /> {v.identification}</p>}
                    </div>
                    {podeCombustivel && (
                      <button onClick={() => navigate(`/combustivel/veiculo/${v.id}/editar`)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors shrink-0">
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => abrirQR(v.id, v.name, v.code ?? '')}
                    className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-accent transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" /> Imprimir QR
                  </button>
                </div>
              ))}
            </div>
          </>
        )
      )}

      {/* ── Análise por Viatura ────────────────────────── */}
      {tab === 'analise' && (
        <Link to="/combustivel/relatorio"
          className="flex items-center justify-between gap-3 p-4 bg-primary/5 border border-primary/20 rounded-2xl hover:bg-primary/10 transition-colors">
          <span className="text-sm">
            <strong className="text-primary">Relatório avançado</strong>
            <span className="text-muted-foreground"> — por semana, mês, viatura e motorista, com a análise automática.</span>
          </span>
          <ArrowRight className="w-4 h-4 text-primary shrink-0" />
        </Link>
      )}
      {tab === 'analise' && (
        aLoading ? (
          <SkeletonList rows={3} cols={4} />
        ) : porViatura.length === 0 ? (
          <EmptyState icon={BarChart2} title="Sem dados para análise" description="Registe abastecimentos para ver estatísticas por viatura." />
        ) : (
          <div className="space-y-4">
            {/* Gráfico de barras — custo por viatura */}
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-sm">Custo por Viatura</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {periodoTipo === 'mes' ? mesLabel(mesRef) : 'Todos os períodos'}
                </p>
              </div>
              <div className="p-4">
                <ResponsiveContainer width="100%" height={Math.max(180, porViatura.length * 44)}>
                  <BarChart
                    data={porViatura.map(v => ({ name: v.code || v.name.split(' ')[0], custo: Math.round(v.custo * 100) / 100 }))}
                    layout="vertical"
                    margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false}
                      tickFormatter={v => `${fmtEuro(v)}`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={60} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '10px', fontSize: 12 }}
                      formatter={(v: number) => [fmtEuro(v), 'Custo']}
                    />
                    <Bar dataKey="custo" fill="#3b82f6" radius={[0, 6, 6, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tabela de estatísticas */}
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-sm">Estatísticas Detalhadas</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      {['Viatura', 'Abast.', 'Litros', 'Custo', '€/L médio', 'L/100km'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {porViatura.map(v => (
                      <tr key={v.name} className="hover:bg-accent/40 transition-colors">
                        <td className="px-4 py-3 font-semibold">
                          {v.name}
                          {v.code && <span className="ml-1.5 text-xs text-muted-foreground font-normal">{v.code}</span>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{v.count}</td>
                        <td className="px-4 py-3 font-medium">{fmtNumber(v.litros)} L</td>
                        <td className="px-4 py-3 font-bold">{fmtEuro(v.custo)}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {v.litros > 0 ? fmtEuro(v.custo / v.litros) : '—'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {v.lper100 != null ? `${fmtNumber(v.lper100)} L` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      )}

      {/* ── Pendentes ──────────────────────────────────── */}
      {/* Fora do ternário de loading: o polling de pendentes não pode desmontar o corte de emergência */}
      {tab === 'pendentes' && podeCombustivel && <BombaPolo2Card />}
      {tab === 'pendentes' && <ListaPedidos veTodos />}
    </div>
  );
}
