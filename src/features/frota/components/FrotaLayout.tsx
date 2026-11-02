import { Link, Outlet } from 'react-router'
import { LayoutDashboard, Truck, KeyRound, Wrench, Settings, Plus } from 'lucide-react'
import { useRole } from '@/features/auth/useRole'
import { Button } from '@/app/components/ui/button'
import { PageHeader, LARGURA_PAGINA } from '@/app/components/PageHeader'
import { SeparadoresNav } from '@/app/components/SeparadoresNav'

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

  return (
    <div className={`${LARGURA_PAGINA} space-y-4 pb-24`}>
      <PageHeader titulo="Frota" descricao="Viaturas e máquinas: quem tem cada uma, estado, entregas e manutenção."
        acoes={(podeFrota || podeCombustivel) && (
          <Button asChild>
            <Link to="/frota/viatura/nova"><Plus aria-hidden="true" />Nova viatura</Link>
          </Button>
        )} />

      <SeparadoresNav itens={separadores} ariaLabel="Secções da frota" />

      <Outlet />
    </div>
  )
}
