import { Link } from 'react-router'
import { Warehouse, Truck, Fuel, Building2, BookOpen } from 'lucide-react'
import { useDashboard } from '@/features/dashboard/hooks/useDashboard'
import { useResumoFrota } from '@/features/frota/hooks/useFrota'
import { contarPorEstado, documentosEmRisco } from '@/features/frota/lib/viaturas'
import { useContagemAguardam } from '@/features/combustivel/hooks/usePedidos'
import { useObras } from '@/features/obras/hooks/useObras'
import { StockBadge } from '@/app/components/StockBadge'
import { Secao, Esqueleto, ErroSecao, Numero, Vazio } from './ui'

export function ArmazemWidget() {
  const { stats, loading, error, reload } = useDashboard()
  return (
    <Secao titulo="Armazém" icone={Warehouse} para="/armazem">
      {loading && !stats ? <Esqueleto /> : error ? <ErroSecao mensagem={error} onRetry={reload} /> : stats && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Numero valor={stats.totalProducts} rotulo="Artigos ativos" para="/armazem/inventario" />
            <Numero valor={stats.todayEntries} rotulo="Entradas hoje" cor="sucesso" para="/armazem/movimentos" />
            <Numero valor={stats.todayExits} rotulo="Saídas hoje" para="/armazem/movimentos" />
            <Numero valor={stats.lowStockProducts} rotulo="Em alerta" cor={stats.lowStockProducts > 0 ? 'perigo' : 'neutro'} para="/armazem/inventario" />
          </div>
          {stats.lowStockItems.length > 0 && (
            <ul className="divide-y divide-border">
              {stats.lowStockItems.slice(0, 3).map(i => (
                <li key={i.id}>
                  <Link to={`/armazem/produto/${i.id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:bg-accent/40 rounded-lg px-1">
                    <span className="flex-1 min-w-0 truncate">{i.name}</span>
                    <span className="text-muted-foreground">{i.currentStock}/{i.minStock} {i.unit}</span>
                    <StockBadge status={i.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Secao>
  )
}

export function FrotaWidget() {
  const { viaturas, loading, error, reload } = useResumoFrota()
  const n = contarPorEstado(viaturas)
  const documentos = documentosEmRisco(viaturas).length
  const prazos = viaturas.filter(v => v.alertas_urgentes + v.alertas_atencao > 0).length
  return (
    <Secao titulo="Frota" icone={Truck} para="/frota">
      {loading && viaturas.length === 0 ? <Esqueleto /> : error ? <ErroSecao mensagem={error} onRetry={reload} /> : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Numero valor={n.LIVRE} rotulo="Livres" cor="sucesso" para="/frota/viaturas?estado=LIVRE" />
            <Numero valor={n.EM_USO} rotulo="Em uso" cor="aviso" para="/frota/viaturas?estado=EM_USO" />
            <Numero valor={n.OFICINA} rotulo="Na oficina" cor={n.OFICINA > 0 ? 'perigo' : 'neutro'} para="/frota/viaturas?estado=OFICINA" />
            <Numero valor={prazos + documentos} rotulo="Prazos a tratar" cor={prazos + documentos > 0 ? 'perigo' : 'neutro'} para="/frota" />
          </div>
          {prazos + documentos === 0 && <Vazio>Sem manutenções nem documentos a vencer.</Vazio>}
        </div>
      )}
    </Secao>
  )
}

export function CombustivelWidget({ podeAprovar }: { podeAprovar: boolean }) {
  const aguardam = useContagemAguardam(podeAprovar)
  return (
    <Secao titulo="Combustível" icone={Fuel} para="/abastecimento" paraRotulo="Pedidos">
      {podeAprovar ? (
        <Numero valor={aguardam} rotulo="Pedidos à espera da sua decisão" cor={aguardam > 0 ? 'aviso' : 'neutro'} para="/abastecimento" />
      ) : (
        <Vazio>Pedidos, bomba e histórico de abastecimentos.</Vazio>
      )}
    </Secao>
  )
}

export function ObrasWidget({ podeSubempreitadas }: { podeSubempreitadas: boolean }) {
  const { obras, loading, error, reload } = useObras(true)
  return (
    <Secao titulo="Obras" icone={Building2} para="/obras">
      {loading && obras.length === 0 ? <Esqueleto linhas={1} /> : error ? <ErroSecao mensagem={error} onRetry={reload} /> : (
        <div className="grid grid-cols-2 gap-2">
          <Numero valor={obras.length} rotulo="Obras ativas" para="/obras/lista" />
          {podeSubempreitadas && <Numero valor="Subempreitadas" rotulo="Autos e medições" para="/obras/subempreitadas" />}
        </div>
      )}
    </Secao>
  )
}

// Quem só consulta: entradas diretas para o que pode ver (a RLS continua a mandar)
export function ConsultaWidget() {
  const links = [
    { to: '/armazem', rotulo: 'Armazém' }, { to: '/obras', rotulo: 'Obras' },
    { to: '/abastecimento', rotulo: 'Abastecimento' }, { to: '/relatorios', rotulo: 'Relatórios' },
  ]
  return (
    <Secao titulo="Consulta" icone={BookOpen}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {links.map(l => <Numero key={l.to} valor={l.rotulo} rotulo="Abrir" para={l.to} />)}
      </div>
    </Secao>
  )
}
