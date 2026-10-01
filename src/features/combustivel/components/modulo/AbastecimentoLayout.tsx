import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router'
import { Droplets, ClipboardList, History, BarChart3, Gauge, Settings } from 'lucide-react'
import { useRole } from '@/features/auth/useRole'
import { usePodeAprovar, useContagemAguardam } from '../../hooks/useAprovacao'
import { botaoPrimario } from '../pedidos/ui'

export type Separador = { para: string; rotulo: string; Icone: typeof Droplets; fim?: boolean }

// Separadores do módulo por papel (a segurança real está na RLS e nas RPCs)
export function separadoresDoPapel(p: { isMotorista: boolean; isAdmin: boolean; podeCombustivel: boolean; podeAprovar: boolean }): Separador[] {
  if (p.isMotorista) return [{ para: '/abastecimento', rotulo: 'Os meus pedidos', Icone: ClipboardList, fim: true }]
  const s: Separador[] = [
    { para: '/abastecimento', rotulo: 'Pedidos', Icone: ClipboardList, fim: true },
    { para: '/abastecimento/historico', rotulo: 'Histórico', Icone: History },
    { para: '/abastecimento/analise', rotulo: 'Análise', Icone: BarChart3 },
  ]
  if (p.podeCombustivel || p.podeAprovar) s.push({ para: '/abastecimento/bomba', rotulo: 'Bomba Polo 2', Icone: Gauge })
  if (p.isAdmin) s.push({ para: '/abastecimento/configuracao', rotulo: 'Configuração', Icone: Settings })
  return s
}

export function AbastecimentoLayout() {
  const { isMotorista, isAdmin, podeCombustivel } = useRole()
  const { podeAprovar } = usePodeAprovar()
  const aguardam = useContagemAguardam(podeAprovar && !isMotorista)
  const { pathname } = useLocation()
  const separadores = separadoresDoPapel({ isMotorista, isAdmin, podeCombustivel, podeAprovar })

  // Separador a que o papel não tem acesso: volta ao início do módulo
  if (pathname !== '/abastecimento' && !separadores.some(s => pathname.startsWith(s.para) && s.para !== '/abastecimento')) {
    return <Navigate to="/abastecimento" replace />
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-24">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold">{isMotorista ? 'Os meus pedidos' : 'Abastecimento'}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isMotorista ? 'Os seus pedidos de combustível.' : 'Pedidos, histórico e consumo de combustível.'}
          </p>
        </div>
        <Link to="/abastecimento/pedir" className={botaoPrimario}>
          <Droplets className="w-4 h-4" aria-hidden="true" /> Pedir combustível
        </Link>
      </div>

      {separadores.length > 1 && (
        <nav className="flex border-b border-border overflow-x-auto -mx-1 px-1" aria-label="Secções do abastecimento">
          {separadores.map(({ para, rotulo, Icone, fim }) => (
            <NavLink key={para} to={para} end={fim}
              className={({ isActive }) => `flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
                isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              <Icone className="w-4 h-4" aria-hidden="true" />
              {rotulo}
              {para === '/abastecimento' && aguardam > 0 && (
                <span className="ml-0.5 bg-warning text-warning-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none"
                  aria-label={`${aguardam} à espera de decisão`}>{aguardam}</span>
              )}
            </NavLink>
          ))}
        </nav>
      )}

      <Outlet />
    </div>
  )
}
