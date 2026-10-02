import { fmtEuro } from '@/app/lib/format'
import type { SubsPainelTotais } from '../../../db'

function Kpi({ rotulo, valor, detalhe, alerta = false }: { rotulo: string; valor: string; detalhe?: string; alerta?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-card p-3 ${alerta ? 'border-warning/50' : 'border-border'}`}>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums leading-tight">{valor}</dd>
      {detalhe && <p className="mt-0.5 text-xs text-muted-foreground">{detalhe}</p>}
    </div>
  )
}

export function KpisSubs({ totais }: { totais: SubsPainelTotais }) {
  const pctContratado = totais.contratado > 0 ? Math.round((totais.certificado / totais.contratado) * 100) : 0
  return (
    <dl aria-label="Indicadores das subempreitadas" className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <Kpi rotulo="Contratado" valor={fmtEuro(totais.contratado)} detalhe={`Orçamento ligado: ${fmtEuro(totais.orcado_subempreitadas)}`} />
      <Kpi rotulo="Certificado" valor={fmtEuro(totais.certificado)} detalhe={`${pctContratado}% do contratado`} />
      <Kpi rotulo="Pago" valor={fmtEuro(totais.pago)} />
      <Kpi rotulo="Por pagar" valor={fmtEuro(totais.por_pagar)} detalhe="Autos aprovados" />
      <Kpi rotulo="Retenção acumulada" valor={fmtEuro(totais.retencao_acumulada)} detalhe={`Libertada: ${fmtEuro(totais.retencao_libertada)}`} />
      <Kpi rotulo="Em aprovação" valor={fmtEuro(totais.em_aprovacao_valor)} detalhe={`${totais.em_aprovacao_n} ${totais.em_aprovacao_n === 1 ? 'auto' : 'autos'}`} />
      <Kpi rotulo="Glosado" valor={fmtEuro(totais.glosado)} />
      <Kpi rotulo="Taxa de glosa" valor={`${totais.taxa_glosa_pct.toLocaleString('pt-PT', { maximumFractionDigits: 1 })}%`} detalhe="Glosado sobre medido" alerta={totais.taxa_glosa_pct > 10} />
    </dl>
  )
}
