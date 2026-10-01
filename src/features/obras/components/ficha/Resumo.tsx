import { Link } from 'react-router'
import { fmtData, fmtEuro } from '@/app/lib/format'
import { useRole } from '@/features/auth/useRole'
import { useVisaoObra } from '../../hooks/useObras'
import { useEventosObra, useUltimosRelatoriosObra } from '../../hooks/useFichaObra'
import { MapaObra } from '../MapaObra'
import { Barra, SaudeBadge, Seccao, Vazio, botaoPrimario, botaoSecundario } from '../ui'
import type { SecaoProps } from './tipos'

export function Resumo({ obraId }: SecaoProps) {
  const { visao: obra, loading, error, reload } = useVisaoObra(obraId)
  const { eventos } = useEventosObra(obraId)
  const { relatorios } = useUltimosRelatoriosObra(obraId)
  const { role } = useRole()
  if (loading && !obra) return <p role="status">A carregar resumo…</p>
  if (error || !obra) return <button type="button" onClick={reload}>{error ?? 'Obra não encontrada.'} · Tentar de novo</button>
  const custoPct = obra.orcamento && obra.orcamento > 0 ? Math.round(obra.custo_total / obra.orcamento * 100) : null
  const podeMedir = role === 'admin' || role === 'gestor' || role === 'medicoes'
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Seccao titulo="Progresso"><p className="text-2xl font-bold">{obra.progresso_pct == null ? '—' : `${Math.round(obra.progresso_pct)}%`}</p><Barra pct={obra.progresso_pct} marca={obra.progresso_esperado_pct} rotulo="Progresso real e previsto" /><p className="text-xs text-muted-foreground">Previsto: {obra.progresso_esperado_pct == null ? '—' : `${Math.round(obra.progresso_esperado_pct)}%`}</p></Seccao>
      <Seccao titulo="Prazo"><p className="text-lg font-semibold">{fmtData(obra.data_prevista_fim)}</p><p className="text-xs text-muted-foreground">Início: {fmtData(obra.data_inicio)}</p></Seccao>
      <Seccao titulo="Orçamento e custo"><p className="text-lg font-semibold">{fmtEuro(obra.custo_total)}</p><p className="text-xs text-muted-foreground">de {obra.orcamento == null ? 'orçamento não definido' : fmtEuro(obra.orcamento)}{custoPct == null ? '' : ` · ${custoPct}%`}</p></Seccao>
      <Seccao titulo="Saúde"><SaudeBadge saude={obra.saude} /><ul className="text-xs text-muted-foreground space-y-1">{obra.motivos.map(m => <li key={m}>{m}</li>)}</ul></Seccao>
    </div>
    <div className="grid gap-4 md:grid-cols-2">
      <Seccao titulo="Localização"><MapaObra latitude={obra.latitude} longitude={obra.longitude} morada={obra.morada ?? obra.localizacao} altura={200} /></Seccao>
      <Seccao titulo="Obra"><dl className="grid grid-cols-2 gap-2 text-sm"><dt className="text-muted-foreground">Cliente</dt><dd>{obra.cliente ?? '—'}</dd><dt className="text-muted-foreground">Responsável</dt><dd>{obra.responsavel_nome ?? '—'}</dd><dt className="text-muted-foreground">Engenheiro</dt><dd>{obra.engenheiro_nome ?? '—'}</dd><dt className="text-muted-foreground">Tipo</dt><dd>{obra.tipo_obra ?? '—'}</dd></dl>{obra.descricao && <p className="text-sm">{obra.descricao}</p>}</Seccao>
    </div>
    <Seccao titulo="Por secção"><div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{([
      ['equipa', 'Equipa', obra.equipa_n], ['frota', 'Frota', obra.viaturas_n], ['ferramentas', 'Ferramentas', obra.ferramentas_n], ['subempreitadas', 'Subempreitadas', obra.subs_n],
      ['relatorios', 'Relatórios', obra.relatorios_n], ['fotos', 'Fotos', obra.fotos_n], ['progresso', 'Aferições', obra.afericoes_n], ['materiais', 'Materiais', null],
    ] as const).map(([sec, nome, n]) => <Link key={sec} to={`/obras/${obraId}?sec=${sec}`} className="rounded-xl border border-border p-3 text-sm hover:bg-accent"><strong className="block">{n ?? '—'}</strong>{nome}</Link>)}</div></Seccao>
    <div className="grid gap-4 md:grid-cols-2">
      <Seccao titulo="Últimos relatórios">{relatorios.length ? <ul className="text-sm space-y-2">{relatorios.map(r => <li key={r.id}><Link className="text-primary hover:underline" to={`/obras/relatorio-diario/${r.id}`}>{fmtData(r.data)} · {r.trabalhos || 'Relatório diário'}</Link></li>)}</ul> : <Vazio>Sem relatórios submetidos.</Vazio>}</Seccao>
      <Seccao titulo="Atividade recente">{eventos.length ? <ul className="text-sm space-y-2">{eventos.slice(0, 3).map(e => <li key={e.id}>{e.titulo} <span className="text-muted-foreground">· {fmtData(e.criado_em)}</span></li>)}</ul> : <Vazio>Sem atividade recente.</Vazio>}<Link className="text-sm text-primary" to={`/obras/${obraId}?sec=atividade`}>Ver toda a atividade</Link></Seccao>
    </div>
    <div className="flex flex-wrap gap-2"><Link className={botaoPrimario} to={`/obras/${obraId}/relatorio-diario/novo`}>Relatório diário</Link>{podeMedir && <Link className={botaoSecundario} to={`/obras/${obraId}?sec=progresso`}>Nova aferição</Link>}<Link className={botaoSecundario} to={`/obras/${obraId}?sec=fotos`}>Adicionar foto</Link></div>
  </div>
}
