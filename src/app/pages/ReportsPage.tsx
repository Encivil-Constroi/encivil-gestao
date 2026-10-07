import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router'
import { createPortal } from 'react-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts'
import {
  BarChart3, TrendingUp, TrendingDown, ArrowUpCircle, ArrowDownCircle,
  AlertTriangle, Printer, X, FileText, Wrench, Boxes, Building2, Fuel, Droplet, Share2,
  LayoutDashboard, HardHat, Truck, Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { EnviarWhatsAppDialog } from '../components/EnviarWhatsAppDialog'
import { supabase } from '@/integrations/supabase/client'
import { listarMovimentos } from '@/features/movimentos/services/movimentosService'
import { listarProdutos } from '@/features/produtos/services/produtosService'
import { listarFerramentas } from '@/features/ferramentas/services/ferramentasService'
import { listarEmprestimos } from '@/features/ferramentas/services/emprestimosService'
import { listarAbastecimentos } from '@/features/combustivel/services/abastecimentosService'
import { listarVeiculos } from '@/features/combustivel/services/veiculosService'
import { useRole } from '@/features/auth/useRole'
import { getUnitLabel, getToolCategoryLabel } from '../data/mockData'
import { fmtEuro, fmtNumber } from '../lib/format'
import { PRINT, CabecalhoImpresso, RodapeImpresso, estiloPaginaImpressa } from '../components/print'
import { ToolStatusBadge } from '../components/ToolStatusBadge'
import { getPeriodConfig, diaLisboa, type Period } from '../lib/relatorios/periodo'
import { calcTrend } from '../lib/relatorios/tendencia'
import { KpiCard } from './relatorios/KpiCard'
import { VisaoGeralSection } from './relatorios/VisaoGeralSection'
import { ObrasSection } from './relatorios/ObrasSection'
import { SubempreitadasSection } from './relatorios/SubempreitadasSection'
import { FrotaSection } from './relatorios/FrotaSection'
import { PessoasSection } from './relatorios/PessoasSection'
import type { Movement, Product, Tool, ToolLoan } from '../types'

const fmt = (d: Date) => d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })

/* ─── Tooltip ───────────────────────────────────────────────────── */

