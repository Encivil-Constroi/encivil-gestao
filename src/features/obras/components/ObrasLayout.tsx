import { Link, NavLink, Outlet } from 'react-router'
import { LayoutDashboard, Building2, ClipboardList, HardHat, Plus } from 'lucide-react'
import { useRole } from '@/features/auth/useRole'

// Um só módulo: obras, relatórios diários e subempreitadas debaixo de /obras
export const SEPARADORES_OBRAS = [
  { para: '/obras', rotulo: 'Painel', Icone: LayoutDashboard, fim: true },
  { para: '/obras/lista', rotulo: 'Obras', Icone: Building2, fim: false },
  { para: '/obras/relatorios', rotulo: 'Relatórios diários', Icone: ClipboardList, fim: false },
  { para: '/obras/subempreitadas', rotulo: 'Subempreitadas', Icone: HardHat, fim: false },
]

export function ObrasLayout() {
  const { podeObras } = useRole()
  return (
    <div className="max-w-6xl mx-auto space-y-4 pb-24">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold">Obras</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Cada obra de ponta a ponta: progresso, equipa, frota, materiais e subempreitadas.</p>
        </div>
        {podeObras && (
          <Link to="/obras/nova"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all">
            <Plus className="w-4 h-4" aria-hidden="true" /> Nova obra
          </Link>
        )}
      </div>

      <nav className="flex border-b border-border overflow-x-auto -mx-1 px-1" aria-label="Secções das obras">
        {SEPARADORES_OBRAS.map(({ para, rotulo, Icone, fim }) => (
          <NavLink key={para} to={para} end={fim}
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
