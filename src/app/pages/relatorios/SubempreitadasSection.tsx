import { Link } from 'react-router'
import { HardHat, Wallet, Banknote, Percent } from 'lucide-react'
import { useAsync } from '@/app/lib/useAsync'
import { buscarPainelCeo, listarFluxoCaixa } from '@/features/obras/services/subsControloService'
import { fmtEuro, fmtData } from '@/app/lib/format'
import { KpiCard } from './KpiCard'
import { Carregando, Erro, Vazio, Painel } from './Estado'
import { BotaoPdf, type DadosImpressao } from './RelatorioImpressao'

const COR_SAUDE = { ok: 'text-success', atencao: 'text-warning', critico: 'text-destructive' } as const

export function SubempreitadasSection() {
  const { data, loading, error, reload } = useAsync(
    async () => { const [painel, fluxo] = await Promise.all([buscarPainelCeo(null), listarFluxoCaixa(null, 8)]); return { painel, fluxo } },
    [], { errorMsg: 'Erro ao carregar subempreitadas', cacheKey: 'relatorio-subs', cacheTtl: 30_000 },
  )

  if (loading && !data) return <Carregando />
  if (error || !data) return <Erro mensagem={error ?? 'Sem dados'} onRetry={reload} />
  const { painel, fluxo } = data
  const t = painel.totais
  if (painel.por_sub.length === 0) return <Vazio texto="Ainda não há subempreiteiros com contrato validado." />

  const pdf = (): DadosImpressao => ({
    titulo: 'Relatório de Subempreitadas', subtitulo: 'Contratos validados e ativos',
    kpis: [
      { label: 'Contratado', value: fmtEuro(t.contratado) }, { label: 'Certificado', value: fmtEuro(t.certificado) },
      { label: 'Pago', value: fmtEuro(t.pago) }, { label: 'Por pagar', value: fmtEuro(t.por_pagar) },
      { label: 'Retenção acumulada', value: fmtEuro(t.retencao_acumulada) }, { label: 'Glosado', value: fmtEuro(t.glosado) },
      { label: 'Taxa de glosa', value: `${Number(t.taxa_glosa_pct).toFixed(1)}%` }, { label: 'Em aprovação', value: `${t.em_aprovacao_n} (${fmtEuro(t.em_aprovacao_valor)})` },
    ],
    tabelas: [
      { titulo: 'Por subempreiteiro', colunas: ['Subempreiteiro', 'Obra', 'Contratado', 'Certificado', 'Por pagar', 'Glosado', 'Documentos'],
        linhas: painel.por_sub.map(s => [s.nome, s.obra_nome, fmtEuro(s.contratado), fmtEuro(s.certificado), fmtEuro(s.por_pagar), fmtEuro(s.glosado), s.docs_estado]) },
      { titulo: 'Alertas', colunas: ['Gravidade', 'Alerta'], linhas: painel.alertas.map(a => [a.gravidade, a.texto]), vazio: 'Sem alertas' },
      { titulo: 'Fluxo de caixa (próximas semanas)', colunas: ['Semana de', 'Aprovado', 'Em aprovação', 'Autos'],
        linhas: fluxo.map(f => [fmtData(f.semana_inicio), fmtEuro(f.aprovado), fmtEuro(f.em_aprovacao), String(f.n_autos)]) },
    ],
  })

  return (
    <div className="space-y-6 pb-8">
      <div className="flex justify-end"><BotaoPdf gerar={pdf} /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <KpiCard label="Contratado" value={fmtEuro(t.contratado)} icon={HardHat} iconBg="bg-primary/10" valueColor="text-primary" to="/obras/subempreitadas" />
        <KpiCard label="Certificado" value={fmtEuro(t.certificado)} icon={Wallet} iconBg="bg-success/10" valueColor="text-success" />
        <KpiCard label="Por pagar" value={fmtEuro(t.por_pagar)} icon={Banknote} iconBg="bg-warning/10" valueColor="text-warning" />
        <KpiCard label={`Glosado (${Number(t.taxa_glosa_pct).toFixed(1)}%)`} value={fmtEuro(t.glosado)} icon={Percent} iconBg="bg-destructive/10" valueColor="text-destructive" />
      </div>

      {painel.alertas.length > 0 && (
        <Painel titulo="Alertas" subtitulo={`${painel.passivo_documental.subs_com_pendencia} subempreiteiro(s) com pendência documental · ${fmtEuro(painel.passivo_documental.valor_por_pagar_em_risco)} por pagar em risco`}>
          <ul className="divide-y divide-border">
            {painel.alertas.map((a, i) => (
              <li key={i} className="px-5 py-3 text-sm flex items-start gap-2">
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${a.gravidade === 'alta' ? 'bg-destructive' : a.gravidade === 'media' ? 'bg-warning' : 'bg-muted-foreground'}`} />
                {a.sub_id ? <Link to={`/obras/subempreitada/${a.sub_id}`} className="hover:underline">{a.texto}</Link> : a.texto}
              </li>
            ))}
          </ul>
        </Painel>
      )}

      <Painel titulo="Por subempreiteiro">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50"><tr>
              {['Subempreiteiro', 'Obra', 'Contratado', 'Certificado', 'Por pagar', 'Glosado', 'Saúde'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-border">
              {painel.por_sub.map(s => (
                <tr key={s.sub_id} className="hover:bg-accent/40 transition-colors">
                  <td className="px-4 py-3 font-medium"><Link to={`/obras/subempreitada/${s.sub_id}`} className="hover:underline">{s.nome}</Link></td>
                  <td className="px-4 py-3"><Link to={`/obras/${s.obra_id}`} className="hover:underline">{s.obra_nome}</Link></td>
                  <td className="px-4 py-3 whitespace-nowrap">{fmtEuro(s.contratado)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{fmtEuro(s.certificado)}</td>
                  <td className="px-4 py-3 whitespace-nowrap font-semibold">{fmtEuro(s.por_pagar)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{fmtEuro(s.glosado)}</td>
                  <td className={`px-4 py-3 font-semibold ${COR_SAUDE[s.saude]}`}>{s.saude === 'ok' ? 'OK' : s.saude === 'atencao' ? 'Atenção' : 'Crítico'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Painel>

      {fluxo.length > 0 && (
        <Painel titulo="Fluxo de caixa" subtitulo="Pagamentos previstos por semana">
          <div className="divide-y divide-border">
            {fluxo.map(f => (
              <div key={f.semana_inicio} className="px-5 py-3 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Semana de {fmtData(f.semana_inicio)} · {f.n_autos} auto(s)</span>
                <span><strong>{fmtEuro(f.aprovado)}</strong> <span className="text-xs text-muted-foreground">+ {fmtEuro(f.em_aprovacao)} em aprovação</span></span>
              </div>
            ))}
          </div>
        </Painel>
      )}
    </div>
  )
}
