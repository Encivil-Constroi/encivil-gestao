import { Link, Navigate, Outlet, useLocation } from 'react-router'
import { Droplets, ClipboardList, History, BarChart3, Gauge, Settings } from 'lucide-react'
import { useRole } from '@/features/auth/useRole'
import { usePodeAprovar, useContagemAguardam } from '../../hooks/useAprovacao'
import { Button } from '@/app/components/ui/button'
import { PageHeader, LARGURA_PAGINA } from '@/app/components/PageHeader'
import { SeparadoresNav } from '@/app/components/SeparadoresNav'

export type Separador = { para: string; rotulo: string; Icone: typeof Droplets; fim?: boolean; contagem?: number }

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


  const itens = separadores.map(s => (
    s.para === '/abastecimento' && aguardam > 0 ? { ...s, contagem: aguardam } : s))

  return (
    <div className={`${LARGURA_PAGINA} space-y-4 pb-24`}>
      <PageHeader titulo={isMotorista ? 'Os meus pedidos' : 'Abastecimento'}
        descricao={isMotorista ? 'Os seus pedidos de combustível.' : 'Pedidos, histórico e consumo de combustível.'}
        acoes={
          <Button asChild>
            <Link to="/abastecimento/pedir"><Droplets aria-hidden="true" />Pedir combustível</Link>
          </Button>
        } />

      {separadores.length > 1 && <SeparadoresNav itens={itens} ariaLabel="Secções do abastecimento" />}

      <Outlet />
    </div>
  )
}
