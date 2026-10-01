import { useMemo } from 'react'
import { Link } from 'react-router'
import { Building2, ShieldAlert, AlertTriangle, ChevronRight } from 'lucide-react'
import { fmtEuro } from '@/app/lib/format'
import { useRole } from '@/features/auth/useRole'
import { usePainelObras } from '../hooks/useObras'
import { calcularKpis, ordenarPorSaude, precisaAtencao } from '../lib/saude'
import { ObraCard, ObraLinha } from './ObraCard'
import { SaudeBadge, Seccao, botaoSecundario } from './ui'

function Kpi({ valor, rotulo, detalhe, cor = 'text-foreground' }: { valor: string; rotulo: string; detalhe?: string; cor?: string }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4">
      <p className={`text-2xl md:text-3xl font-bold leading-tight ${cor}`}>{valor}</p>
      <p className="text-sm text-muted-foreground mt-0.5">{rotulo}</p>
      {detalhe && <p className="text-xs text-muted-foreground mt-1">{detalhe}</p>}
    </div>
  )
}

function Esqueleto() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="A carregar obras">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-72 rounded-2xl" />)}
      </div>
    </div>
  )
}

export function ObrasPainelPage() {
  const { obras, loading, error, reload } = usePainelObras()
  const { podeObras } = useRole()

  const kpis = useMemo(() => calcularKpis(obras), [obras])
  const emCurso = useMemo(() => ordenarPorSaude(obras.filter(o => o.estado === 'ativa')), [obras])
  const atencao = useMemo(() => emCurso.filter(precisaAtencao), [emCurso])
  const paradas = useMemo(() => obras.filter(o => o.estado === 'planeada' || o.estado === 'suspensa'), [obras])

  if (loading && obras.length === 0) return <Esqueleto />
  if (error) {
    return (
      <div className="py-10 text-center space-y-3">
        <p className="text-sm text-destructive">{error}</p>
        <button onClick={reload} className={botaoSecundario}>Tentar de novo</button>
      </div>
    )
  }
  if (obras.length === 0) {
    return (
      <div className="py-14 text-center space-y-3">
        <Building2 className="w-10 h-10 mx-auto text-muted-foreground/50" aria-hidden="true" />
        <p className="font-semibold">Ainda não há obras</p>
        <p className="text-sm text-muted-foreground">Crie a primeira obra para acompanhar progresso, equipa, frota e subempreitadas.</p>
        {podeObras && <Link to="/obras/nova" className={botaoSecundario}>Criar obra</Link>}
      </div>
    )
  }

  const pctOrcamento = kpis.orcamentoTotal > 0 ? Math.round((kpis.custoTotal / kpis.orcamentoTotal) * 100) : null

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi valor={String(kpis.emCurso)} rotulo="Obras em curso"
          detalhe={kpis.criticas + kpis.atencao === 0 ? 'Todas em dia' : `${kpis.criticas} crítica${kpis.criticas === 1 ? '' : 's'} · ${kpis.atencao} em atenção`}
          cor={kpis.criticas > 0 ? 'text-destructive' : kpis.atencao > 0 ? 'text-warning' : 'text-success'} />
        <Kpi valor={kpis.progressoMedio == null ? '—' : `${kpis.progressoMedio}%`} rotulo="Progresso médio" detalhe="Das obras em curso com progresso registado" />
        <Kpi valor={fmtEuro(kpis.custoTotal)} rotulo="Custo acumulado"
          detalhe={kpis.orcamentoTotal > 0 ? `${pctOrcamento}% de ${fmtEuro(kpis.orcamentoTotal)} orçamentados` : 'Sem orçamentos definidos'} />
        <Kpi valor={String(kpis.ocorrenciasAbertas)} rotulo="Ocorrências abertas"
          detalhe={kpis.semRelatorio > 0 ? `${kpis.semRelatorio} obra${kpis.semRelatorio === 1 ? '' : 's'} sem relatório recente` : 'Relatórios em dia'}
          cor={kpis.ocorrenciasAbertas > 0 ? 'text-warning' : 'text-foreground'} />
      </div>

      {atencao.length > 0 && (
        <Seccao titulo="Precisa de atenção" icone={<ShieldAlert className="w-4 h-4 text-destructive" aria-hidden="true" />}>
          <ul className="divide-y divide-border">
            {atencao.map(o => (
              <li key={o.obra_id}>
                <Link to={`/obras/${o.obra_id}`} className="flex items-center gap-3 py-2.5 hover:bg-accent/40 -mx-2 px-2 rounded-lg transition-colors">
                  <SaudeBadge saude={o.saude} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{o.nome}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      <AlertTriangle className="w-3 h-3 inline mr-1 -mt-0.5" aria-hidden="true" />{o.motivos.join(' · ') || 'Verificar a obra'}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </Seccao>
      )}

      <section aria-label="Obras em curso" className="space-y-3">
        <h2 className="text-sm font-semibold">Em curso <span className="text-muted-foreground font-normal">({emCurso.length})</span></h2>
        {emCurso.length === 0 ? (
          <p className="text-sm text-muted-foreground bg-card rounded-2xl border border-border p-4">Nenhuma obra em curso neste momento.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {emCurso.map(o => <ObraCard key={o.obra_id} obra={o} />)}
          </div>
        )}
      </section>

      {paradas.length > 0 && (
        <section aria-label="Planeadas e suspensas" className="space-y-2">
          <h2 className="text-sm font-semibold">Planeadas e suspensas <span className="text-muted-foreground font-normal">({paradas.length})</span></h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {paradas.map(o => <ObraLinha key={o.obra_id} obra={o} />)}
          </div>
        </section>
      )}

      <p className="text-center">
        <Link to="/obras/lista?estado=concluida" className="text-sm text-primary hover:underline">Ver obras concluídas</Link>
      </p>
    </div>
  )
}
