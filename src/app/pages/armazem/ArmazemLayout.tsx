import { Link, NavLink, Outlet } from 'react-router'
import { LayoutGrid, Package, ArrowLeftRight, Wrench, Building2, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import { useRole } from '@/features/auth/useRole'

export const SEPARADORES_ARMAZEM = [
  { para: '/armazem', rotulo: 'Visão geral', Icone: LayoutGrid, fim: true },
  { para: '/armazem/inventario', rotulo: 'Inventário', Icone: Package },
  { para: '/armazem/movimentos', rotulo: 'Movimentos', Icone: ArrowLeftRight },
  { para: '/armazem/ferramentas', rotulo: 'Ferramentas', Icone: Wrench },
  { para: '/armazem/obras', rotulo: 'Obras', Icone: Building2 },
] as const

export function ArmazemLayout() {
  const { podeArmazem } = useRole()
  const botao = 'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold active:scale-[0.98] transition-all'

  return (
    <div className="max-w-6xl mx-auto space-y-4 pb-24">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold">Armazém</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Stock, entradas e saídas, ferramentas e o que está em cada obra.</p>
        </div>
        {podeArmazem && (
          <div className="flex gap-2">
            <Link to="/armazem/movimento/entrada" className={`${botao} bg-success text-success-foreground hover:bg-success/90`}>
              <ArrowDownCircle className="w-4 h-4" aria-hidden="true" /> Entrada
            </Link>
            <Link to="/armazem/movimento/saida" className={`${botao} bg-primary text-primary-foreground hover:bg-primary/90`}>
              <ArrowUpCircle className="w-4 h-4" aria-hidden="true" /> Saída
            </Link>
          </div>
        )}
      </div>

      <nav className="flex border-b border-border overflow-x-auto -mx-1 px-1" aria-label="Secções do armazém">
        {SEPARADORES_ARMAZEM.map(({ para, rotulo, Icone, ...r }) => (
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