const ChartTooltip = ({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2 shadow-lg text-xs">
      {label && <p className="font-semibold text-foreground mb-1.5">{label}</p>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-bold text-foreground">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

/* ─── PRINT REPORT ──────────────────────────────────────────────── */

type PrintData = {
  current:    Movement[]
  previous:   Movement[]
  products:   Product[]
  period:     Period
  periodLabel: string
  prevLabel:  string
  activityData: Array<{ sortKey: string; label: string; Entradas: number; Saídas: number }>
  topProducts:  Array<{ name: string; qty: number }>
  stockHealth:  Array<{ name: string; value: number; color: string }>
  biggestExit:  Movement | null
}

function PrintReport({ data, onClose }: { data: PrintData; onClose: () => void }) {
  /* Injeta CSS de impressão — esconde tudo menos o relatório */
  useEffect(() => {
    const s = document.createElement('style')
    s.id = 'encivil-print-css'
    s.textContent = `
      ${estiloPaginaImpressa('encivil-print-root')}
      @media print {
        body > *:not(#encivil-print-root) { display: none !important; }
        #encivil-print-root { display: block !important; position: static !important; overflow: visible !important; }
        .page-break { page-break-before: always; }
      }
    `
    document.head.appendChild(s)
    return () => { document.getElementById('encivil-print-css')?.remove() }
  }, [])

  const {
    current, previous, products, periodLabel,
    activityData, topProducts, stockHealth, biggestExit,
  } = data

  const currEntries = current.filter(m => m.type === 'entrada').length
  const currExits   = current.filter(m => m.type === 'saida').length
  const prevEntries = previous.filter(m => m.type === 'entrada').length
  const prevExits   = previous.filter(m => m.type === 'saida').length
  const trendTotal   = calcTrend(current.length,  previous.length)
  const trendEntries = calcTrend(currEntries, prevEntries)
  const trendExits   = calcTrend(currExits,   prevExits)
  const lowCount     = products.filter(p => p.status !== 'normal').length

  const GREEN  = '#16a34a'
  const RED    = '#dc2626'
  const AMBER  = '#f59e0b'

  const sectionTitle = (text: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <div style={{ width: 4, height: 20, background: PRINT.MARCA, borderRadius: 2, flexShrink: 0 }} />
      <span style={{ fontWeight: 700, fontSize: 13, color: PRINT.MARCA, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {text}
      </span>
    </div>
  )

  const trendBadge = (t: ReturnType<typeof calcTrend>) => {
    if (!t) return <span style={{ color: PRINT.SUAVE, fontSize: 11 }}>sem dados anteriores</span>
    const color = t.dir === 'up' ? GREEN : t.dir === 'down' ? RED : PRINT.SUAVE
    const arrow = t.dir === 'up' ? '▲' : t.dir === 'down' ? '▼' : '●'
    return (
      <span style={{ color, fontSize: 11, fontWeight: 700 }}>
        {arrow} {t.pct}% vs período anterior
      </span>
    )
  }

  return createPortal(
    <div
      id="encivil-print-root"
      style={{ position: 'fixed', inset: 0, background: 'white', color: PRINT.TINTA, fontFamily: PRINT.FONTE, zIndex: 9999, overflowY: 'auto' }}
    >
      {/* ── Barra de controlo (oculta na impressão) ────────── */}
      <div
        className="no-print"
        style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: 'var(--card)', borderBottom: `1px solid var(--border)`,
          padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText style={{ width: 16, height: 16, color: 'var(--foreground)' }} />
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--foreground)' }}>
            Pré-visualização · Relatório Executivo ENCIVIL
          </span>
          <span style={{ fontSize: 12, color: 'var(--muted-foreground)', marginLeft: 8 }}>
            {periodLabel}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
              border: `1px solid var(--border)`, borderRadius: 8, fontSize: 13,
              background: 'var(--card)', cursor: 'pointer', color: 'var(--foreground)',
            }}
          >
            <X style={{ width: 14, height: 14 }} /> Fechar
          </button>
          <button
            onClick={() => window.print()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px',
              background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', borderRadius: 8,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Printer style={{ width: 14, height: 14 }} /> Imprimir / Salvar PDF
          </button>
        </div>
      </div>

      {/* ── Documento A4 ────────────────────────────────────── */}
      <div style={{ maxWidth: 794, margin: '0 auto', background: 'white', padding: '0 0 40px' }}>

        {/* ── Cabeçalho do documento ───────────────────── */}
        <div style={{ padding: '24px 32px 0' }}>
          <CabecalhoImpresso titulo="Relatório Executivo de Armazém" subtitulo={periodLabel} />
          <div style={{ marginTop: 14, display: 'flex', gap: 28, fontSize: 12, color: PRINT.SUAVE }}>
            <span>Movimentos: <strong>{current.length}</strong></span>
            <span>Entradas: <strong style={{ color: '#16a34a' }}>{currEntries}</strong></span>
            <span>Saídas: <strong style={{ color: '#dc2626' }}>{currExits}</strong></span>
            <span>Produtos em alerta: <strong style={{ color: '#b45309' }}>{lowCount}</strong></span>
          </div>
        </div>
        <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 32 }}>

          {/* ── Secção 1: KPIs ────────────────────────── */}
          <div>
            {sectionTitle('Indicadores Executivos')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'Total de Movimentos', value: current.length,  color: PRINT.MARCA,  trend: trendTotal   },
                { label: 'Entradas no Período',  value: currEntries,     color: GREEN, trend: trendEntries },
                { label: 'Saídas no Período',    value: currExits,       color: RED,   trend: trendExits   },
                { label: 'Produtos em Alerta',   value: lowCount,        color: AMBER, trend: null         },
              ].map(k => (
                <div key={k.label} style={{ border: `1px solid ${PRINT.LINHA}`, borderRadius: 10, padding: '14px 16px', background: PRINT.FUNDO }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: k.color, lineHeight: 1 }}>{k.value}</div>
                  <div style={{ fontSize: 11, color: PRINT.SUAVE, marginTop: 6, lineHeight: 1.3, fontWeight: 500 }}>{k.label}</div>
                  <div style={{ marginTop: 8 }}>{trendBadge(k.trend)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Secção 2: Atividade diária ─────────────── */}
          <div>
            {sectionTitle(`Atividade ${data.period === 'ano' ? 'Mensal' : 'Diária'} — Entradas e Saídas`)}
            {activityData.length === 0 ? (
              <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: PRINT.FUNDO, borderRadius: 10, border: `1px solid ${PRINT.LINHA}`, color: PRINT.SUAVE, fontSize: 13 }}>
                Sem movimentos no período selecionado
              </div>
            ) : (
              <div style={{ border: `1px solid ${PRINT.LINHA}`, borderRadius: 10, padding: '16px 8px 8px', background: 'white' }}>
                <LineChart width={698} height={220} data={activityData} margin={{ top: 5, right: 16, left: -16, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={PRINT.LINHA} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: PRINT.SUAVE }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: PRINT.SUAVE }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${PRINT.LINHA}` }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Line type="monotone" dataKey="Entradas" stroke={GREEN} strokeWidth={2.5} dot={{ r: 3, fill: GREEN }} />
                  <Line type="monotone" dataKey="Saídas"   stroke={RED}   strokeWidth={2.5} dot={{ r: 3, fill: RED }}   />
                </LineChart>
              </div>
            )}
          </div>

          {/* ── Secção 3: Top produtos + Saúde do stock ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 20 }}>

            {/* Top produtos */}
            <div>
              {sectionTitle('Top Produtos Consumidos')}
              {topProducts.length === 0 ? (
                <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: PRINT.FUNDO, borderRadius: 10, border: `1px solid ${PRINT.LINHA}`, color: PRINT.SUAVE, fontSize: 13 }}>
                  Sem saídas no período
                </div>
              ) : (
                <div style={{ border: `1px solid ${PRINT.LINHA}`, borderRadius: 10, padding: '16px 8px 8px', background: 'white' }}>
                  <BarChart width={400} height={200} data={topProducts} layout="vertical" margin={{ top: 0, right: 16, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={PRINT.LINHA} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: PRINT.SUAVE }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis dataKey="name" type="category" width={105} tick={{ fontSize: 11, fill: '#1e293b' }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${PRINT.LINHA}` }} />
                    <Bar dataKey="qty" name="Quantidade" fill={PRINT.MARCA} radius={[0, 5, 5, 0]} maxBarSize={22} />
                  </BarChart>
                </div>
              )}
            </div>

            {/* Saúde do stock */}
            <div>
              {sectionTitle('Saúde do Stock')}
              <div style={{ border: `1px solid ${PRINT.LINHA}`, borderRadius: 10, padding: '16px', background: 'white' }}>
                {stockHealth.length > 0 ? (
                  <>
                    <PieChart width={260} height={160}>
                      <Pie data={stockHealth} cx="50%" cy="50%" innerRadius={42} outerRadius={70} dataKey="value" paddingAngle={3}>
                        {stockHealth.map((e, i) => <Cell key={i} fill={e.name === 'Normal' ? GREEN : e.name === 'Stock Baixo' ? AMBER : RED} />)}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${PRINT.LINHA}` }} />
                    </PieChart>
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {stockHealth.map(s => (
                        <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.name === 'Normal' ? GREEN : s.name === 'Stock Baixo' ? AMBER : RED, display: 'inline-block', flexShrink: 0 }} />
                            <span style={{ color: PRINT.SUAVE }}>{s.name}</span>
                          </div>
                          <span style={{ fontWeight: 700, color: '#1e293b' }}>{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: PRINT.SUAVE, fontSize: 13 }}>
                    Sem produtos
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Secção 4: Resumo executivo ───────────────── */}
          <div>
            {sectionTitle('Resumo Executivo')}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: PRINT.MARCA, color: 'white' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, fontSize: 12 }}>Indicador</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, fontSize: 12 }}>Valor</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, fontSize: 12 }}>Tendência</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Total de movimentos',        value: String(current.length),   trend: trendTotal   },
                  { label: 'Entradas no período',         value: String(currEntries),      trend: trendEntries },
                  { label: 'Saídas no período',           value: String(currExits),        trend: trendExits   },
                  { label: 'Produtos cadastrados',        value: String(products.length),  trend: null },
                  { label: 'Produtos com stock baixo',    value: String(products.filter(p => p.status === 'baixo').length), trend: null },
                  { label: 'Produtos sem stock',          value: String(products.filter(p => p.status === 'sem-stock').length), trend: null },
                  {
                    label: 'Taxa de saídas',
                    value: current.length > 0 ? `${Math.round((currExits / current.length) * 100)}%` : '—',
                    trend: null,
                  },
                  {
                    label: 'Maior saída do período',
                    value: biggestExit
                      ? `${biggestExit.productName} · ${biggestExit.quantity} ${getUnitLabel(biggestExit.unit)}`
                      : '—',
                    trend: null,
                  },
                ].map((row, i) => (
                  <tr key={row.label} style={{ background: i % 2 === 0 ? 'white' : PRINT.FUNDO }}>
                    <td style={{ padding: '10px 16px', color: '#374151', borderBottom: `1px solid ${PRINT.LINHA}` }}>
                      {row.label}
                    </td>
                    <td style={{ padding: '10px 16px', fontWeight: 700, color: '#1e293b', textAlign: 'right', borderBottom: `1px solid ${PRINT.LINHA}` }}>
                      {row.value}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', borderBottom: `1px solid ${PRINT.LINHA}` }}>
                      {trendBadge(row.trend)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Secção 5: Top 10 movimentos do período ───── */}
          {current.length > 0 && (
            <div>
              {sectionTitle('Últimos Movimentos do Período')}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: PRINT.MARCA, color: 'white' }}>
                    {['Data', 'Produto', 'Tipo', 'Quantidade', 'Responsável', 'Destino'].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {current.slice(0, 15).map((m, i) => (
                    <tr key={m.id} style={{ background: i % 2 === 0 ? 'white' : PRINT.FUNDO }}>
                      <td style={{ padding: '8px 12px', color: PRINT.SUAVE, borderBottom: `1px solid ${PRINT.LINHA}`, whiteSpace: 'nowrap' }}>
                        {fmt(m.date)}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#1e293b', borderBottom: `1px solid ${PRINT.LINHA}` }}>
                        {m.productName}
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${PRINT.LINHA}` }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                          background: m.type === 'entrada' ? '#dcfce7' : '#fee2e2',
                          color: m.type === 'entrada' ? GREEN : RED,
                        }}>
                          {m.type === 'entrada' ? 'Entrada' : 'Saída'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1e293b', borderBottom: `1px solid ${PRINT.LINHA}` }}>
                        {m.quantity} {getUnitLabel(m.unit)}
                      </td>
                      <td style={{ padding: '8px 12px', color: PRINT.SUAVE, borderBottom: `1px solid ${PRINT.LINHA}` }}>
                        {m.responsible}
                      </td>
                      <td style={{ padding: '8px 12px', color: PRINT.SUAVE, borderBottom: `1px solid ${PRINT.LINHA}` }}>
                        {m.destination ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {current.length > 15 && (
                <p style={{ fontSize: 11, color: PRINT.SUAVE, marginTop: 6, textAlign: 'right' }}>
                  A mostrar os 15 movimentos mais recentes de {current.length} total
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Rodapé do documento ──────────────────────── */}
        <div style={{ padding: '0 32px' }}>
          <RodapeImpresso />
        </div>
      </div>
    </div>,
    document.body
  )
}

/* ─── Relatório de Ferramentas ──────────────────────────────────── */

function useToolsActivityData(loans: ToolLoan[], period: Period) {
  return useMemo(() => {
    const byYear = period === 'ano'
    const buckets = new Map<string, { sortKey: string; label: string; Empréstimos: number }>()
    loans.forEach(l => {
      const sortKey = byYear
        ? `${l.loanDate.getFullYear()}-${String(l.loanDate.getMonth() + 1).padStart(2, '0')}`
        : diaLisboa(l.loanDate)
      const label = byYear
        ? l.loanDate.toLocaleDateString('pt-PT', { month: 'short', year: '2-digit' })
        : l.loanDate.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })
      const existing = buckets.get(sortKey) ?? { sortKey, label, Empréstimos: 0 }
      existing.Empréstimos++
      buckets.set(sortKey, existing)
    })
    return Array.from(buckets.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey))
  }, [loans, period])
}

