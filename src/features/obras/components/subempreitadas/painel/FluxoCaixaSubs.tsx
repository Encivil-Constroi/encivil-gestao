import { fmtData, fmtDataCurta, fmtEuro } from '@/app/lib/format'
import type { FluxoCaixaSemana } from '../../../db'

const LARGURA = 40
const ALTURA = 120
const TOPO = 16

function compacto(v: number): string {
  if (v >= 1000) return `${(v / 1000).toLocaleString('pt-PT', { maximumFractionDigits: 1 })}k`
  return Math.round(v).toString()
}

export function FluxoCaixaSubs({ fluxo }: { fluxo: FluxoCaixaSemana[] }) {
  const total = fluxo.reduce((s, f) => s + f.aprovado + f.em_aprovacao, 0)
  if (!fluxo.length || total <= 0) return <p className="text-sm text-muted-foreground">Sem pagamentos previstos nas próximas semanas.</p>
  const max = Math.max(...fluxo.map(f => f.aprovado + f.em_aprovacao))
  const escala = (v: number) => (v / max) * ALTURA
  const totalAprovado = fluxo.reduce((s, f) => s + f.aprovado, 0)
  const totalEstimado = fluxo.reduce((s, f) => s + f.em_aprovacao, 0)
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Previsto nas próximas {fluxo.length} semanas: <strong>{fmtEuro(totalAprovado)}</strong> aprovado
        {totalEstimado > 0 && <> e <strong>{fmtEuro(totalEstimado)}</strong> estimado (em aprovação)</>}. Autos vencidos contam na 1.ª semana.
      </p>
      <svg viewBox={`0 0 ${fluxo.length * LARGURA} ${TOPO + ALTURA + 18}`} className="w-full" role="img"
        aria-label={`Fluxo de caixa previsto: ${fmtEuro(totalAprovado)} aprovado e ${fmtEuro(totalEstimado)} estimado em ${fluxo.length} semanas`}>
        <line x1="0" x2={fluxo.length * LARGURA} y1={TOPO + ALTURA} y2={TOPO + ALTURA} className="stroke-border" strokeWidth="1" />
        {fluxo.map((f, i) => {
          const x = i * LARGURA + 8
          const hA = escala(f.aprovado)
          const hE = escala(f.em_aprovacao)
          const yA = TOPO + ALTURA - hA
          const yE = yA - hE
          const soma = f.aprovado + f.em_aprovacao
          return (
            <g key={f.semana_inicio}>
              <title>{`Semana de ${fmtData(f.semana_inicio)}: ${fmtEuro(f.aprovado)} aprovado, ${fmtEuro(f.em_aprovacao)} estimado, ${f.n_autos} ${f.n_autos === 1 ? 'auto' : 'autos'}`}</title>
              {hA > 0 && <rect x={x} y={yA} width={LARGURA - 16} height={hA} rx="2" className="fill-primary" />}
              {hE > 0 && <rect x={x} y={yE} width={LARGURA - 16} height={hE} rx="2" className="fill-primary/25 stroke-primary" strokeWidth="1" strokeDasharray="3 2" />}
              {soma > 0 && <text x={x + (LARGURA - 16) / 2} y={yE - 3} textAnchor="middle" className="fill-foreground" fontSize="9">{compacto(soma)}</text>}
              <text x={x + (LARGURA - 16) / 2} y={TOPO + ALTURA + 12} textAnchor="middle" className="fill-muted-foreground" fontSize="8">{fmtDataCurta(f.semana_inicio)}</text>
            </g>
          )
        })}
      </svg>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legenda">
        <li className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-primary" aria-hidden="true" /> Aprovado (a pagar)</li>
        <li className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm border border-dashed border-primary bg-primary/25" aria-hidden="true" /> Estimado (em aprovação)</li>
      </ul>
      <table className="sr-only">
        <caption>Fluxo de caixa semanal previsto</caption>
        <thead><tr><th>Semana</th><th>Aprovado</th><th>Estimado</th><th>Autos</th></tr></thead>
        <tbody>{fluxo.map(f => <tr key={f.semana_inicio}><td>{fmtData(f.semana_inicio)}</td><td>{fmtEuro(f.aprovado)}</td><td>{fmtEuro(f.em_aprovacao)}</td><td>{f.n_autos}</td></tr>)}</tbody>
      </table>
    </div>
  )
}
