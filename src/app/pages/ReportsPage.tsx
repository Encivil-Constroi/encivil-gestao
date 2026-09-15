import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts'
import {
  BarChart3, TrendingUp, TrendingDown, ArrowUpCircle, ArrowDownCircle,
  AlertTriangle, Printer, ChevronUp, ChevronDown, Minus, X, FileText,
  Wrench, Boxes, Building2, Wallet, Fuel, Droplet, HardHat, Share2,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { listarMovimentos } from '@/features/movimentos/services/movimentosService'
import { listarProdutos } from '@/features/produtos/services/produtosService'
import { listarFerramentas } from '@/features/ferramentas/services/ferramentasService'
import { listarEmprestimos } from '@/features/ferramentas/services/emprestimosService'
import { listarObras } from '@/features/obras/services/obrasService'
import { listarSubempreiteirosComExecutado, type SubcontractorComExecutado } from '@/features/subempreiteiros/services/subempreiteirosService'
import { custosMateriaisCombustivelPorObra } from '@/features/custos/custosService'
import { listarAbastecimentos } from '@/features/combustivel/services/abastecimentosService'
import { listarVeiculos } from '@/features/combustivel/services/veiculosService'
import { getUnitLabel, getToolCategoryLabel } from '../data/mockData'
import { fmtEuro, fmtNumber } from '../lib/format'
import { ToolStatusBadge } from '../components/ToolStatusBadge'
import type { Movement, Product, Tool, ToolLoan, Obra } from '../types'

/* ─── Tipos e helpers ───────────────────────────────────────────── */

type Period = 'hoje' | 'semana' | 'mes' | 'ano'

function getPeriodConfig(p: Period) {
  const now = new Date()
  const currFrom = new Date(now)
  const prevFrom = new Date(now)
  const prevTo   = new Date(now)

  if (p === 'hoje') {
    currFrom.setHours(0, 0, 0, 0)
    prevFrom.setDate(prevFrom.getDate() - 1); prevFrom.setHours(0, 0, 0, 0)
    prevTo.setDate(prevTo.getDate() - 1); prevTo.setHours(23, 59, 59, 999)
    return { currFrom, prevFrom, prevTo, label: 'Hoje', prevLabel: 'Ontem' }
  }
  if (p === 'semana') {
    currFrom.setDate(currFrom.getDate() - 7)
    prevFrom.setDate(prevFrom.getDate() - 14)
    prevTo.setDate(prevTo.getDate() - 7)
    return { currFrom, prevFrom, prevTo, label: 'Esta Semana', prevLabel: 'Semana anterior' }
  }
  if (p === 'mes') {
    currFrom.setMonth(currFrom.getMonth() - 1)
    prevFrom.setMonth(prevFrom.getMonth() - 2)
    prevTo.setMonth(prevTo.getMonth() - 1)
    return { currFrom, prevFrom, prevTo, label: 'Este Mês', prevLabel: 'Mês anterior' }
  }
  currFrom.setFullYear(currFrom.getFullYear() - 1)
  prevFrom.setFullYear(prevFrom.getFullYear() - 2)
  prevTo.setFullYear(prevTo.getFullYear() - 1)
  return { currFrom, prevFrom, prevTo, label: 'Este Ano', prevLabel: 'Ano anterior' }
}

function calcTrend(curr: number, prev: number) {
  if (prev === 0) return null
  const pct = ((curr - prev) / prev) * 100
  return { pct: Math.abs(Math.round(pct)), dir: pct > 1 ? 'up' : pct < -1 ? 'down' : 'neutral' } as const
}

function fmt(d: Date) {
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

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

/* ─── KPI Card (página normal) ──────────────────────────────────── */

function KpiCard({
  label, value, icon: Icon, iconBg, valueColor, trend, loading,
}: {
  label: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  iconBg: string
  valueColor: string
  trend: ReturnType<typeof calcTrend>
  loading: boolean
}) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className={`p-2.5 rounded-xl ${iconBg}`}>
          <Icon className={`w-5 h-5 ${valueColor}`} />
        </div>
        {trend ? (
          <span className={`flex items-center gap-0.5 text-xs font-semibold px-2 py-1 rounded-full ${
            trend.dir === 'up'   ? 'bg-success/10 text-success' :
            trend.dir === 'down' ? 'bg-destructive/10 text-destructive' :
                                   'bg-muted/50 text-muted-foreground'
          }`}>
            {trend.dir === 'up'   ? <ChevronUp   className="w-3 h-3" /> :
             trend.dir === 'down' ? <ChevronDown className="w-3 h-3" /> :
                                    <Minus        className="w-3 h-3" />}
            {trend.pct}%
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
      <div>
        <p className={`text-3xl font-bold ${valueColor}`}>{loading ? '…' : value}</p>
        <p className="text-xs text-muted-foreground mt-1 leading-tight">{label}</p>
      </div>
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
      @media print {
        body > *:not(#encivil-print-root) { display: none !important; }
        #encivil-print-root { display: block !important; position: static !important; overflow: visible !important; }
        #encivil-print-root * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }
        .no-print { display: none !important; }
        @page { margin: 12mm 15mm; size: A4 portrait; }
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
  const today        = fmt(new Date())

  const NAVY   = '#1e3a8a'
  const GREEN  = '#16a34a'
  const RED    = '#dc2626'
  const AMBER  = '#f59e0b'
  const SLATE  = '#64748b'
  const LIGHT  = '#f8fafc'
  const BORDER = '#e2e8f0'

  const sectionTitle = (text: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <div style={{ width: 4, height: 20, background: NAVY, borderRadius: 2, flexShrink: 0 }} />
      <span style={{ fontWeight: 700, fontSize: 13, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {text}
      </span>
    </div>
  )

  const trendBadge = (t: ReturnType<typeof calcTrend>) => {
    if (!t) return <span style={{ color: SLATE, fontSize: 11 }}>sem dados anteriores</span>
    const color = t.dir === 'up' ? GREEN : t.dir === 'down' ? RED : SLATE
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
      style={{ position: 'fixed', inset: 0, background: 'white', zIndex: 9999, overflowY: 'auto' }}
    >
      {/* ── Barra de controlo (oculta na impressão) ────────── */}
      <div
        className="no-print"
        style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: 'white', borderBottom: `1px solid ${BORDER}`,
          padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText style={{ width: 16, height: 16, color: NAVY }} />
          <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>
            Pré-visualização · Relatório Executivo ENCIVIL
          </span>
          <span style={{ fontSize: 12, color: SLATE, marginLeft: 8 }}>
            {periodLabel}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
              border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13,
              background: 'white', cursor: 'pointer', color: '#374151',
            }}
          >
            <X style={{ width: 14, height: 14 }} /> Fechar
          </button>
          <button
            onClick={() => window.print()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px',
              background: NAVY, color: 'white', border: 'none', borderRadius: 8,
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
        <div style={{ background: NAVY, color: 'white', padding: '24px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ background: 'white', borderRadius: 10, padding: 6, width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <img src="/icone_oficial.png" alt="ENCIVIL" style={{ width: 40, height: 40, objectFit: 'contain' }} />
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.02em' }}>ENCIVIL</div>
                <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>Relatório Executivo de Armazém</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{periodLabel}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Gerado em {today}</div>
            </div>
          </div>
          {/* Linha info */}
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.2)', display: 'flex', gap: 28, fontSize: 12, opacity: 0.8 }}>
            <span>Movimentos: <strong>{current.length}</strong></span>
            <span>Entradas: <strong style={{ color: '#86efac' }}>{currEntries}</strong></span>
            <span>Saídas: <strong style={{ color: '#fca5a5' }}>{currExits}</strong></span>
            <span>Produtos em alerta: <strong style={{ color: '#fde68a' }}>{lowCount}</strong></span>
          </div>
        </div>

        <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 32 }}>

          {/* ── Secção 1: KPIs ────────────────────────── */}
          <div>
            {sectionTitle('Indicadores Executivos')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'Total de Movimentos', value: current.length,  color: NAVY,  trend: trendTotal   },
                { label: 'Entradas no Período',  value: currEntries,     color: GREEN, trend: trendEntries },
                { label: 'Saídas no Período',    value: currExits,       color: RED,   trend: trendExits   },
                { label: 'Produtos em Alerta',   value: lowCount,        color: AMBER, trend: null         },
              ].map(k => (
                <div key={k.label} style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', background: LIGHT }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: k.color, lineHeight: 1 }}>{k.value}</div>
                  <div style={{ fontSize: 11, color: SLATE, marginTop: 6, lineHeight: 1.3, fontWeight: 500 }}>{k.label}</div>
                  <div style={{ marginTop: 8 }}>{trendBadge(k.trend)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Secção 2: Atividade diária ─────────────── */}
          <div>
            {sectionTitle(`Atividade ${data.period === 'ano' ? 'Mensal' : 'Diária'} — Entradas e Saídas`)}
            {activityData.length === 0 ? (
              <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: LIGHT, borderRadius: 10, border: `1px solid ${BORDER}`, color: SLATE, fontSize: 13 }}>
                Sem movimentos no período selecionado
              </div>
            ) : (
              <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px 8px 8px', background: 'white' }}>
                <LineChart width={698} height={220} data={activityData} margin={{ top: 5, right: 16, left: -16, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: SLATE }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: SLATE }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${BORDER}` }} />
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
                <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: LIGHT, borderRadius: 10, border: `1px solid ${BORDER}`, color: SLATE, fontSize: 13 }}>
                  Sem saídas no período
                </div>
              ) : (
                <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px 8px 8px', background: 'white' }}>
                  <BarChart width={400} height={200} data={topProducts} layout="vertical" margin={{ top: 0, right: 16, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={BORDER} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: SLATE }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis dataKey="name" type="category" width={105} tick={{ fontSize: 11, fill: '#1e293b' }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${BORDER}` }} />
                    <Bar dataKey="qty" name="Quantidade" fill={NAVY} radius={[0, 5, 5, 0]} maxBarSize={22} />
                  </BarChart>
                </div>
              )}
            </div>

            {/* Saúde do stock */}
            <div>
              {sectionTitle('Saúde do Stock')}
              <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px', background: 'white' }}>
                {stockHealth.length > 0 ? (
                  <>
                    <PieChart width={260} height={160}>
                      <Pie data={stockHealth} cx="50%" cy="50%" innerRadius={42} outerRadius={70} dataKey="value" paddingAngle={3}>
                        {stockHealth.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${BORDER}` }} />
                    </PieChart>
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {stockHealth.map(s => (
                        <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, display: 'inline-block', flexShrink: 0 }} />
                            <span style={{ color: SLATE }}>{s.name}</span>
                          </div>
                          <span style={{ fontWeight: 700, color: '#1e293b' }}>{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: SLATE, fontSize: 13 }}>
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
                <tr style={{ background: NAVY, color: 'white' }}>
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
                  <tr key={row.label} style={{ background: i % 2 === 0 ? 'white' : LIGHT }}>
                    <td style={{ padding: '10px 16px', color: '#374151', borderBottom: `1px solid ${BORDER}` }}>
                      {row.label}
                    </td>
                    <td style={{ padding: '10px 16px', fontWeight: 700, color: '#1e293b', textAlign: 'right', borderBottom: `1px solid ${BORDER}` }}>
                      {row.value}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', borderBottom: `1px solid ${BORDER}` }}>
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
                  <tr style={{ background: NAVY, color: 'white' }}>
                    {['Data', 'Produto', 'Tipo', 'Quantidade', 'Responsável', 'Destino'].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {current.slice(0, 15).map((m, i) => (
                    <tr key={m.id} style={{ background: i % 2 === 0 ? 'white' : LIGHT }}>
                      <td style={{ padding: '8px 12px', color: SLATE, borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>
                        {fmt(m.date)}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#1e293b', borderBottom: `1px solid ${BORDER}` }}>
                        {m.productName}
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${BORDER}` }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                          background: m.type === 'entrada' ? '#dcfce7' : '#fee2e2',
                          color: m.type === 'entrada' ? GREEN : RED,
                        }}>
                          {m.type === 'entrada' ? 'Entrada' : 'Saída'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1e293b', borderBottom: `1px solid ${BORDER}` }}>
                        {m.quantity} {getUnitLabel(m.unit)}
                      </td>
                      <td style={{ padding: '8px 12px', color: SLATE, borderBottom: `1px solid ${BORDER}` }}>
                        {m.responsible}
                      </td>
                      <td style={{ padding: '8px 12px', color: SLATE, borderBottom: `1px solid ${BORDER}` }}>
                        {m.destination ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {current.length > 15 && (
                <p style={{ fontSize: 11, color: SLATE, marginTop: 6, textAlign: 'right' }}>
                  A mostrar os 15 movimentos mais recentes de {current.length} total
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Rodapé do documento ──────────────────────── */}
        <div style={{
          borderTop: `3px solid ${NAVY}`, margin: '0 32px', padding: '14px 0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: SLATE,
        }}>
          <span>Gerado automaticamente pelo ENCIVIL Gestão</span>
          <span style={{ fontWeight: 600 }}>© 2026 ENCIVIL</span>
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
        : l.loanDate.toISOString().split('T')[0]
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
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} interval="preserveStartEnd" tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
              <Line type="monotone" dataKey="Empréstimos" stroke="#1e3a8a" strokeWidth={2.5} dot={{ r: 3, fill: '#1e3a8a' }} activeDot={{ r: 5 }} />
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
      @media print {
        body > *:not(#encivil-print-root-ferramentas) { display: none !important; }
        #encivil-print-root-ferramentas { display: block !important; position: static !important; overflow: visible !important; }
        #encivil-print-root-ferramentas * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }
        .no-print { display: none !important; }
        @page { margin: 12mm 15mm; size: A4 portrait; }
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
  const today = fmt(new Date())

  const NAVY   = '#1e3a8a'
  const GREEN  = '#16a34a'
  const RED    = '#dc2626'
  const AMBER  = '#f59e0b'
  const SLATE  = '#64748b'
  const LIGHT  = '#f8fafc'
  const BORDER = '#e2e8f0'

  const sectionTitle = (text: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <div style={{ width: 4, height: 20, background: NAVY, borderRadius: 2, flexShrink: 0 }} />
      <span style={{ fontWeight: 700, fontSize: 13, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {text}
      </span>
    </div>
  )

  const trendBadge = (t: ReturnType<typeof calcTrend>) => {
    if (!t) return <span style={{ color: SLATE, fontSize: 11 }}>sem dados anteriores</span>
    const color = t.dir === 'up' ? GREEN : t.dir === 'down' ? RED : SLATE
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
      style={{ position: 'fixed', inset: 0, background: 'white', zIndex: 9999, overflowY: 'auto' }}
    >
      <div
        className="no-print"
        style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: 'white', borderBottom: `1px solid ${BORDER}`,
          padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText style={{ width: 16, height: 16, color: NAVY }} />
          <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>
            Pré-visualização · Relatório de Ferramentas ENCIVIL
          </span>
          <span style={{ fontSize: 12, color: SLATE, marginLeft: 8 }}>{periodLabel}</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
              border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13,
              background: 'white', cursor: 'pointer', color: '#374151',
            }}
          >
            <X style={{ width: 14, height: 14 }} /> Fechar
          </button>
          <button
            onClick={() => window.print()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px',
              background: NAVY, color: 'white', border: 'none', borderRadius: 8,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Printer style={{ width: 14, height: 14 }} /> Imprimir / Salvar PDF
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 794, margin: '0 auto', background: 'white', padding: '0 0 40px' }}>

        <div style={{ background: NAVY, color: 'white', padding: '24px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ background: 'white', borderRadius: 10, padding: 6, width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <img src="/icone_oficial.png" alt="ENCIVIL" style={{ width: 40, height: 40, objectFit: 'contain' }} />
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.02em' }}>ENCIVIL</div>
                <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>Relatório de Ferramentas</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{periodLabel}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Gerado em {today}</div>
            </div>
          </div>
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.2)', display: 'flex', gap: 28, fontSize: 12, opacity: 0.8 }}>
            <span>Empréstimos: <strong>{loansCurrent.length}</strong></span>
            <span>Devolvidos: <strong style={{ color: '#86efac' }}>{devolvidosPeriodo}</strong></span>
            <span>Emprestadas agora: <strong style={{ color: '#fde68a' }}>{emprestadas}</strong></span>
            <span>Em atraso: <strong style={{ color: '#fca5a5' }}>{atrasados.length}</strong></span>
          </div>
        </div>

        <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 32 }}>

          <div>
            {sectionTitle('Indicadores')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'Empréstimos no Período', value: loansCurrent.length, color: NAVY,  trend: trendEmprestimos },
                { label: 'Devolvidos no Período',  value: devolvidosPeriodo,   color: GREEN, trend: trendDevolvidos  },
                { label: 'Emprestadas Agora',      value: emprestadas,         color: AMBER, trend: null             },
                { label: 'Em Atraso',              value: atrasados.length,    color: RED,   trend: null             },
              ].map(k => (
                <div key={k.label} style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', background: LIGHT }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: k.color, lineHeight: 1 }}>{k.value}</div>
                  <div style={{ fontSize: 11, color: SLATE, marginTop: 6, lineHeight: 1.3, fontWeight: 500 }}>{k.label}</div>
                  <div style={{ marginTop: 8 }}>{trendBadge(k.trend)}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            {sectionTitle(`Empréstimos ${data.period === 'ano' ? 'Mensais' : 'Diários'}`)}
            {activityData.length === 0 ? (
              <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: LIGHT, borderRadius: 10, border: `1px solid ${BORDER}`, color: SLATE, fontSize: 13 }}>
                Sem empréstimos no período selecionado
              </div>
            ) : (
              <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px 8px 8px', background: 'white' }}>
                <LineChart width={698} height={220} data={activityData} margin={{ top: 5, right: 16, left: -16, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: SLATE }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: SLATE }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${BORDER}` }} />
                  <Line type="monotone" dataKey="Empréstimos" stroke={NAVY} strokeWidth={2.5} dot={{ r: 3, fill: NAVY }} />
                </LineChart>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 20 }}>
            <div>
              {sectionTitle('Ferramentas em Atraso')}
              {atrasados.length === 0 ? (
                <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', background: LIGHT, borderRadius: 10, border: `1px solid ${BORDER}`, color: SLATE, fontSize: 13 }}>
                  Nenhuma ferramenta em atraso
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: NAVY, color: 'white' }}>
                      {['Ferramenta', 'Funcionário', 'Em atraso desde'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {atrasados.map((l, i) => (
                      <tr key={l.id} style={{ background: i % 2 === 0 ? 'white' : LIGHT }}>
                        <td style={{ padding: '8px 12px', borderBottom: `1px solid ${BORDER}` }}>{l.toolCode} · {l.toolName}</td>
                        <td style={{ padding: '8px 12px', color: SLATE, borderBottom: `1px solid ${BORDER}` }}>{l.employeeName}</td>
                        <td style={{ padding: '8px 12px', color: RED, fontWeight: 600, borderBottom: `1px solid ${BORDER}` }}>
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
              <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px', background: 'white' }}>
                {topFuncionarios.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {topFuncionarios.map(f => (
                      <div key={f.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: SLATE }}>{f.name}</span>
                        <span style={{ fontWeight: 700, color: '#1e293b' }}>{f.qty}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: SLATE, fontSize: 13 }}>
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
                <tr style={{ background: NAVY, color: 'white' }}>
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
                  <tr key={row.label} style={{ background: i % 2 === 0 ? 'white' : LIGHT }}>
                    <td style={{ padding: '10px 16px', color: '#374151', borderBottom: `1px solid ${BORDER}` }}>{row.label}</td>
                    <td style={{ padding: '10px 16px', fontWeight: 700, color: '#1e293b', textAlign: 'right', borderBottom: `1px solid ${BORDER}` }}>{row.value}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', borderBottom: `1px solid ${BORDER}` }}>{trendBadge(row.trend)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{
          borderTop: `3px solid ${NAVY}`, margin: '0 32px', padding: '14px 0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: SLATE,
        }}>
          <span>Gerado automaticamente pelo ENCIVIL Gestão</span>
          <span style={{ fontWeight: 600 }}>© 2026 ENCIVIL</span>
        </div>
      </div>
    </div>,
    document.body
  )
}

/* ─── Relatório de Obras ────────────────────────────────────────── */

type ObraLinha = {
  obra: Obra
  subs: SubcontractorComExecutado[]
  contratado: number      // soma do valor acordado dos subempreiteiros
  materiais: number
  subExecutado: number    // soma dos autos validados dos subempreiteiros
  combustivel: number
  custoTotal: number      // materiais + subExecutado + combustivel
  orcamento?: number
  margem?: number
}

type ObrasReportData = {
  loading: boolean
  linhas: ObraLinha[]
}

function ObraMini({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-sm md:text-base font-bold mt-0.5 ${color}`}>{value}</p>
    </div>
  )
}

// ── Motor de análise executiva das obras ────────────────────────
const RISCO_LIMIAR = 0.85 // custo já >= 85% do orçamento => risco de estouro

function margemPctDe(l: ObraLinha): number | null {
  if (l.orcamento == null || l.orcamento <= 0 || l.margem == null) return null
  return (l.margem / l.orcamento) * 100
}

// Cor/saúde: verde margem>=15%, âmbar 0–15%, vermelho negativa.
function saudeObra(l: ObraLinha): { color: string; dot: string } {
  const pct = margemPctDe(l)
  if (pct == null) return { color: 'text-muted-foreground', dot: 'bg-muted-foreground/40' }
  if (pct < 0) return { color: 'text-destructive', dot: 'bg-destructive' }
  if (pct < 15) return { color: 'text-warning', dot: 'bg-warning' }
  return { color: 'text-success', dot: 'bg-success' }
}

function analiseObras(linhas: ObraLinha[]) {
  const comOrc = linhas.filter(l => (l.orcamento ?? 0) > 0)
  const totalOrcamento = linhas.reduce((s, l) => s + (l.orcamento ?? 0), 0)
  const totalCusto = linhas.reduce((s, l) => s + l.custoTotal, 0)
  const totalMargem = totalOrcamento - totalCusto
  const margemPct = totalOrcamento > 0 ? (totalMargem / totalOrcamento) * 100 : null

  const noVermelho = comOrc.filter(l => (l.margem ?? 0) < 0)
  const emRisco = comOrc.filter(l => (l.margem ?? 0) >= 0 && l.custoTotal / l.orcamento! >= RISCO_LIMIAR)

  const rank = comOrc.map(l => ({ l, pct: margemPctDe(l)! })).sort((a, b) => b.pct - a.pct)
  const melhor = rank[0]
  const pior = rank.length > 1 ? rank[rank.length - 1] : undefined

  return { comOrc, totalOrcamento, totalCusto, totalMargem, margemPct, noVermelho, emRisco, melhor, pior }
}

const fmtPct = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '' : ''}${v.toFixed(1)}%`)

function ObrasReportSection({ loading, linhas }: ObrasReportData) {
  const totalOrcamento = linhas.reduce((s, l) => s + (l.orcamento ?? 0), 0)
  const totalCusto     = linhas.reduce((s, l) => s + l.custoTotal, 0)
  const totalMargem    = totalOrcamento - totalCusto
  const a = analiseObras(linhas)

  const chartData = linhas
    .filter(l => (l.orcamento ?? 0) > 0 || l.custoTotal > 0)
    .slice(0, 8)
    .map(l => ({
      name: l.obra.name.length > 16 ? l.obra.name.slice(0, 15) + '…' : l.obra.name,
      'Orçamento': l.orcamento ?? 0,
      'Custo Real': l.custoTotal,
    }))

  return (
    <div className="space-y-6 pb-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <KpiCard label="Obras" value={linhas.length} icon={Building2} iconBg="bg-primary/10" valueColor="text-primary" trend={null} loading={loading} />
        <KpiCard label="Orçamento" value={fmtEuro(totalOrcamento)} icon={Wallet} iconBg="bg-primary/10" valueColor="text-foreground" trend={null} loading={loading} />
        <KpiCard label="Custo Real" value={fmtEuro(totalCusto)} icon={TrendingDown} iconBg="bg-destructive/10" valueColor="text-destructive" trend={null} loading={loading} />
        <KpiCard label="Margem" value={fmtEuro(totalMargem)} icon={TrendingUp} iconBg={totalMargem >= 0 ? 'bg-success/10' : 'bg-destructive/10'} valueColor={totalMargem >= 0 ? 'text-success' : 'text-destructive'} trend={null} loading={loading} />
      </div>

      {/* Análise executiva — insights, não só números */}
      {!loading && (
        <div className="bg-card rounded-2xl border border-border p-5">
          <h2 className="font-semibold text-base mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" /> Análise Executiva</h2>
          {a.comOrc.length === 0 ? (
            <p className="text-sm text-muted-foreground">Defina o <strong>orçamento</strong> das obras (em Editar) para ver a análise de margem e risco.</p>
          ) : (
            <ul className="space-y-2.5 text-sm">
              <li className="flex items-start gap-2.5">
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${a.totalMargem >= 0 ? 'bg-success' : 'bg-destructive'}`} />
                <span>
                  Margem global de <strong className={a.totalMargem >= 0 ? 'text-success' : 'text-destructive'}>{fmtEuro(a.totalMargem)}</strong>
                  {a.margemPct != null && <> (<strong>{fmtPct(a.margemPct)}</strong> do orçamento)</>} em {a.comOrc.length} obra{a.comOrc.length !== 1 ? 's' : ''} com orçamento.
                </span>
              </li>
              {a.noVermelho.length > 0 && (
                <li className="flex items-start gap-2.5">
                  <TrendingDown className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  <span>
                    <strong className="text-destructive">{a.noVermelho.length} obra{a.noVermelho.length !== 1 ? 's' : ''} a dar prejuízo</strong> (custo acima do orçamento): {a.noVermelho.map(l => l.obra.name).join(', ')}.
                  </span>
                </li>
              )}
              {a.emRisco.length > 0 && (
                <li className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                  <span>
                    <strong className="text-warning">{a.emRisco.length} obra{a.emRisco.length !== 1 ? 's' : ''} em risco de estouro</strong> (custo já ≥ 85% do orçamento): {a.emRisco.map(l => l.obra.name).join(', ')}.
                  </span>
                </li>
              )}
              {a.melhor && (
                <li className="flex items-start gap-2.5">
                  <TrendingUp className="w-4 h-4 text-success mt-0.5 shrink-0" />
                  <span>
                    Melhor margem: <strong>{a.melhor.l.obra.name}</strong> ({fmtPct(a.melhor.pct)}){a.pior && <> · Pior: <strong>{a.pior.l.obra.name}</strong> ({fmtPct(a.pior.pct)})</>}.
                  </span>
                </li>
              )}
              {a.noVermelho.length === 0 && a.emRisco.length === 0 && (
                <li className="flex items-start gap-2.5">
                  <span className="mt-1.5 w-2 h-2 rounded-full shrink-0 bg-success" />
                  <span>Todas as obras com orçamento estão dentro do previsto. 🎉</span>
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* Gráfico Orçamento vs. Custo Real por obra */}
      {chartData.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-5">
          <h2 className="font-semibold text-base mb-4">Orçamento vs. Custo Real</h2>
          <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 56)}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `${Math.round(Number(v) / 1000)}k`} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => fmtEuro(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} cursor={{ fill: '#f1f5f9' }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Bar dataKey="Orçamento" fill="#1e3a8a" radius={[0, 4, 4, 0]} barSize={11} />
              <Bar dataKey="Custo Real" fill="#dc2626" radius={[0, 4, 4, 0]} barSize={11} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Uma ficha por obra — com o detalhe dos subempreiteiros */}
      {loading ? (
        <div className="bg-card rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground">A carregar…</div>
      ) : linhas.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground">Ainda não há obras.</div>
      ) : (
        <div className="space-y-4">
          {linhas.map(l => (
            <div key={l.obra.id} className="bg-card rounded-2xl border border-border overflow-hidden">
              {/* Cabeçalho da obra */}
              <div className="px-5 py-3.5 border-b border-border bg-muted/30 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${saudeObra(l).dot}`} title="Saúde da margem" />
                    <h3 className="font-semibold text-sm truncate">{l.obra.name}</h3>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                      l.obra.status === 'concluida' ? 'bg-muted text-muted-foreground' : 'bg-success/10 text-success'
                    }`}>{l.obra.status === 'concluida' ? 'Concluída' : 'Ativa'}</span>
                  </div>
                  {l.obra.client && <p className="text-xs text-muted-foreground truncate ml-4">{l.obra.client}</p>}
                </div>
              </div>

              {/* P&L da obra */}
              <div className="grid grid-cols-3 gap-2 px-5 py-3 border-b border-border">
                <ObraMini label="Orçamento" value={l.orcamento != null ? fmtEuro(l.orcamento) : '—'} color="text-foreground" />
                <ObraMini label="Custo Real" value={fmtEuro(l.custoTotal)} color="text-destructive" />
                <ObraMini
                  label={margemPctDe(l) != null ? `Margem (${fmtPct(margemPctDe(l))})` : 'Margem'}
                  value={l.margem != null ? fmtEuro(l.margem) : '—'}
                  color={saudeObra(l).color}
                />
              </div>

              {/* Repartição */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 px-5 py-2 text-xs text-muted-foreground border-b border-border">
                <span>Materiais: <strong className="text-foreground">{fmtEuro(l.materiais)}</strong></span>
                <span>Subempreiteiros: <strong className="text-foreground">{fmtEuro(l.subExecutado)}</strong></span>
                <span>Combustível: <strong className="text-foreground">{fmtEuro(l.combustivel)}</strong></span>
              </div>

              {/* Subempreiteiros da obra — a relação que faltava */}
              <div className="px-5 py-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <HardHat className="w-3.5 h-3.5" /> Subempreiteiros
                  </h4>
                  {l.subs.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      Contratado <strong className="text-foreground">{fmtEuro(l.contratado)}</strong> · Falta <strong className="text-foreground">{fmtEuro(l.contratado - l.subExecutado)}</strong>
                    </span>
                  )}
                </div>
                {l.subs.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-1">Sem subempreiteiros nesta obra.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground">
                          {['Subempreiteiro', 'Contratado', 'Executado', 'Falta', ''].map(h => (
                            <th key={h} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {l.subs.map(s => (
                          <tr key={s.id}>
                            <td className="px-2 py-1.5 font-medium">{s.name}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">{fmtEuro(s.agreedValue)}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap text-success">{fmtEuro(s.executed)}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap font-semibold">{fmtEuro(s.agreedValue - s.executed)}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${s.status === 'validado' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                                {s.status === 'validado' ? 'Validado' : 'Rascunho'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ObrasPrintReport({ data, onClose }: { data: ObrasReportData; onClose: () => void }) {
  useEffect(() => {
    const s = document.createElement('style')
    s.id = 'encivil-print-css-obras'
    s.textContent = `
      @media print {
        body > *:not(#encivil-print-root-obras) { display: none !important; }
        #encivil-print-root-obras { display: block !important; position: static !important; overflow: visible !important; }
        #encivil-print-root-obras * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        .no-print { display: none !important; }
        @page { margin: 12mm 15mm; size: A4 portrait; }
      }
    `
    document.head.appendChild(s)
    return () => { document.getElementById('encivil-print-css-obras')?.remove() }
  }, [])

  const linhas = data.linhas
  const totalOrcamento = linhas.reduce((s, l) => s + (l.orcamento ?? 0), 0)
  const totalCusto     = linhas.reduce((s, l) => s + l.custoTotal, 0)
  const totalMargem    = totalOrcamento - totalCusto
  const comSubs = linhas.filter(l => l.subs.length > 0)
  const a = analiseObras(linhas)
  const today = fmt(new Date())

  const NAVY = '#1e3a8a', GREEN = '#16a34a', RED = '#dc2626', AMBER = '#b45309', SLATE = '#64748b', LIGHT = '#f8fafc', BORDER = '#e2e8f0'

  return createPortal(
    <div id="encivil-print-root-obras" style={{ position: 'fixed', inset: 0, background: 'white', zIndex: 9999, overflowY: 'auto' }}>
      <div className="no-print" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'white', borderBottom: `1px solid ${BORDER}`, padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText style={{ width: 16, height: 16, color: NAVY }} />
          <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>Pré-visualização · Relatório de Obras ENCIVIL</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13, background: 'white', cursor: 'pointer', color: '#374151' }}>
            <X style={{ width: 14, height: 14 }} /> Fechar
          </button>
          <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', background: NAVY, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Printer style={{ width: 14, height: 14 }} /> Imprimir / Salvar PDF
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 794, margin: '0 auto', background: 'white', padding: '0 0 40px' }}>
        <div style={{ background: NAVY, color: 'white', padding: '24px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ background: 'white', borderRadius: 10, padding: 6, width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src="/icone_oficial.png" alt="ENCIVIL" style={{ width: 40, height: 40, objectFit: 'contain' }} />
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>ENCIVIL</div>
                <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>Relatório de Obras</div>
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 12, opacity: 0.7 }}>Gerado em {today}</div>
          </div>
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.2)', display: 'flex', gap: 28, fontSize: 12, opacity: 0.85 }}>
            <span>Orçamento: <strong>{fmtEuro(totalOrcamento)}</strong></span>
            <span>Custo real: <strong style={{ color: '#fca5a5' }}>{fmtEuro(totalCusto)}</strong></span>
            <span>Margem: <strong style={{ color: totalMargem >= 0 ? '#86efac' : '#fca5a5' }}>{fmtEuro(totalMargem)}{a.margemPct != null ? ` (${fmtPct(a.margemPct)})` : ''}</strong></span>
          </div>
        </div>

        {/* Análise executiva */}
        {a.comOrc.length > 0 && (
          <div style={{ padding: '24px 32px 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 4, height: 20, background: NAVY, borderRadius: 2 }} />
              <span style={{ fontWeight: 700, fontSize: 13, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Análise Executiva</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#374151', lineHeight: 1.7 }}>
              <li>Margem global de <strong style={{ color: a.totalMargem >= 0 ? GREEN : RED }}>{fmtEuro(a.totalMargem)}{a.margemPct != null ? ` (${fmtPct(a.margemPct)})` : ''}</strong> em {a.comOrc.length} obra(s) com orçamento.</li>
              {a.noVermelho.length > 0 && (
                <li style={{ color: RED }}><strong>{a.noVermelho.length} obra(s) a dar prejuízo:</strong> {a.noVermelho.map(l => l.obra.name).join(', ')}.</li>
              )}
              {a.emRisco.length > 0 && (
                <li style={{ color: AMBER }}><strong>{a.emRisco.length} obra(s) em risco de estouro</strong> (custo ≥ 85% do orçamento): {a.emRisco.map(l => l.obra.name).join(', ')}.</li>
              )}
              {a.melhor && (
                <li>Melhor margem: <strong>{a.melhor.l.obra.name}</strong> ({fmtPct(a.melhor.pct)}){a.pior ? <> · Pior: <strong>{a.pior.l.obra.name}</strong> ({fmtPct(a.pior.pct)})</> : null}.</li>
              )}
              {a.noVermelho.length === 0 && a.emRisco.length === 0 && (
                <li style={{ color: GREEN }}>Todas as obras com orçamento estão dentro do previsto.</li>
              )}
            </ul>
          </div>
        )}

        <div style={{ padding: '20px 32px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 4, height: 20, background: NAVY, borderRadius: 2 }} />
            <span style={{ fontWeight: 700, fontSize: 13, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Custos por Obra</span>
          </div>
          {linhas.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: SLATE, fontSize: 13, background: LIGHT, borderRadius: 10, border: `1px solid ${BORDER}` }}>
              Ainda não há obras.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: NAVY, color: 'white' }}>
                  {['Obra', 'Materiais', 'Subs', 'Combust.', 'Custo Real', 'Orçamento', 'Margem'].map((h, i) => (
                    <th key={h} style={{ padding: '9px 10px', textAlign: i === 0 ? 'left' : 'right', fontWeight: 600, fontSize: 10.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={l.obra.id} style={{ background: i % 2 === 0 ? 'white' : LIGHT }}>
                    <td style={{ padding: '8px 10px', borderBottom: `1px solid ${BORDER}` }}>{l.obra.name}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: SLATE, borderBottom: `1px solid ${BORDER}` }}>{fmtEuro(l.materiais)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: SLATE, borderBottom: `1px solid ${BORDER}` }}>{fmtEuro(l.subExecutado)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: SLATE, borderBottom: `1px solid ${BORDER}` }}>{fmtEuro(l.combustivel)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, borderBottom: `1px solid ${BORDER}` }}>{fmtEuro(l.custoTotal)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: `1px solid ${BORDER}` }}>{l.orcamento != null ? fmtEuro(l.orcamento) : '—'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: l.margem == null ? SLATE : l.margem >= 0 ? GREEN : '#dc2626', borderBottom: `1px solid ${BORDER}` }}>{l.margem != null ? fmtEuro(l.margem) : '—'}</td>
                  </tr>
                ))}
                <tr style={{ background: '#eef2ff', fontWeight: 700 }}>
                  <td style={{ padding: '9px 10px' }} colSpan={4}>TOTAL</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmtEuro(totalCusto)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmtEuro(totalOrcamento)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', color: totalMargem >= 0 ? GREEN : '#dc2626' }}>{fmtEuro(totalMargem)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        {/* Subempreiteiros por Obra */}
        {comSubs.length > 0 && (
          <div style={{ padding: '0 32px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 4, height: 20, background: NAVY, borderRadius: 2 }} />
              <span style={{ fontWeight: 700, fontSize: 13, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Subempreiteiros por Obra</span>
            </div>
            {comSubs.map(l => (
              <div key={l.obra.id} style={{ marginBottom: 18, breakInside: 'avoid' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>
                  {l.obra.name}
                  <span style={{ fontWeight: 500, color: SLATE }}>
                    {'  '}· Contratado {fmtEuro(l.contratado)} · Executado {fmtEuro(l.subExecutado)} · Falta {fmtEuro(l.contratado - l.subExecutado)}
                  </span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                  <thead>
                    <tr style={{ background: LIGHT, color: SLATE }}>
                      {['Subempreiteiro', 'Estado', 'Contratado', 'Executado', 'Falta'].map((h, i) => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: i <= 1 ? 'left' : 'right', fontWeight: 600, fontSize: 10, borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {l.subs.map(s => (
                      <tr key={s.id}>
                        <td style={{ padding: '6px 10px', borderBottom: `1px solid ${BORDER}` }}>{s.name}</td>
                        <td style={{ padding: '6px 10px', borderBottom: `1px solid ${BORDER}`, color: s.status === 'validado' ? GREEN : '#b45309' }}>{s.status === 'validado' ? 'Validado' : 'Rascunho'}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', borderBottom: `1px solid ${BORDER}` }}>{fmtEuro(s.agreedValue)}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: GREEN, borderBottom: `1px solid ${BORDER}` }}>{fmtEuro(s.executed)}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, borderBottom: `1px solid ${BORDER}` }}>{fmtEuro(s.agreedValue - s.executed)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        <div style={{ borderTop: `3px solid ${NAVY}`, margin: '0 32px', padding: '14px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: SLATE }}>
          <span>Gerado automaticamente pelo ENCIVIL Gestão</span>
          <span style={{ fontWeight: 600 }}>© 2026 ENCIVIL</span>
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
      @media print {
        body > *:not(#encivil-print-root-comb) { display: none !important; }
        #encivil-print-root-comb { display: block !important; position: static !important; overflow: visible !important; }
        #encivil-print-root-comb * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        .no-print { display: none !important; }
        @page { margin: 12mm 15mm; size: A4 portrait; }
      }
    `
    document.head.appendChild(s)
    return () => { document.getElementById('encivil-print-css-comb')?.remove() }
  }, [])

  const linhas = data.linhas
  const totalCusto = linhas.reduce((s, l) => s + l.custo, 0)
  const totalLitros = linhas.reduce((s, l) => s + l.litros, 0)
  const precoMedio = totalLitros > 0 ? totalCusto / totalLitros : 0
  const today = fmt(new Date())
  const NAVY = '#1e3a8a', SLATE = '#64748b', LIGHT = '#f8fafc', BORDER = '#e2e8f0'

  return createPortal(
    <div id="encivil-print-root-comb" style={{ position: 'fixed', inset: 0, background: 'white', zIndex: 9999, overflowY: 'auto' }}>
      <div className="no-print" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'white', borderBottom: `1px solid ${BORDER}`, padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText style={{ width: 16, height: 16, color: NAVY }} />
          <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>Pré-visualização · Relatório de Combustível ENCIVIL</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13, background: 'white', cursor: 'pointer', color: '#374151' }}>
            <X style={{ width: 14, height: 14 }} /> Fechar
          </button>
          <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', background: NAVY, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Printer style={{ width: 14, height: 14 }} /> Imprimir / Salvar PDF
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 794, margin: '0 auto', background: 'white', padding: '0 0 40px' }}>
        <div style={{ background: NAVY, color: 'white', padding: '24px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ background: 'white', borderRadius: 10, padding: 6, width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src="/icone_oficial.png" alt="ENCIVIL" style={{ width: 40, height: 40, objectFit: 'contain' }} />
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>ENCIVIL</div>
                <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>Relatório de Combustível</div>
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 12, opacity: 0.7 }}>Gerado em {today}</div>
          </div>
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.2)', display: 'flex', gap: 28, fontSize: 12, opacity: 0.85 }}>
            <span>Total: <strong>{fmtEuro(totalCusto)}</strong></span>
            <span>Litros: <strong>{fmtNumber(totalLitros)} L</strong></span>
            <span>Preço médio: <strong style={{ color: '#fde68a' }}>{fmtEuro(precoMedio)}/L</strong></span>
          </div>
        </div>

        <div style={{ padding: '28px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 4, height: 20, background: NAVY, borderRadius: 2 }} />
            <span style={{ fontWeight: 700, fontSize: 13, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Consumo por Viatura</span>
          </div>
          {linhas.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: SLATE, fontSize: 13, background: LIGHT, borderRadius: 10, border: `1px solid ${BORDER}` }}>Sem abastecimentos.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: NAVY, color: 'white' }}>
                  {['Viatura', 'Abast.', 'Litros', 'Custo', '€/L'].map((h, i) => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: i === 0 ? 'left' : 'right', fontWeight: 600, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={l.id} style={{ background: i % 2 === 0 ? 'white' : LIGHT }}>
                    <td style={{ padding: '9px 12px', borderBottom: `1px solid ${BORDER}` }}>{l.nome} ({l.codigo})</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', color: SLATE, borderBottom: `1px solid ${BORDER}` }}>{l.numAbast}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', borderBottom: `1px solid ${BORDER}` }}>{fmtNumber(l.litros)} L</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, borderBottom: `1px solid ${BORDER}` }}>{fmtEuro(l.custo)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', color: SLATE, borderBottom: `1px solid ${BORDER}` }}>{fmtEuro(l.precoMedio)}</td>
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

        <div style={{ borderTop: `3px solid ${NAVY}`, margin: '0 32px', padding: '14px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: SLATE }}>
          <span>Gerado automaticamente pelo ENCIVIL Gestão</span>
          <span style={{ fontWeight: 600 }}>© 2026 ENCIVIL</span>
        </div>
      </div>
    </div>,
    document.body
  )
}

/* ─── Página principal ──────────────────────────────────────────── */

export function ReportsPage() {
  const [reportType, setReportType] = useState<'stock' | 'ferramentas' | 'obras' | 'combustivel'>('stock')
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

  const [obrasLoading, setObrasLoading] = useState(true)
  const [obrasLinhas, setObrasLinhas] = useState<ObraLinha[]>([])
  const [showObrasPrint, setShowObrasPrint] = useState(false)

  const [combLoading, setCombLoading] = useState(true)
  const [combLinhas, setCombLinhas] = useState<VeiculoConsumo[]>([])
  const [showCombPrint, setShowCombPrint] = useState(false)

  const [sharingWA, setSharingWA] = useState(false)

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
      const isoInicio = inicio.toISOString().split('T')[0]
      const isoFim    = fim.toISOString().split('T')[0]
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

      window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank')
    } catch {
      toast.error('Erro inesperado ao preparar partilha.')
    } finally {
      setSharingWA(false)
    }
  }

  useEffect(() => {
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
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [period])

  useEffect(() => {
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
      .catch(() => {})
      .finally(() => { if (!cancelled) setToolsLoading(false) })
    return () => { cancelled = true }
  }, [toolsPeriod])

  useEffect(() => {
    let cancelled = false
    setObrasLoading(true)
    Promise.all([listarObras(false), listarSubempreiteirosComExecutado(), custosMateriaisCombustivelPorObra()])
      .then(([obras, subs, matComb]) => {
        if (cancelled) return
        const linhas: ObraLinha[] = obras
          .filter(obra => obra.active) // portefólio: todas as não-arquivadas (ativas + concluídas)
          .map(obra => {
            const daObra = subs.filter(s => s.obraId === obra.id)
            const contratado = daObra.reduce((sum, s) => sum + s.agreedValue, 0)
            const subExecutado = daObra.reduce((sum, s) => sum + s.executed, 0)
            const parcial = matComb[obra.id] ?? { materiais: 0, combustivel: 0 }
            const custoTotal = parcial.materiais + subExecutado + parcial.combustivel
            const orcamento = obra.budget
            return {
              obra,
              subs: daObra,
              contratado,
              materiais: parcial.materiais,
              subExecutado,
              combustivel: parcial.combustivel,
              custoTotal,
              orcamento,
              margem: orcamento != null ? orcamento - custoTotal : undefined,
            }
          })
          // ativas primeiro, depois por maior custo
          .sort((a, b) => {
            if (a.obra.status !== b.obra.status) return a.obra.status === 'ativa' ? -1 : 1
            return b.custoTotal - a.custoTotal
          })
        setObrasLinhas(linhas)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setObrasLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
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
      .catch(() => {})
      .finally(() => { if (!cancelled) setCombLoading(false) })
    return () => { cancelled = true }
  }, [])

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
        : m.date.toISOString().split('T')[0]
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
    { name: 'Normal',      value: products.filter(p => p.status === 'normal').length,    color: '#16a34a' },
    { name: 'Stock Baixo', value: products.filter(p => p.status === 'baixo').length,     color: '#f59e0b' },
    { name: 'Sem Stock',   value: products.filter(p => p.status === 'sem-stock').length, color: '#dc2626' },
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
      <div className="bg-gradient-to-br from-primary to-primary/80 rounded-2xl p-5 md:p-6 text-white shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-2.5 shrink-0">
              <img src="/icone_oficial.png" alt="ENCIVIL" className="w-10 h-10 object-contain" draggable={false} />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold leading-tight">Relatório Executivo</h1>
              <p className="text-white/70 text-sm mt-0.5">
                {reportType === 'stock' ? 'Análise de armazém' : reportType === 'ferramentas' ? 'Análise de ferramentas' : reportType === 'obras' ? 'Análise de obras' : 'Análise de combustível'} · ENCIVIL
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {reportType === 'stock' && (
              <select
                value={period}
                onChange={e => setPeriod(e.target.value as Period)}
                className="px-3 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/50"
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
                className="px-3 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/50"
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
              className="flex items-center gap-2 px-3 py-2 bg-[#25D366] hover:bg-[#20BD5C] text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-60"
              title="Partilhar resumo semanal no WhatsApp"
            >
              <Share2 className={`w-4 h-4 ${sharingWA ? 'animate-pulse' : ''}`} />
              <span className="hidden sm:inline">{sharingWA ? 'A preparar…' : 'WhatsApp'}</span>
            </button>
            <button
              onClick={() => reportType === 'stock' ? setShowPrint(true) : reportType === 'ferramentas' ? setShowToolsPrint(true) : reportType === 'obras' ? setShowObrasPrint(true) : setShowCombPrint(true)}
              className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/30 rounded-xl text-sm font-medium transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Exportar PDF</span>
            </button>
          </div>
        </div>
        <p className="text-white/60 text-xs mt-3">
          {reportType === 'stock'
            ? `${periodLabel} · comparado com ${prevLabel}`
            : reportType === 'ferramentas'
            ? `${getPeriodConfig(toolsPeriod).label} · comparado com ${getPeriodConfig(toolsPeriod).prevLabel}`
            : reportType === 'obras'
            ? 'Situação atual · orçamento vs. custo real'
            : 'Consumo acumulado por viatura'}
        </p>
      </div>

      {/* ── Switcher Stock / Ferramentas / Obras ──────────── */}
      <div className="flex flex-wrap gap-2 bg-card rounded-2xl border border-border p-1.5 w-fit max-w-full">
        <button
          onClick={() => setReportType('stock')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
            reportType === 'stock' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Boxes className="w-4 h-4" /> Stock
        </button>
        <button
          onClick={() => setReportType('ferramentas')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
            reportType === 'ferramentas' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Wrench className="w-4 h-4" /> Ferramentas
        </button>
        <button
          onClick={() => setReportType('obras')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
            reportType === 'obras' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Building2 className="w-4 h-4" /> Obras
        </button>
        <button
          onClick={() => setReportType('combustivel')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
            reportType === 'combustivel' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Fuel className="w-4 h-4" /> Combustível
        </button>
      </div>

      {reportType === 'obras' && (
        <ObrasReportSection loading={obrasLoading} linhas={obrasLinhas} />
      )}

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
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} interval="preserveStartEnd" tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
              <Line type="monotone" dataKey="Entradas" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 3, fill: '#16a34a' }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="Saídas"   stroke="#dc2626" strokeWidth={2.5} dot={{ r: 3, fill: '#dc2626' }} activeDot={{ r: 5 }} />
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
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number"   tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11, fill: '#1e293b' }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="qty" name="Quantidade" fill="#1e3a8a" radius={[0, 6, 6, 0]} maxBarSize={24} />
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

      {showObrasPrint && (
        <ObrasPrintReport
          data={{ loading: obrasLoading, linhas: obrasLinhas }}
          onClose={() => setShowObrasPrint(false)}
        />
      )}

      {showCombPrint && (
        <CombustivelPrintReport
          data={{ loading: combLoading, linhas: combLinhas }}
          onClose={() => setShowCombPrint(false)}
        />
      )}
    </div>
  )
}
