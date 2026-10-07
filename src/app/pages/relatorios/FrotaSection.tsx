import { useMemo } from 'react'
import { Link } from 'react-router'
import { Truck, Wrench, AlertTriangle, ShieldAlert } from 'lucide-react'
import { useAsync } from '@/app/lib/useAsync'
import { listarResumoViaturas } from '@/features/frota/services/frotaService'
import { diasAte } from '@/app/lib/prazoFrota'
import { fmtData } from '@/app/lib/format'
import { KpiCard } from './KpiCard'
import { Carregando, Erro, Vazio, Painel } from './Estado'
import { BotaoPdf, type DadosImpressao } from './RelatorioImpressao'

const ESTADO = { LIVRE: 'Livre', EM_USO: 'Em uso', OFICINA: 'Oficina' } as const
const JANELA_DIAS = 30

// Seguro/IPO: vencido ou a vencer na janela. Calendário civil, não horas (ver prazoFrota.diasAte).
function prazo(data: string | null): { texto: string; urgente: boolean } {
  if (!data) return { texto: '—', urgente: false }
  const d = diasAte(data)
  return { texto: `${fmtData(data)}${d < 0 ? ' (vencido)' : d <= JANELA_DIAS ? ` (${d}d)` : ''}`, urgente: d <= JANELA_DIAS }
}

export function FrotaSection() {
  const { data, loading, error, reload } = useAsync(listarResumoViaturas, [], { errorMsg: 'Erro ao carregar frota', cacheKey: 'relatorio-frota', cacheTtl: 30_000 })
  const v = useMemo(() => data ?? [], [data])
  const k = useMemo(() => ({
    oficina: v.filter(x => x.estado_operacional === 'OFICINA').length,
    emUso: v.filter(x => x.estado_operacional === 'EM_USO').length,
    urgentes: v.reduce((s, x) => s + x.alertas_urgentes, 0),
    prazos: v.filter(x => prazo(x.data_fim_seguro).urgente || prazo(x.data_proxima_ipo).urgente).length,
  }), [v])

  const pdf = (): DadosImpressao => ({
    titulo: 'Relatório de Frota', subtitulo: `${v.length} viaturas e máquinas`,
    kpis: [
      { label: 'Viaturas/máquinas', value: String(v.length) }, { label: 'Em uso', value: String(k.emUso) },
      { label: 'Em oficina', value: String(k.oficina) }, { label: 'Alertas urgentes', value: String(k.urgentes) },
    ],
    tabelas: [{
      titulo: 'Viaturas', colunas: ['Código', 'Viatura', 'Estado', 'Obra', 'Condutor', 'Seguro', 'IPO', 'Alertas'],
      linhas: v.map(x => [x.codigo, x.nome, ESTADO[x.estado_operacional], x.obra_nome ?? '—', x.condutor_nome ?? '—',
        prazo(x.data_fim_seguro).texto, prazo(x.data_proxima_ipo).texto, `${x.alertas_urgentes} urg. / ${x.alertas_atencao} aten.`]),
    }],
  })

  if (loading && !data) return <Carregando />
  if (error) return <Erro mensagem={error} onRetry={reload} />
  if (v.length === 0) return <Vazio texto="Ainda não há viaturas registadas." />

  return (
    <div className="space-y-6 pb-8">
      <div className="flex justify-end"><BotaoPdf gerar={pdf} /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <KpiCard label="Viaturas / máquinas" value={v.length} icon={Truck} iconBg="bg-primary/10" valueColor="text-primary" to="/frota" />
        <KpiCard label="Em oficina" value={k.oficina} icon={Wrench} iconBg="bg-warning/10" valueColor="text-warning" to="/frota/manutencao" />
        <KpiCard label="Alertas urgentes" value={k.urgentes} icon={AlertTriangle} iconBg="bg-destructive/10" valueColor="text-destructive" to="/alertas" />
        <KpiCard label={`Seguro/IPO a vencer (${JANELA_DIAS}d)`} value={k.prazos} icon={ShieldAlert} iconBg="bg-warning/10" valueColor="text-warning" />
      </div>
      <Painel titulo="Viaturas" subtitulo="Estado operacional, condutor e prazos legais">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50"><tr>
              {['Viatura', 'Estado', 'Obra', 'Condutor', 'Seguro', 'IPO', 'Alertas'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-border">
              {v.map(x => {
                const seg = prazo(x.data_fim_seguro), ipo = prazo(x.data_proxima_ipo)
                return (
                  <tr key={x.id} className="hover:bg-accent/40 transition-colors">
                    <td className="px-4 py-3 font-medium"><Link to={`/frota/viatura/${x.id}`} className="hover:underline">{x.nome}</Link> <span className="text-xs text-muted-foreground">{x.codigo}</span></td>
                    <td className="px-4 py-3 whitespace-nowrap">{ESTADO[x.estado_operacional]}</td>
                    <td className="px-4 py-3">{x.obra_id ? <Link to={`/obras/${x.obra_id}`} className="hover:underline">{x.obra_nome}</Link> : '—'}</td>
                    <td className="px-4 py-3">{x.condutor_nome ?? '—'}</td>
                    <td className={`px-4 py-3 whitespace-nowrap ${seg.urgente ? 'text-destructive font-semibold' : ''}`}>{seg.texto}</td>
                    <td className={`px-4 py-3 whitespace-nowrap ${ipo.urgente ? 'text-destructive font-semibold' : ''}`}>{ipo.texto}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {x.alertas_urgentes > 0 && <span className="text-destructive font-semibold">{x.alertas_urgentes} urg.</span>}
                      {x.alertas_urgentes > 0 && x.alertas_atencao > 0 && ' · '}
                      {x.alertas_atencao > 0 && <span className="text-warning">{x.alertas_atencao} aten.</span>}
                      {x.alertas_urgentes === 0 && x.alertas_atencao === 0 && <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Painel>
    </div>
  )
}
