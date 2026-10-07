import { useMemo } from 'react'
import { Link } from 'react-router'
import { Building2, Wallet, Banknote, Truck, Boxes, Wrench, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useAsync } from '@/app/lib/useAsync'
import { fmtEuro } from '@/app/lib/format'
import { analiseObras } from '@/app/lib/relatorios/obrasAnalise'
import { construirAtencao } from '@/app/lib/relatorios/atencao'
import { KpiCard } from './KpiCard'
import { Carregando, Erro, Painel } from './Estado'
import { BotaoPdf, type DadosImpressao } from './RelatorioImpressao'
import { carregarVisaoGeral, type Bloco } from './dados'

const GRAV = { alta: 'bg-destructive', media: 'bg-warning', baixa: 'bg-muted-foreground' } as const
const ROTULO = { alta: 'Alta', media: 'Média', baixa: 'Baixa' } as const

const valor = <T,>(b: Bloco<T>): T | undefined => (b.ok ? b.data : undefined)
const indisponivel = (b: Bloco<unknown>) => (b.ok ? null : b.erro)

export function VisaoGeralSection() {
  const { data, loading, error, reload } = useAsync(carregarVisaoGeral, [], { errorMsg: 'Erro ao carregar a visão geral', cacheKey: 'relatorio-visao-geral', cacheTtl: 30_000 })

  const resumo = useMemo(() => {
    if (!data) return null
    const obras = valor(data.obras), subs = valor(data.subs), frota = valor(data.frota)
    const ativas = obras?.filter(o => o.estado === 'ativa') ?? []
    return {
      ativas: ativas.length,
      analise: obras ? analiseObras(obras.filter(o => o.estado !== 'concluida')) : null,
      porPagar: subs?.totais.por_pagar,
      oficina: frota?.filter(v => v.estado_operacional === 'OFICINA').length,
      frotaTotal: frota?.length,
      atencao: construirAtencao({
        obras, subs, frota,
        artigosEmAlerta: valor(data.artigosEmAlerta), ferramentasEmAtraso: valor(data.ferramentasEmAtraso),
      }),
    }
  }, [data])

  if (loading && !data) return <Carregando />
  if (error || !data || !resumo) return <Erro mensagem={error ?? 'Sem dados'} onRetry={reload} />

  const falhas = (['obras', 'subs', 'frota', 'artigosEmAlerta', 'ferramentasEmAtraso'] as const)
    .map(k => ({ k, e: indisponivel(data[k]) })).filter(x => x.e != null)
  const NOME = { obras: 'Obras', subs: 'Subempreitadas', frota: 'Frota', artigosEmAlerta: 'Armazém', ferramentasEmAtraso: 'Ferramentas' } as const
  const a = resumo.analise

  const pdf = (): DadosImpressao => ({
    titulo: 'Relatório Executivo', subtitulo: 'Visão geral da empresa',
    kpis: [
      { label: 'Obras ativas', value: String(resumo.ativas) },
      { label: 'Margem global (obras com orçamento)', value: a ? fmtEuro(a.totalMargem) : '—' },
      { label: 'Por pagar a subempreiteiros', value: resumo.porPagar != null ? fmtEuro(resumo.porPagar) : '—' },
      { label: 'Viaturas em oficina', value: resumo.oficina != null ? `${resumo.oficina}/${resumo.frotaTotal}` : '—' },
    ],
    tabelas: [
      { titulo: 'Requer atenção', colunas: ['Gravidade', 'Módulo', 'Assunto'], linhas: resumo.atencao.map(i => [ROTULO[i.gravidade], i.modulo, i.texto]), vazio: 'Nada a requerer atenção' },
      ...(falhas.length ? [{ titulo: 'Módulos indisponíveis', colunas: ['Módulo', 'Erro'], linhas: falhas.map(f => [NOME[f.k], f.e!]) }] : []),
    ],
  })

  return (
    <div className="space-y-6 pb-8">
      <div className="flex justify-end"><BotaoPdf gerar={pdf} /></div>

      {falhas.length > 0 && (
        <div className="rounded-2xl border border-warning/40 bg-card p-4 text-sm flex items-start gap-3" role="alert">
          <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
          <div className="flex-1">
            <strong>Dados incompletos.</strong> Não foi possível carregar: {falhas.map(f => NOME[f.k]).join(', ')}. Os valores abaixo desses módulos não estão incluídos.
          </div>
          <button onClick={reload} className="px-3 py-1.5 rounded-lg border border-border hover:bg-accent shrink-0">Tentar de novo</button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
        <KpiCard label="Obras ativas" value={data.obras.ok ? resumo.ativas : '—'} icon={Building2} iconBg="bg-primary/10" valueColor="text-primary" to="/obras" />
        <KpiCard label="Margem (obras com orçamento)" value={a ? fmtEuro(a.totalMargem) : '—'} icon={Wallet} iconBg={a && a.totalMargem < 0 ? 'bg-destructive/10' : 'bg-success/10'} valueColor={a && a.totalMargem < 0 ? 'text-destructive' : 'text-success'} />
        <KpiCard label="Por pagar a subempreiteiros" value={resumo.porPagar != null ? fmtEuro(resumo.porPagar) : '—'} icon={Banknote} iconBg="bg-warning/10" valueColor="text-warning" to="/obras/subempreitadas" />
        <KpiCard label="Viaturas em oficina" value={resumo.oficina != null ? `${resumo.oficina}/${resumo.frotaTotal}` : '—'} icon={Truck} iconBg="bg-primary/10" valueColor="text-foreground" to="/frota" />
        <KpiCard label="Artigos em alerta" value={valor(data.artigosEmAlerta) ?? '—'} icon={Boxes} iconBg="bg-warning/10" valueColor="text-warning" to="/armazem" />
        <KpiCard label="Ferramentas em atraso" value={valor(data.ferramentasEmAtraso) ?? '—'} icon={Wrench} iconBg="bg-destructive/10" valueColor="text-destructive" to="/armazem/ferramentas" />
      </div>

      <Painel titulo="Requer atenção" subtitulo="Ordenado por gravidade · clique para abrir o detalhe">
        {resumo.atencao.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-success" /> Nada a requerer atenção nos módulos carregados.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {resumo.atencao.map(i => (
              <li key={i.id}>
                <Link to={i.to} className="px-5 py-3 flex items-center gap-3 text-sm hover:bg-accent/40 transition-colors">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${GRAV[i.gravidade]}`} aria-label={`Gravidade ${ROTULO[i.gravidade]}`} />
                  <span className="text-xs font-semibold text-muted-foreground w-28 shrink-0">{i.modulo}</span>
                  <span className="flex-1">{i.texto}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Painel>
    </div>
  )
}
