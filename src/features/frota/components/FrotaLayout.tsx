import { Link, NavLink, Outlet } from 'react-router'
import { LayoutDashboard, Truck, KeyRound, Wrench, Settings, Plus } from 'lucide-react'
import { useRole } from '@/features/auth/useRole'

// Um só módulo: tudo da frota (viaturas e máquinas) debaixo de /frota
export function separadoresFrota(p: { podeFrota: boolean; isAdmin: boolean }) {
  return [
    { para: '/frota', rotulo: 'Visão geral', Icone: LayoutDashboard, fim: true },
    { para: '/frota/viaturas', rotulo: 'Viaturas e máquinas', Icone: Truck },
    { para: '/frota/entregas', rotulo: 'Entregas', Icone: KeyRound },
    { para: '/frota/manutencao', rotulo: 'Manutenção', Icone: Wrench },
    ...(p.podeFrota || p.isAdmin ? [{ para: '/frota/configuracao', rotulo: 'Configuração', Icone: Settings }] : []),
  ]
}

export function FrotaLayout() {
  const { podeFrota, podeCombustivel, isAdmin } = useRole()
  const separadores = separadoresFrota({ podeFrota, isAdmin })
  const botao = 'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold active:scale-[0.98] transition-all'

  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-24">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold">Frota</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Viaturas e máquinas: quem tem cada uma, estado, entregas e manutenção.</p>
        </div>
        {(podeFrota || podeCombustivel) && (
          <Link to="/frota/viatura/nova" className={`${botao} bg-primary text-primary-foreground hover:bg-primary/90`}>
            <Plus className="w-4 h-4" aria-hidden="true" /> Nova viatura
          </Link>
        )}
      </div>

      <nav className="flex border-b border-border overflow-x-auto -mx-1 px-1" aria-label="Secções da frota">
        {separadores.map(({ para, rotulo, Icone, ...r }) => (
          <NavLink key={para} to={para} end={'fim' in r}
            className={({ isActive }) => `flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
              isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <Icone className="w-4 h-4" aria-hidden="true" />
            {rotulo}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  )
}
