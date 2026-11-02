import { useAuth } from '@/features/auth/AuthContext'
import { useRole } from '@/features/auth/useRole'
import { useMeuColaborador } from '@/features/colaboradores/hooks/useColaboradores'
import { useContextoAbastecimento, usePodeAprovar } from '@/features/combustivel/hooks/usePedidos'
import { PageHeader, LARGURA_PAGINA } from '@/app/components/PageHeader'
import { atalhosDoInicio, rotuloDoPapel, saudacao, secoesDoInicio, type CapacidadesInicio } from './secoes'
import { AtalhoRapido } from './AtalhoRapido'
import { VeiculoWidget } from './widgets/VeiculoWidget'
import { ArmazemWidget, FrotaWidget, CombustivelWidget, ObrasWidget, ConsultaWidget } from './widgets/ModulosWidgets'

// O Início de quem não é CEO: só as secções que o cargo (papel definido nos Recursos Humanos) pode usar
export function PainelPessoalPage() {
  const { user } = useAuth()
  const r = useRole()
  const { colaborador } = useMeuColaborador(user?.id)
  const { contexto, loading: aCarregarCtx, error: erroCtx, reload: recarregarCtx } = useContextoAbastecimento()
  const { podeAprovar } = usePodeAprovar()

  const caps: CapacidadesInicio = {
    role: r.role,
    podeArmazem: r.podeArmazem, podeFrota: r.podeFrota, podeCombustivel: r.podeCombustivel,
    podeObras: r.podeObras, podeSubempreitadas: r.podeSubempreitadas,
    podeAprovar, temVeiculo: !!contexto?.veiculo_id,
  }
  const secoes = secoesDoInicio(caps)
  const atalhos = atalhosDoInicio(caps)
  const nome = colaborador?.nome ?? r.nome
  const podePedir = atalhos.some(a => a.to === '/abastecimento/pedir')
  const detalhe = [rotuloDoPapel(r.role), colaborador?.cargo, colaborador?.obraNome].filter(Boolean).join(' · ')

  return (
    <div className={`${LARGURA_PAGINA} space-y-5`}>
      <PageHeader titulo={`${saudacao(new Date().getHours())}${nome ? `, ${nome.split(' ')[0]}` : ''}`} descricao={detalhe || undefined} />

      {atalhos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 enc-fade-up">
          {atalhos.map(a => (
            <AtalhoRapido key={a.to} to={a.to} rotulo={a.rotulo} tom={a.tom} />
          ))}
        </div>
      )}

      {secoes.length === 0 && (
        <p className="text-sm text-muted-foreground bg-card border border-border rounded-2xl p-4">
          Ainda não tem funções atribuídas nesta app. Fale com os Recursos Humanos.
        </p>
      )}

      {secoes.map(s => {
        switch (s) {
          case 'veiculo':
            return <VeiculoWidget key={s} contexto={contexto} loading={aCarregarCtx} error={erroCtx} reload={recarregarCtx} podePedir={podePedir} />
          case 'frota':       return <FrotaWidget key={s} />
          case 'armazem':     return <ArmazemWidget key={s} />
          case 'combustivel': return <CombustivelWidget key={s} podeAprovar={podeAprovar} />
          case 'obras':       return <ObrasWidget key={s} podeSubempreitadas={r.podeSubempreitadas} />
          case 'consulta':    return <ConsultaWidget key={s} />
        }
      })}
    </div>
  )
}