function useTopFuncionarios(loans: ToolLoan[]) {
  return useMemo(() => {
    const counts = new Map<string, number>()
    loans.forEach(l => counts.set(l.employeeName, (counts.get(l.employeeName) ?? 0) + 1))
    return Array.from(counts.entries())
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5)
  }, [loans])
}

type ToolsReportData = {
  loading: boolean
  tools: Tool[]
  loansCurrent: ToolLoan[]
  loansPrevious: ToolLoan[]
  loansActive: ToolLoan[]
  period: Period
  periodLabel: string
  prevLabel: string
}

function ToolsReportSection({ loading, tools, loansCurrent, loansPrevious, loansActive, period }: ToolsReportData) {
  const disponiveis = tools.filter(t => t.status === 'disponivel').length
  const emprestadas = tools.filter(t => t.status === 'emprestada').length
  const manutencao  = tools.filter(t => t.status === 'manutencao').length

  const atrasados = loansActive.filter(l => l.expectedReturnDate && l.expectedReturnDate.getTime() < Date.now())
  const devolvidosPeriodo = loansCurrent.filter(l => l.status === 'devolvido').length
  const devolvidosPeriodoPrev = loansPrevious.filter(l => l.status === 'devolvido').length

  const trendEmprestimos = calcTrend(loansCurrent.length, loansPrevious.length)
  const trendDevolvidos  = calcTrend(devolvidosPeriodo, devolvidosPeriodoPrev)

  const activityData = useToolsActivityData(loansCurrent, period)
  const topFuncionarios = useTopFuncionarios(loansCurrent)

  return (
    <div className="space-y-6 pb-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <KpiCard label="Empréstimos no Período" value={loansCurrent.length} icon={Wrench}        iconBg="bg-primary/10"     valueColor="text-primary"     trend={trendEmprestimos} loading={loading} />
        <KpiCard label="Devolvidos no Período"   value={devolvidosPeriodo}   icon={ArrowDownCircle} iconBg="bg-success/10"   valueColor="text-success"     trend={trendDevolvidos}  loading={loading} />
        <KpiCard label="Emprestadas Agora"       value={emprestadas}         icon={ArrowUpCircle} iconBg="bg-warning/10"     valueColor="text-warning"     trend={null} loading={loading} />
        <KpiCard label="Em Atraso"               value={atrasados.length}    icon={AlertTriangle} iconBg="bg-destructive/10" valueColor="text-destructive" trend={null} loading={loading} />
      </div>

      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="mb-5">
          <h2 className="font-semibold text-base">Empréstimos {period === 'ano' ? 'Mensais' : 'Diários'}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Empréstimos registados ao longo do período</p>
        </div>
        {loading ? (
          <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">A carregar…</div>
        ) : activityData.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center gap-2">
            <TrendingUp className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Sem empréstimos no período selecionado</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={activityData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--chart-text)' }} interval="preserveStartEnd" tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--chart-text)' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
              <Line type="monotone" dataKey="Empréstimos" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--chart-1)' }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-6">
        <div className="lg:col-span-3 bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-muted/30">
            <h2 className="font-semibold text-base">Ferramentas em Atraso</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Empréstimos ativos com devolução prevista já passada</p>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">A carregar…</div>
          ) : atrasados.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma ferramenta em atraso 🎉</div>
          ) : (
            <div className="divide-y divide-border">
              {atrasados.map(l => (
                <div key={l.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{l.toolCode} · {l.toolName}</p>
                    <p className="text-xs text-muted-foreground">{l.employeeName}</p>
                  </div>
                  <span className="text-xs font-semibold text-destructive">
                    desde {l.expectedReturnDate?.toLocaleDateString('pt-PT')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-muted/30">
            <h2 className="font-semibold text-base">Top Funcionários</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Mais empréstimos no período</p>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">A carregar…</div>
          ) : topFuncionarios.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Sem dados no período</div>
          ) : (
            <div className="divide-y divide-border">
              {topFuncionarios.map(f => (
                <div key={f.name} className="px-5 py-3 flex items-center justify-between">
                  <span className="text-sm">{f.name}</span>
                  <span className="text-sm font-bold">{f.qty}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-muted/30">
          <h2 className="font-semibold text-base">Resumo do Inventário</h2>
        </div>
        <div className="divide-y divide-border">
          {[
            { label: 'Disponíveis',    value: disponiveis },
            { label: 'Emprestadas',    value: emprestadas },
            { label: 'Em Manutenção',  value: manutencao },
            { label: 'Total de ferramentas', value: tools.length },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between px-5 py-3.5">
              <span className="text-sm text-muted-foreground">{row.label}</span>
              <span className="text-sm font-semibold">{loading ? '…' : row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {!loading && tools.length > 0 && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-muted/30">
            <h2 className="font-semibold text-base">Inventário Completo</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  {['Código', 'Ferramenta', 'Categoria', 'Estado'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tools.map(t => (
                  <tr key={t.id}>
                    <td className="px-5 py-3 text-sm font-mono text-muted-foreground">{t.code}</td>
                    <td className="px-5 py-3 text-sm font-medium">{t.name}</td>
                    <td className="px-5 py-3 text-sm text-muted-foreground">{getToolCategoryLabel(t.category)}</td>
                    <td className="px-5 py-3 text-sm"><ToolStatusBadge status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── PRINT REPORT — Ferramentas ─────────────────────────────────── */

function ToolsPrintReport({ data, onClose }: { data: ToolsReportData; onClose: () => void }) {
  useEffect(() => {
    const s = document.createElement('style')
    s.id = 'encivil-print-css-ferramentas'
    s.textContent = `
      ${estiloPaginaImpressa('encivil-print-root-ferramentas')}
      @media print {
        body > *:not(#encivil-print-root-ferramentas) { display: none !important; }
        #encivil-print-root-ferramentas { display: block !important; position: static !important; overflow: visible !important; }
      }
    `
    document.head.appendChild(s)
    return () => { document.getElementById('encivil-print-css-ferramentas')?.remove() }
  }, [])

  const { tools, loansCurrent, loansPrevious, loansActive, periodLabel } = data

  const disponiveis = tools.filter(t => t.status === 'disponivel').length
  const emprestadas = tools.filter(t => t.status === 'emprestada').length
  const manutencao  = tools.filter(t => t.status === 'manutencao').length
  const atrasados   = loansActive.filter(l => l.expectedReturnDate && l.expectedReturnDate.getTime() < Date.now())
  const devolvidosPeriodo     = loansCurrent.filter(l => l.status === 'devolvido').length
  const devolvidosPeriodoPrev = loansPrevious.filter(l => l.status === 'devolvido').length
  const trendEmprestimos = calcTrend(loansCurrent.length, loansPrevious.length)
  const trendDevolvidos  = calcTrend(devolvidosPeriodo, devolvidosPeriodoPrev)
  const activityData = useToolsActivityData(loansCurrent, data.period)
  const topFuncionarios = useTopFuncionarios(loansCurrent)

  const GREEN  = '#16a34a'
  const RED    = '#dc2626'
  const AMBER  = '#f59e0b'

  const sectionTitle = (text: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <div style={{ width: 4, height: 20, background: PRINT.MARCA, borderRadius: 2, flexShrink: 0 }} />
      <span style={{ fontWeight: 700, fontSize: 13, color: PRINT.MARCA, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {text}
      </span>
    </div>
  )

  const trendBadge = (t: ReturnType<typeof calcTrend>) => {
    if (!t) return <span style={{ color: PRINT.SUAVE, fontSize: 11 }}>sem dados anteriores</span>
    const color = t.dir === 'up' ? GREEN : t.dir === 'down' ? RED : PRINT.SUAVE
    const arrow = t.dir === 'up' ? '▲' : t.dir === 'down' ? '▼' : '●'
    return (
      <span style={{ color, fontSize: 11, fontWeight: 700 }}>
        {arrow} {t.pct}% vs período anterior
      </span>
    )
  }

  return createPortal(
    <div
      id="encivil-print-root-ferramentas"
      style={{ position: 'fixed', inset: 0, background: 'white', color: PRINT.TINTA, fontFamily: PRINT.FONTE, zIndex: 9999, overflowY: 'auto' }}
    >
      <div
        className="no-print"
        style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: 'var(--card)', borderBottom: `1px solid var(--border)`,
          padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText style={{ width: 16, height: 16, color: 'var(--foreground)' }} />
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--foreground)' }}>
            Pré-visualização · Relatório de Ferramentas ENCIVIL
          </span>
          <span style={{ fontSize: 12, color: 'var(--muted-foreground)', marginLeft: 8 }}>{periodLabel}</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
              border: `1px solid var(--border)`, borderRadius: 8, fontSize: 13,
              background: 'var(--card)', cursor: 'pointer', color: 'var(--foreground)',
            }}
          >
            <X style={{ width: 14, height: 14 }} /> Fechar
          </button>
          <button
            onClick={() => window.print()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px',
              background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', borderRadius: 8,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Printer style={{ width: 14, height: 14 }} /> Imprimir / Salvar PDF
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 794, margin: '0 auto', background: 'white', padding: '0 0 40px' }}>

        <div style={{ padding: '24px 32px 0' }}>
          <CabecalhoImpresso titulo="Relatório de Ferramentas" subtitulo={periodLabel} />
          <div style={{ marginTop: 14, display: 'flex', gap: 28, fontSize: 12, color: PRINT.SUAVE }}>
            <span>Empréstimos: <strong>{loansCurrent.length}</strong></span>
            <span>Devolvidos: <strong style={{ color: '#16a34a' }}>{devolvidosPeriodo}</strong></span>
            <span>Emprestadas agora: <strong style={{ color: '#b45309' }}>{emprestadas}</strong></span>
            <span>Em atraso: <strong style={{ color: '#dc2626' }}>{atrasados.length}</strong></span>
          </div>
        </div>
        <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 32 }}>

          <div>
            {sectionTitle('Indicadores')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'Empréstimos no Período', value: loansCurrent.length, color: PRINT.MARCA,  trend: trendEmprestimos },
                { label: 'Devolvidos no Período',  value: devolvidosPeriodo,   color: GREEN, trend: trendDevolvidos  },
                { label: 'Emprestadas Agora',      value: emprestadas,         color: AMBER, trend: null             },
                { label: 'Em Atraso',              value: atrasados.length,    color: RED,   trend: null             },
              ].map(k => (
                <div key={k.label} style={{ border: `1px solid ${PRINT.LINHA}`, borderRadius: 10, padding: '14px 16px', background: PRINT.FUNDO }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: k.color, lineHeight: 1 }}>{k.value}</div>
                  <div style={{ fontSize: 11, color: PRINT.SUAVE, marginTop: 6, lineHeight: 1.3, fontWeight: 500 }}>{k.label}</div>
                  <div style={{ marginTop: 8 }}>{trendBadge(k.trend)}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            {sectionTitle(`Empréstimos ${data.period === 'ano' ? 'Mensais' : 'Diários'}`)}
            {activityData.length === 0 ? (
              <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: PRINT.FUNDO, borderRadius: 10, border: `1px solid ${PRINT.LINHA}`, color: PRINT.SUAVE, fontSize: 13 }}>
                Sem empréstimos no período selecionado
              </div>
            ) : (
              <div style={{ border: `1px solid ${PRINT.LINHA}`, borderRadius: 10, padding: '16px 8px 8px', background: 'white' }}>
                <LineChart width={698} height={220} data={activityData} margin={{ top: 5, right: 16, left: -16, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={PRINT.LINHA} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: PRINT.SUAVE }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: PRINT.SUAVE }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${PRINT.LINHA}` }} />
                  <Line type="monotone" dataKey="Empréstimos" stroke={PRINT.MARCA} strokeWidth={2.5} dot={{ r: 3, fill: PRINT.MARCA }} />
                </LineChart>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 20 }}>
            <div>
              {sectionTitle('Ferramentas em Atraso')}
              {atrasados.length === 0 ? (
                <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', background: PRINT.FUNDO, borderRadius: 10, border: `1px solid ${PRINT.LINHA}`, color: PRINT.SUAVE, fontSize: 13 }}>
                  Nenhuma ferramenta em atraso
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: PRINT.MARCA, color: 'white' }}>
                      {['Ferramenta', 'Funcionário', 'Em atraso desde'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {atrasados.map((l, i) => (
                      <tr key={l.id} style={{ background: i % 2 === 0 ? 'white' : PRINT.FUNDO }}>
                        <td style={{ padding: '8px 12px', borderBottom: `1px solid ${PRINT.LINHA}` }}>{l.toolCode} · {l.toolName}</td>
                        <td style={{ padding: '8px 12px', color: PRINT.SUAVE, borderBottom: `1px solid ${PRINT.LINHA}` }}>{l.employeeName}</td>
                        <td style={{ padding: '8px 12px', color: RED, fontWeight: 600, borderBottom: `1px solid ${PRINT.LINHA}` }}>
                          {l.expectedReturnDate?.toLocaleDateString('pt-PT')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div>
              {sectionTitle('Top Funcionários')}
              <div style={{ border: `1px solid ${PRINT.LINHA}`, borderRadius: 10, padding: '16px', background: 'white' }}>
                {topFuncionarios.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {topFuncionarios.map(f => (
                      <div key={f.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: PRINT.SUAVE }}>{f.name}</span>
                        <span style={{ fontWeight: 700, color: '#1e293b' }}>{f.qty}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: PRINT.SUAVE, fontSize: 13 }}>
                    Sem dados no período
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            {sectionTitle('Resumo Executivo')}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: PRINT.MARCA, color: 'white' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, fontSize: 12 }}>Indicador</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, fontSize: 12 }}>Valor</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, fontSize: 12 }}>Tendência</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Empréstimos no período', value: String(loansCurrent.length), trend: trendEmprestimos },
                  { label: 'Devolvidos no período',  value: String(devolvidosPeriodo),   trend: trendDevolvidos  },
                  { label: 'Disponíveis agora',      value: String(disponiveis),         trend: null },
                  { label: 'Emprestadas agora',      value: String(emprestadas),         trend: null },
                  { label: 'Em manutenção',          value: String(manutencao),          trend: null },
                  { label: 'Total de ferramentas',   value: String(tools.length),        trend: null },
                ].map((row, i) => (
                  <tr key={row.label} style={{ background: i % 2 === 0 ? 'white' : PRINT.FUNDO }}>
                    <td style={{ padding: '10px 16px', color: '#374151', borderBottom: `1px solid ${PRINT.LINHA}` }}>{row.label}</td>
                    <td style={{ padding: '10px 16px', fontWeight: 700, color: '#1e293b', textAlign: 'right', borderBottom: `1px solid ${PRINT.LINHA}` }}>{row.value}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', borderBottom: `1px solid ${PRINT.LINHA}` }}>{trendBadge(row.trend)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ padding: '0 32px' }}>
          <RodapeImpresso />
        </div>
      </div>
    </div>,
    document.body
  )
}

/* ─── Relatório de Combustível ──────────────────────────────────── */

type VeiculoConsumo = {
  id: string
  nome: string
  codigo: string
  numAbast: number
  litros: number
  custo: number
  precoMedio: number
}

type CombustivelReportData = {
  loading: boolean
  linhas: VeiculoConsumo[]
}

function CombustivelReportSection({ loading, linhas }: CombustivelReportData) {
  const totalCusto = linhas.reduce((s, l) => s + l.custo, 0)
  const totalLitros = linhas.reduce((s, l) => s + l.litros, 0)
  const totalAbast = linhas.reduce((s, l) => s + l.numAbast, 0)
  const precoMedio = totalLitros > 0 ? totalCusto / totalLitros : 0

  return (
    <div className="space-y-6 pb-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <KpiCard label="Total Gasto" value={fmtEuro(totalCusto)} icon={Fuel} iconBg="bg-primary/10" valueColor="text-primary" trend={null} loading={loading} />
        <KpiCard label="Litros" value={`${fmtNumber(totalLitros)} L`} icon={Droplet} iconBg="bg-primary/10" valueColor="text-foreground" trend={null} loading={loading} />
        <KpiCard label="Abastecimentos" value={totalAbast} icon={BarChart3} iconBg="bg-success/10" valueColor="text-success" trend={null} loading={loading} />
        <KpiCard label="Preço Médio/L" value={fmtEuro(precoMedio)} icon={TrendingUp} iconBg="bg-warning/10" valueColor="text-warning" trend={null} loading={loading} />
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-muted/30">
          <h2 className="font-semibold text-base">Consumo por Viatura</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Litros, custo e preço médio por viatura/máquina</p>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">A carregar…</div>
        ) : linhas.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Sem abastecimentos registados.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {['Viatura', 'Abast.', 'Litros', 'Custo', '€/L'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {linhas.map(l => (
                  <tr key={l.id} className="hover:bg-accent/40 transition-colors">
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{l.nome} <span className="text-xs text-muted-foreground">{l.codigo}</span></td>
                    <td className="px-4 py-3 text-muted-foreground">{l.numAbast}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{fmtNumber(l.litros)} L</td>
                    <td className="px-4 py-3 whitespace-nowrap font-semibold">{fmtEuro(l.custo)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{fmtEuro(l.precoMedio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function CombustivelPrintReport({ data, onClose }: { data: CombustivelReportData; onClose: () => void }) {
  useEffect(() => {
    const s = document.createElement('style')
    s.id = 'encivil-print-css-comb'
    s.textContent = `
      ${estiloPaginaImpressa('encivil-print-root-comb')}
      @media print {
        body > *:not(#encivil-print-root-comb) { display: none !important; }
        #encivil-print-root-comb { display: block !important; position: static !important; overflow: visible !important; }
      }
    `
    document.head.appendChild(s)
    return () => { document.getElementById('encivil-print-css-comb')?.remove() }
  }, [])

  const linhas = data.linhas
  const totalCusto = linhas.reduce((s, l) => s + l.custo, 0)
  const totalLitros = linhas.reduce((s, l) => s + l.litros, 0)
  const precoMedio = totalLitros > 0 ? totalCusto / totalLitros : 0

  return createPortal(
    <div id="encivil-print-root-comb" style={{ position: 'fixed', inset: 0, background: 'white', color: PRINT.TINTA, fontFamily: PRINT.FONTE, zIndex: 9999, overflowY: 'auto' }}>
      <div className="no-print" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--card)', borderBottom: `1px solid var(--border)`, padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText style={{ width: 16, height: 16, color: 'var(--foreground)' }} />
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--foreground)' }}>Pré-visualização · Relatório de Combustível ENCIVIL</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: `1px solid var(--border)`, borderRadius: 8, fontSize: 13, background: 'var(--card)', cursor: 'pointer', color: 'var(--foreground)' }}>
            <X style={{ width: 14, height: 14 }} /> Fechar
          </button>
          <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Printer style={{ width: 14, height: 14 }} /> Imprimir / Salvar PDF
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 794, margin: '0 auto', background: 'white', padding: '0 0 40px' }}>
        <div style={{ padding: '24px 32px 0' }}>
          <CabecalhoImpresso titulo="Relatório de Combustível" />
          <div style={{ marginTop: 14, display: 'flex', gap: 28, fontSize: 12, color: PRINT.SUAVE }}>
            <span>Total: <strong>{fmtEuro(totalCusto)}</strong></span>
            <span>Litros: <strong>{fmtNumber(totalLitros)} L</strong></span>
            <span>Preço médio: <strong style={{ color: '#b45309' }}>{fmtEuro(precoMedio)}/L</strong></span>
          </div>
        </div>
        <div style={{ padding: '28px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 4, height: 20, background: PRINT.MARCA, borderRadius: 2 }} />
            <span style={{ fontWeight: 700, fontSize: 13, color: PRINT.MARCA, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Consumo por Viatura</span>
          </div>
          {linhas.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: PRINT.SUAVE, fontSize: 13, background: PRINT.FUNDO, borderRadius: 10, border: `1px solid ${PRINT.LINHA}` }}>Sem abastecimentos.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: PRINT.MARCA, color: 'white' }}>
                  {['Viatura', 'Abast.', 'Litros', 'Custo', '€/L'].map((h, i) => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: i === 0 ? 'left' : 'right', fontWeight: 600, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={l.id} style={{ background: i % 2 === 0 ? 'white' : PRINT.FUNDO }}>
                    <td style={{ padding: '9px 12px', borderBottom: `1px solid ${PRINT.LINHA}` }}>{l.nome} ({l.codigo})</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', color: PRINT.SUAVE, borderBottom: `1px solid ${PRINT.LINHA}` }}>{l.numAbast}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', borderBottom: `1px solid ${PRINT.LINHA}` }}>{fmtNumber(l.litros)} L</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, borderBottom: `1px solid ${PRINT.LINHA}` }}>{fmtEuro(l.custo)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', color: PRINT.SUAVE, borderBottom: `1px solid ${PRINT.LINHA}` }}>{fmtEuro(l.precoMedio)}</td>
                  </tr>
                ))}
                <tr style={{ background: '#eef2ff', fontWeight: 700 }}>
                  <td style={{ padding: '10px 12px' }}>TOTAL</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{linhas.reduce((s, l) => s + l.numAbast, 0)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{fmtNumber(totalLitros)} L</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{fmtEuro(totalCusto)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{fmtEuro(precoMedio)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        <div style={{ padding: '0 32px' }}>
          <RodapeImpresso />
        </div>
      </div>
    </div>,
    document.body
  )
}

/* ─── Página principal ──────────────────────────────────────────── */

type ReportTipo = 'visao' | 'obras' | 'subempreitadas' | 'stock' | 'ferramentas' | 'frota' | 'combustivel' | 'pessoas'

export function ReportsPage() {
  const { role } = useRole()
  // Custos e RH só para admin/gestor (a segurança real é a RLS/RPC; isto evita mostrar separadores vazios ou de erro).
  const podeFinanceiro = role === 'admin' || role === 'gestor'
  const abas = [
    ...(podeFinanceiro ? [{ id: 'visao', label: 'Visão geral', icon: LayoutDashboard }] : []),
    ...(podeFinanceiro ? [{ id: 'obras', label: 'Obras', icon: Building2 }, { id: 'subempreitadas', label: 'Subempreitadas', icon: HardHat }] : []),
    { id: 'stock', label: 'Stock', icon: Boxes },
    { id: 'ferramentas', label: 'Ferramentas', icon: Wrench },
    ...(podeFinanceiro ? [{ id: 'frota', label: 'Frota', icon: Truck }] : []),
    { id: 'combustivel', label: 'Combustível', icon: Fuel },
    ...(podeFinanceiro ? [{ id: 'pessoas', label: 'Pessoas', icon: Users }] : []),
  ] as { id: ReportTipo; label: string; icon: React.ComponentType<{ className?: string }> }[]
  const [escolhido, setReportType] = useState<ReportTipo | null>(null)
  // Por omissão a Visão geral para a gestão; os restantes papéis abrem o Stock.
  const reportType: ReportTipo = escolhido && abas.some(a => a.id === escolhido) ? escolhido : abas[0].id
  const [period, setPeriod]   = useState<Period>('mes')
  const [loading, setLoading] = useState(true)
  const [current,  setCurrent]  = useState<Movement[]>([])
  const [previous, setPrevious] = useState<Movement[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [showPrint, setShowPrint] = useState(false)

  const [toolsPeriod, setToolsPeriod] = useState<Period>('mes')
  const [toolsLoading, setToolsLoading] = useState(true)
  const [tools, setTools] = useState<Tool[]>([])
  const [loansCurrent,  setLoansCurrent]  = useState<ToolLoan[]>([])
  const [loansPrevious, setLoansPrevious] = useState<ToolLoan[]>([])
  const [loansActive,   setLoansActive]   = useState<ToolLoan[]>([])
  const [showToolsPrint, setShowToolsPrint] = useState(false)

  const [combLoading, setCombLoading] = useState(true)
  const [combLinhas, setCombLinhas] = useState<VeiculoConsumo[]>([])
  const [showCombPrint, setShowCombPrint] = useState(false)

  const [sharingWA, setSharingWA] = useState(false)
  const [textoWA, setTextoWA] = useState<string | null>(null)

  const partilharSemanalWhatsApp = async () => {
    setSharingWA(true)
    try {
      const hoje = new Date()
      const diaSemana = hoje.getDay() === 0 ? 6 : hoje.getDay() - 1
      const inicio = new Date(hoje)
      inicio.setDate(hoje.getDate() - diaSemana)
      inicio.setHours(0, 0, 0, 0)
      const fim = new Date(inicio)
      fim.setDate(inicio.getDate() + 6)
      fim.setHours(23, 59, 59, 999)
      const isoInicio = diaLisboa(inicio)
      const isoFim    = diaLisboa(fim)
      const today     = new Date().toISOString().split('T')[0]
      const semanaLabel = `${inicio.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })} – ${fim.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })}`

      const [movRes, combRes, atrasoRes, stockRes] = await Promise.all([
        supabase.from('movimentos_stock').select('tipo').gte('created_at', inicio.toISOString()).lte('created_at', fim.toISOString()),
        supabase.from('comb_abastecimentos').select('litros, custo_total').gte('data', isoInicio).lte('data', isoFim),
        supabase.from('emprestimos_ferramentas').select('id').eq('estado', 'ativo').not('data_prevista_devolucao', 'is', null).lt('data_prevista_devolucao', today),
        supabase.from('produtos').select('stock_atual, stock_minimo').eq('ativo', true),
      ])

      if (movRes.error || combRes.error || atrasoRes.error || stockRes.error) {
        toast.error('Erro ao preparar dados para partilha.')
        return
      }

      type MovRow   = { tipo: string }
      type CombRow  = { litros: number; custo_total: number }
      type StockRow = { stock_atual: number; stock_minimo: number }

      const movs   = (movRes.data  ?? []) as unknown as MovRow[]
      const combs  = (combRes.data ?? []) as unknown as CombRow[]
      const stocks = (stockRes.data ?? []) as unknown as StockRow[]

      const entradas  = movs.filter(m => m.tipo === 'entrada').length
      const saidas    = movs.filter(m => m.tipo === 'saida').length
      const litros    = combs.reduce((s, c) => s + Number(c.litros),     0)
      const custo     = combs.reduce((s, c) => s + Number(c.custo_total), 0)
      const critico   = stocks.filter(p => p.stock_atual <= 0).length
      const baixo     = stocks.filter(p => p.stock_atual > 0 && p.stock_atual <= p.stock_minimo).length
      const atrasadas = (atrasoRes.data ?? []).length

      const txt = [
        `🏗️ *ENCIVIL — Relatório Semanal*`,
        `📅 Semana: ${semanaLabel}`,
        ``,
        `📦 *Armazém*`,
        `• ${entradas} entrada${entradas !== 1 ? 's' : ''} · ${saidas} saída${saidas !== 1 ? 's' : ''}`,
        ``,
        `⛽ *Combustível*`,
        `• ${combs.length} abastecimento${combs.length !== 1 ? 's' : ''} · ${fmtNumber(litros)} L · ${fmtEuro(custo)}`,
        ``,
        `🔧 *Ferramentas em atraso*`,
        `• ${atrasadas} ferramenta${atrasadas !== 1 ? 's' : ''} por devolver`,
        ``,
        `⚠️ *Stock*`,
        `• ${critico} sem stock · ${baixo} stock baixo`,
      ].join('\n')

      setTextoWA(txt)
    } catch {
      toast.error('Erro inesperado ao preparar partilha.')
    } finally {
      setSharingWA(false)
    }
  }

  useEffect(() => {
    if (reportType !== 'stock') return
    let cancelled = false
    setLoading(true)
    const { currFrom, prevFrom, prevTo } = getPeriodConfig(period)
    Promise.all([
      listarMovimentos({ dataInicio: currFrom }),
      listarMovimentos({ dataInicio: prevFrom, dataFim: prevTo }),
      listarProdutos(false),
    ])
      .then(([curr, prev, prods]) => {
        if (cancelled) return
        setCurrent(curr); setPrevious(prev); setProducts(prods)
      })
      .catch(() => { toast.error('Erro ao carregar movimentos') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [period, reportType])

  useEffect(() => {
    if (reportType !== 'ferramentas') return
    let cancelled = false
    setToolsLoading(true)
    const { currFrom, prevFrom, prevTo } = getPeriodConfig(toolsPeriod)
    Promise.all([
      listarFerramentas(false),
      listarEmprestimos({ dataInicio: currFrom }),
      listarEmprestimos({ dataInicio: prevFrom, dataFim: prevTo }),
      listarEmprestimos({ estado: 'ativo' }),
    ])
      .then(([t, curr, prev, active]) => {
        if (cancelled) return
        setTools(t); setLoansCurrent(curr); setLoansPrevious(prev); setLoansActive(active)
      })
      .catch(() => { toast.error('Erro ao carregar ferramentas') })
      .finally(() => { if (!cancelled) setToolsLoading(false) })
    return () => { cancelled = true }
  }, [toolsPeriod, reportType])

  useEffect(() => {
    if (reportType !== 'combustivel') return
    let cancelled = false
    setCombLoading(true)
    Promise.all([listarAbastecimentos(), listarVeiculos(false)])
      .then(([entries, veiculos]) => {
        if (cancelled) return
        const acc: Record<string, VeiculoConsumo> = {}
        veiculos.forEach(v => { acc[v.id] = { id: v.id, nome: v.name, codigo: v.code, numAbast: 0, litros: 0, custo: 0, precoMedio: 0 } })
        entries.forEach(e => {
          const row = acc[e.vehicleId] ?? (acc[e.vehicleId] = { id: e.vehicleId, nome: e.vehicleName ?? '—', codigo: e.vehicleCode ?? '', numAbast: 0, litros: 0, custo: 0, precoMedio: 0 })
          row.numAbast += 1
          row.litros += e.liters
          row.custo += e.totalCost
        })
        const linhas = Object.values(acc)
          .map(r => ({ ...r, precoMedio: r.litros > 0 ? r.custo / r.litros : 0 }))
          .filter(r => r.numAbast > 0)
          .sort((a, b) => b.custo - a.custo)
        setCombLinhas(linhas)
      })
      .catch(() => { toast.error('Erro ao carregar combustível') })
      .finally(() => { if (!cancelled) setCombLoading(false) })
    return () => { cancelled = true }
  }, [reportType])

  /* Valores derivados */
  const currEntries = useMemo(() => current.filter(m => m.type === 'entrada').length, [current])
  const currExits   = useMemo(() => current.filter(m => m.type === 'saida').length,   [current])
  const prevEntries = useMemo(() => previous.filter(m => m.type === 'entrada').length, [previous])
  const prevExits   = useMemo(() => previous.filter(m => m.type === 'saida').length,   [previous])
  const trendTotal   = calcTrend(current.length,  previous.length)
  const trendEntries = calcTrend(currEntries, prevEntries)
  const trendExits   = calcTrend(currExits,   prevExits)
  const lowStockCount = useMemo(() => products.filter(p => p.status !== 'normal').length, [products])

  const activityData = useMemo(() => {
    const byYear = period === 'ano'
    const buckets = new Map<string, { sortKey: string; label: string; Entradas: number; Saídas: number }>()
    current.forEach(m => {
      const sortKey = byYear
        ? `${m.date.getFullYear()}-${String(m.date.getMonth() + 1).padStart(2, '0')}`
        : diaLisboa(m.date)
      const label = byYear
        ? m.date.toLocaleDateString('pt-PT', { month: 'short', year: '2-digit' })
        : m.date.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })
      const existing = buckets.get(sortKey) ?? { sortKey, label, Entradas: 0, Saídas: 0 }
      if (m.type === 'entrada') existing.Entradas++
      else if (m.type === 'saida') existing.Saídas++
      buckets.set(sortKey, existing)
    })
    return Array.from(buckets.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey))
  }, [current, period])

  const topProducts = useMemo(() =>
    current
      .filter(m => m.type === 'saida')
      .reduce((acc, m) => {
        const e = acc.find(i => i.name === m.productName)
        if (e) e.qty += m.quantity
        else acc.push({ name: m.productName.length > 22 ? m.productName.slice(0, 21) + '…' : m.productName, qty: m.quantity })
        return acc
      }, [] as Array<{ name: string; qty: number }>)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5),
  [current])

  const stockHealth = useMemo(() => [
    { name: 'Normal',      value: products.filter(p => p.status === 'normal').length,    color: 'var(--chart-2)' },
    { name: 'Stock Baixo', value: products.filter(p => p.status === 'baixo').length,     color: 'var(--chart-4)' },
    { name: 'Sem Stock',   value: products.filter(p => p.status === 'sem-stock').length, color: 'var(--chart-3)' },
  ].filter(d => d.value > 0), [products])

  const biggestExit = useMemo(() => {
    const exits = current.filter(m => m.type === 'saida')
    if (!exits.length) return null
    return exits.reduce((max, m) => m.quantity > max.quantity ? m : max, exits[0])
  }, [current])

  const { label: periodLabel, prevLabel } = getPeriodConfig(period)

  return (
    <div className="space-y-6 pb-8">

      {/* ── Banner ───────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-5 md:p-6 text-card-foreground shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-muted rounded-lg p-2.5 shrink-0">
              <img src="/icone_oficial.png" alt="ENCIVIL" className="w-10 h-10 object-contain grayscale mix-blend-multiply dark:invert dark:mix-blend-screen" draggable={false} />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold leading-tight">Relatório Executivo</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                {abas.find(a => a.id === reportType)?.label ?? ''} · ENCIVIL
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(reportType === 'stock' || reportType === 'pessoas') && (
              <select
                aria-label="Período"
                value={period}
                onChange={e => setPeriod(e.target.value as Period)}
                className="px-3 py-2 bg-input-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="hoje"   className="text-foreground bg-card">Hoje</option>
                <option value="semana" className="text-foreground bg-card">Esta Semana</option>
                <option value="mes"    className="text-foreground bg-card">Este Mês</option>
                <option value="ano"    className="text-foreground bg-card">Este Ano</option>
              </select>
            )}
            {reportType === 'ferramentas' && (
              <select
                value={toolsPeriod}
                onChange={e => setToolsPeriod(e.target.value as Period)}
                className="px-3 py-2 bg-input-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="hoje"   className="text-foreground bg-card">Hoje</option>
                <option value="semana" className="text-foreground bg-card">Esta Semana</option>
                <option value="mes"    className="text-foreground bg-card">Este Mês</option>
                <option value="ano"    className="text-foreground bg-card">Este Ano</option>
              </select>
            )}
            <button
              onClick={() => void partilharSemanalWhatsApp()}
              disabled={sharingWA}
              className="flex items-center gap-2 px-3 py-2 bg-[#25D366] hover:bg-[#20BD5C] text-[#04090F] rounded-xl text-sm font-medium transition-colors disabled:opacity-60"
              title="Partilhar resumo semanal no WhatsApp"
            >
              <Share2 className={`w-4 h-4 ${sharingWA ? 'animate-pulse' : ''}`} />
              <span className="hidden sm:inline">{sharingWA ? 'A preparar…' : 'WhatsApp'}</span>
            </button>
            {(reportType === 'stock' || reportType === 'ferramentas' || reportType === 'combustivel') && (
              <button
                onClick={() => reportType === 'stock' ? setShowPrint(true) : reportType === 'ferramentas' ? setShowToolsPrint(true) : setShowCombPrint(true)}
                className="flex items-center gap-2 px-3 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border rounded-lg text-sm font-medium transition-colors"
              >
                <Printer className="w-4 h-4" />
                <span className="hidden sm:inline">Exportar PDF</span>
              </button>
            )}
          </div>
        </div>
        <p className="text-muted-foreground text-xs mt-3">
          {reportType === 'stock'
            ? `${periodLabel} · comparado com ${prevLabel}`
            : reportType === 'ferramentas'
            ? `${getPeriodConfig(toolsPeriod).label} · comparado com ${getPeriodConfig(toolsPeriod).prevLabel}`
            : reportType === 'pessoas'
            ? `${periodLabel} · assiduidade, faltas e validades`
            : reportType === 'combustivel'
            ? 'Consumo acumulado por viatura'
            : 'Situação atual · mesmos números das fichas de cada módulo'}
        </p>
      </div>

      {/* ── Switcher Stock / Ferramentas / Obras ──────────── */}
      <div role="tablist" aria-label="Tipo de relatório" className="flex flex-wrap gap-2 bg-card rounded-2xl border border-border p-1.5 w-fit max-w-full">
        {abas.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={reportType === id}
            onClick={() => setReportType(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              reportType === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      <Link to="/obras/relatorios" className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:border-primary/40 transition-colors">
        <span className="rounded-xl bg-primary/10 p-2 text-primary"><FileText className="w-5 h-5" aria-hidden="true" /></span>
        <span className="flex-1"><strong className="block text-sm">Relatórios diários das obras</strong><span className="text-xs text-muted-foreground">Consulte presenças, trabalhos, fotografias e ocorrências por dia.</span></span>
        <span className="text-sm font-medium text-primary">Abrir</span>
      </Link>

      {reportType === 'visao' && podeFinanceiro && <VisaoGeralSection />}
      {reportType === 'obras' && podeFinanceiro && <ObrasSection />}
      {reportType === 'subempreitadas' && podeFinanceiro && <SubempreitadasSection />}
      {reportType === 'frota' && podeFinanceiro && <FrotaSection />}
      {reportType === 'pessoas' && podeFinanceiro && <PessoasSection period={period} periodLabel={periodLabel} />}

      {reportType === 'combustivel' && (
        <CombustivelReportSection loading={combLoading} linhas={combLinhas} />
      )}

      {reportType === 'ferramentas' && (
        <ToolsReportSection
          loading={toolsLoading}
          tools={tools}
          loansCurrent={loansCurrent}
          loansPrevious={loansPrevious}
          loansActive={loansActive}
          period={toolsPeriod}
          periodLabel={getPeriodConfig(toolsPeriod).label}
          prevLabel={getPeriodConfig(toolsPeriod).prevLabel}
        />
      )}

      {reportType === 'stock' && (
      <>
      {/* ── KPIs ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <KpiCard label="Total de Movimentos" value={current.length} icon={BarChart3}       iconBg="bg-primary/10"     valueColor="text-primary"     trend={trendTotal}   loading={loading} />
        <KpiCard label="Entradas no Período" value={currEntries}    icon={ArrowDownCircle} iconBg="bg-success/10"     valueColor="text-success"     trend={trendEntries} loading={loading} />
        <KpiCard label="Saídas no Período"   value={currExits}      icon={ArrowUpCircle}   iconBg="bg-destructive/10" valueColor="text-destructive" trend={trendExits}   loading={loading} />
        <KpiCard label="Produtos em Alerta"  value={lowStockCount}  icon={AlertTriangle}   iconBg="bg-warning/10"     valueColor="text-warning"     trend={null}         loading={loading} />
      </div>

      {/* ── Atividade diária ─────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="mb-5">
          <h2 className="font-semibold text-base">Atividade {period === 'ano' ? 'Mensal' : 'Diária'}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Entradas e saídas ao longo do período</p>
        </div>
        {loading ? (
          <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">A carregar…</div>
        ) : activityData.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center gap-2">
            <TrendingUp className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Sem movimentos no período selecionado</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={activityData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--chart-text)' }} interval="preserveStartEnd" tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--chart-text)' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
              <Line type="monotone" dataKey="Entradas" stroke="var(--chart-2)" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--chart-2)' }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="Saídas"   stroke="var(--chart-3)" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--chart-3)' }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Top produtos + saúde do stock ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-6">
        <div className="lg:col-span-3 bg-card rounded-2xl border border-border p-5">
          <div className="mb-5">
            <h2 className="font-semibold text-base">Top Produtos Consumidos</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Maior volume de saídas no período</p>
          </div>
          {loading ? (
            <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">A carregar…</div>
          ) : topProducts.length === 0 ? (
            <div className="h-56 flex flex-col items-center justify-center gap-2">
              <TrendingDown className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Sem saídas no período</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topProducts} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--chart-grid)" />
                <XAxis type="number"   tick={{ fontSize: 11, fill: 'var(--chart-text)' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11, fill: 'var(--chart-text)' }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--muted)' }} />
                <Bar dataKey="qty" name="Quantidade" fill="var(--chart-1)" radius={[0, 6, 6, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="lg:col-span-2 bg-card rounded-2xl border border-border p-5 flex flex-col">
          <div className="mb-5">
            <h2 className="font-semibold text-base">Saúde do Stock</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Estado atual dos produtos</p>
          </div>
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">A carregar…</div>
          ) : products.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Sem produtos</div>
          ) : (
            <>
              <div className="flex-1 flex items-center justify-center">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={stockHealth} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                      {stockHealth.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 mt-2">
                {stockHealth.map(s => (
                  <div key={s.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                      <span className="text-muted-foreground">{s.name}</span>
                    </div>
                    <span className="font-semibold">{s.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Resumo executivo ─────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-muted/30">
          <h2 className="font-semibold text-base">Resumo Executivo</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{periodLabel}</p>
        </div>
        <div className="divide-y divide-border">
          {[
            { label: 'Produtos cadastrados',     value: String(products.length) },
            { label: 'Produtos com stock baixo', value: String(products.filter(p => p.status === 'baixo').length),    color: 'text-warning'     },
            { label: 'Produtos sem stock',       value: String(products.filter(p => p.status === 'sem-stock').length), color: 'text-destructive'  },
            { label: 'Taxa de saídas',           value: !loading && current.length > 0 ? `${Math.round((currExits / current.length) * 100)}%` : '—' },
            { label: 'Maior saída do período',   value: !loading && biggestExit ? `${biggestExit.productName} · ${biggestExit.quantity} ${getUnitLabel(biggestExit.unit)}` : '—' },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between px-5 py-3.5 hover:bg-accent/30 transition-colors">
              <span className="text-sm text-muted-foreground">{row.label}</span>
              <span className={`text-sm font-semibold text-right max-w-[60%] truncate ${row.color ?? 'text-foreground'}`}>
                {loading ? '…' : row.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Print Report ─────────────────────────────────── */}
      {showPrint && (
        <PrintReport
          data={{
            current, previous, products, period,
            periodLabel, prevLabel,
            activityData, topProducts, stockHealth, biggestExit,
          }}
          onClose={() => setShowPrint(false)}
        />
      )}
      </>
      )}

      {showToolsPrint && (
        <ToolsPrintReport
          data={{
            loading: toolsLoading, tools, loansCurrent, loansPrevious, loansActive,
            period: toolsPeriod,
            periodLabel: getPeriodConfig(toolsPeriod).label,
            prevLabel: getPeriodConfig(toolsPeriod).prevLabel,
          }}
          onClose={() => setShowToolsPrint(false)}
        />
      )}

      {showCombPrint && (
        <CombustivelPrintReport
          data={{ loading: combLoading, linhas: combLinhas }}
          onClose={() => setShowCombPrint(false)}
        />
      )}

      <EnviarWhatsAppDialog
        open={textoWA !== null}
        onOpenChange={o => { if (!o) setTextoWA(null) }}
        texto={textoWA ?? ''}
      />
    </div>
  )
}
