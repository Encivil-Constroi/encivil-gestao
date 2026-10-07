import { useMemo } from 'react'
import { Link } from 'react-router'
import { Building2, Wallet, TrendingDown, TrendingUp, AlertTriangle, BarChart3 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useAsync } from '@/app/lib/useAsync'
import { listarPainel } from '@/features/obras/services/obrasService'
import { fmtEuro } from '@/app/lib/format'
import { analiseObras, margemPctDe, saudeMargem, ordenarPortefolio } from '@/app/lib/relatorios/obrasAnalise'
import { KpiCard } from './KpiCard'
import { Carregando, Erro, Vazio, Painel } from './Estado'
import { BotaoPdf, type DadosImpressao } from './RelatorioImpressao'

const COR = { 'sem-dados': 'text-muted-foreground', ok: 'text-success', atencao: 'text-warning', critico: 'text-destructive' } as const
const ESTADO: Record<string, string> = { ativa: 'Ativa', planeada: 'Planeada', suspensa: 'Suspensa', concluida: 'Concluída' }
const pct = (v: number | null) => (v == null ? '—' : `${v.toFixed(1)}%`)

export function ObrasSection() {
  // Fonte única: obras_painel() — o mesmo custo consolidado que a ficha da obra mostra.
  const { data, loading, error, reload } = useAsync(listarPainel, [], { errorMsg: 'Erro ao carregar obras', cacheKey: 'relatorio-obras-painel', cacheTtl: 30_000 })
  const obras = useMemo(() => ordenarPortefolio(data ?? []), [data])
  const a = useMemo(() => analiseObras(obras), [obras])

  const pdf = (): DadosImpressao => ({
    titulo: 'Relatório de Obras', subtitulo: 'Situação atual · orçamento vs. custo',
    kpis: [
      { label: 'Obras', value: String(obras.length) },
      { label: 'Orçamento (obras com orçamento)', value: fmtEuro(a.totalOrcamento) },
      { label: 'Custo total', value: fmtEuro(a.totalCusto) },
      { label: 'Margem', value: fmtEuro(a.totalMargem) },
    ],
    tabelas: [{
      titulo: 'Obras', colunas: ['Obra', 'Estado', 'Orçamento', 'Custo', 'Margem', 'Progresso'],
      linhas: obras.map(o => [o.nome, ESTADO[o.estado] ?? o.estado, o.orcamento != null ? fmtEuro(o.orcamento) : '—', fmtEuro(o.custo_total),
        pct(margemPctDe(o)), o.progresso_pct != null ? `${Math.round(Number(o.progresso_pct))}%` : '—']),
    }],
  })

  if (loading && !data) return <Carregando />
  if (error) return <Erro mensagem={error} onRetry={reload} />
  if (obras.length === 0) return <Vazio texto="Ainda não há obras." />

  const grafico = obras.filter(o => Number(o.orcamento ?? 0) > 0 || Number(o.custo_total) > 0).slice(0, 8).map(o => ({
    name: o.nome.length > 16 ? `${o.nome.slice(0, 15)}…` : o.nome, 'Orçamento': Number(o.orcamento ?? 0), 'Custo': Number(o.custo_total),
  }))

  return (
    <div className="space-y-6 pb-8">
      <div className="flex justify-end"><BotaoPdf gerar={pdf} /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <KpiCard label="Obras" value={obras.length} icon={Building2} iconBg="bg-primary/10" valueColor="text-primary" to="/obras" />
        <KpiCard label="Orçamento" value={fmtEuro(a.totalOrcamento)} icon={Wallet} iconBg="bg-primary/10" valueColor="text-foreground" />
        <KpiCard label="Custo total" value={fmtEuro(a.totalCusto)} icon={TrendingDown} iconBg="bg-destructive/10" valueColor="text-destructive" />
        <KpiCard label="Margem" value={fmtEuro(a.totalMargem)} icon={TrendingUp} iconBg={a.totalMargem >= 0 ? 'bg-success/10' : 'bg-destructive/10'} valueColor={a.totalMargem >= 0 ? 'text-success' : 'text-destructive'} />
      </div>

      <div className="bg-card rounded-2xl border border-border p-5">
        <h2 className="font-semibold text-base mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" /> Análise executiva</h2>
        {a.comOrc.length === 0 ? (
          <p className="text-sm text-muted-foreground">Defina o <strong>orçamento</strong> das obras para ver margem e risco.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            <li>Margem global <strong className={a.totalMargem >= 0 ? 'text-success' : 'text-destructive'}>{fmtEuro(a.totalMargem)}</strong>{a.margemPct != null && <> ({pct(a.margemPct)} do orçamento)</>} em {a.comOrc.length} obra(s) com orçamento.</li>
            {a.noVermelho.length > 0 && <li className="text-destructive"><TrendingDown className="inline w-4 h-4 mr-1" />{a.noVermelho.length} obra(s) acima do orçamento: {a.noVermelho.map(o => o.nome).join(', ')}.</li>}
            {a.emRisco.length > 0 && <li className="text-warning"><AlertTriangle className="inline w-4 h-4 mr-1" />{a.emRisco.length} obra(s) em risco de estouro (custo ≥ 85%): {a.emRisco.map(o => o.nome).join(', ')}.</li>}
            {a.noVermelho.length === 0 && a.emRisco.length === 0 && <li>Todas as obras com orçamento estão dentro do previsto.</li>}
          </ul>
        )}
      </div>

      {grafico.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-5">
          <h2 className="font-semibold text-base mb-4">Orçamento vs. custo</h2>
          <ResponsiveContainer width="100%" height={Math.max(180, grafico.length * 56)}>
            <BarChart data={grafico} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--chart-grid)" />
              <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--chart-text)' }} tickFormatter={v => `${Math.round(Number(v) / 1000)}k`} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: 'var(--chart-text)' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={v => fmtEuro(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--popover)', color: 'var(--popover-foreground)' }} cursor={{ fill: 'var(--muted)' }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Bar dataKey="Orçamento" fill="var(--chart-1)" radius={[0, 4, 4, 0]} barSize={11} />
              <Bar dataKey="Custo" fill="var(--chart-3)" radius={[0, 4, 4, 0]} barSize={11} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <Painel titulo="Obras" subtitulo="Custo consolidado (materiais, combustível, mão de obra, fornecedores e subempreiteiros certificados)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50"><tr>
              {['Obra', 'Estado', 'Orçamento', 'Custo', 'Margem', 'Progresso', 'Equipa', 'Subs.'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-border">
              {obras.map(o => (
                <tr key={o.obra_id} className="hover:bg-accent/40 transition-colors">
                  <td className="px-4 py-3 font-medium"><Link to={`/obras/${o.obra_id}`} className="hover:underline">{o.nome}</Link>{o.cliente && <span className="block text-xs text-muted-foreground">{o.cliente}</span>}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{ESTADO[o.estado] ?? o.estado}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{o.orcamento != null ? fmtEuro(o.orcamento) : '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap font-semibold">{fmtEuro(o.custo_total)}</td>
                  <td className={`px-4 py-3 whitespace-nowrap font-semibold ${COR[saudeMargem(o)]}`}>{pct(margemPctDe(o))}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{o.progresso_pct != null ? `${Math.round(Number(o.progresso_pct))}%` : '—'}</td>
                  <td className="px-4 py-3">{o.equipa_n}</td>
                  <td className="px-4 py-3">{o.subs_n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Painel>
    </div>
  )
}
