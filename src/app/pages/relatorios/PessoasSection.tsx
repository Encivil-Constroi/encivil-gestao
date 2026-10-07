import { Link } from 'react-router'
import { Users, Clock, UserX, ShieldAlert } from 'lucide-react'
import { useAsync } from '@/app/lib/useAsync'
import { fmtNumber } from '@/app/lib/format'
import type { Period } from '@/app/lib/relatorios/periodo'
import { intervaloDatas } from '@/app/lib/relatorios/periodo'
import { KpiCard } from './KpiCard'
import { Carregando, Erro, Painel } from './Estado'
import { BotaoPdf, type DadosImpressao } from './RelatorioImpressao'
import { carregarPessoas } from './dados'

export function PessoasSection({ period, periodLabel }: { period: Period; periodLabel: string }) {
  const { data, loading, error, reload } = useAsync(
    () => { const { ini, fim } = intervaloDatas(period); return carregarPessoas(ini, fim) },
    [period], { errorMsg: 'Erro ao carregar dados de pessoas' },
  )

  if (loading && !data) return <Carregando />
  if (error || !data) return <Erro mensagem={error ?? 'Sem dados'} onRetry={reload} />

  const desvio = data.horasEfetivas - data.horasPrevistas
  const pdf = (): DadosImpressao => ({
    titulo: 'Relatório de Pessoas', subtitulo: periodLabel,
    kpis: [
      { label: 'Colaboradores ativos', value: String(data.colaboradoresAtivos) },
      { label: 'Horas efetivas / previstas', value: `${fmtNumber(data.horasEfetivas)} / ${fmtNumber(data.horasPrevistas)}` },
      { label: 'Suplementares propostas / validadas', value: `${fmtNumber(data.horasSuplPropostas)} / ${fmtNumber(data.horasSuplValidadas)}` },
      { label: 'Faltas (injustificadas)', value: `${data.faltas.total} (${data.faltas.injustificadas})` },
    ],
    tabelas: [{
      titulo: 'Validades a acompanhar (EPIs, formações, documentos)', colunas: ['Gravidade', 'Pessoa/Item', 'Detalhe'],
      linhas: data.alertasRh.map(a => [a.severidade === 'URGENTE' ? 'Urgente' : 'Atenção', a.entidadeNome ?? '—', a.entidadeDetalhe ?? '']),
      vazio: 'Sem validades a expirar',
    }],
  })

  return (
    <div className="space-y-6 pb-8">
      <div className="flex justify-end"><BotaoPdf gerar={pdf} /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <KpiCard label="Colaboradores ativos" value={data.colaboradoresAtivos} icon={Users} iconBg="bg-primary/10" valueColor="text-primary" to="/colaboradores" />
        <KpiCard label={`Horas efetivas (${periodLabel})`} value={`${fmtNumber(data.horasEfetivas)} h`} icon={Clock} iconBg="bg-success/10" valueColor="text-success" to="/rh" />
        <KpiCard label="Faltas no período" value={data.faltas.total} icon={UserX} iconBg="bg-warning/10" valueColor="text-warning" to="/colaboradores?aba=faltas" />
        <KpiCard label="Validades em alerta" value={data.alertasRh.length} icon={ShieldAlert} iconBg="bg-destructive/10" valueColor="text-destructive" to="/alertas" />
      </div>

      <Painel titulo="Assiduidade" subtitulo={`${periodLabel} · ${data.diasRegistados} dia(s) de colaborador registados`}>
        <div className="divide-y divide-border text-sm">
          {[
            ['Horas previstas', `${fmtNumber(data.horasPrevistas)} h`],
            ['Horas efetivas', `${fmtNumber(data.horasEfetivas)} h`],
            ['Desvio (efetivas − previstas)', `${desvio >= 0 ? '+' : ''}${fmtNumber(desvio)} h`],
            ['Suplementares propostas pelo sistema', `${fmtNumber(data.horasSuplPropostas)} h`],
            ['Suplementares validadas pelo gestor', `${fmtNumber(data.horasSuplValidadas)} h`],
            ['Faltas injustificadas', String(data.faltas.injustificadas)],
            ['Faltas à espera de decisão', String(data.faltas.semDecisao)],
          ].map(([l, v]) => (
            <div key={l} className="flex items-center justify-between px-5 py-3"><span className="text-muted-foreground">{l}</span><strong>{v}</strong></div>
          ))}
        </div>
      </Painel>

      <Painel titulo="Validades a acompanhar" subtitulo="EPIs, formações e documentos">
        {data.alertasRh.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma validade a expirar.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.alertasRh.map(a => (
              <li key={a.id} className="px-5 py-3 text-sm flex items-start gap-2">
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${a.severidade === 'URGENTE' ? 'bg-destructive' : 'bg-warning'}`} />
                <Link to="/alertas" className="hover:underline">{a.entidadeNome ?? 'Item'}{a.entidadeDetalhe ? ` — ${a.entidadeDetalhe}` : ''}</Link>
              </li>
            ))}
          </ul>
        )}
      </Painel>
    </div>
  )
}
