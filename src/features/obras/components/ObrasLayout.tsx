import { Link, Outlet, useLocation } from 'react-router'
import { LayoutDashboard, Building2, ClipboardList, HardHat, Plus } from 'lucide-react'
import { useRole } from '@/features/auth/useRole'
import { Button } from '@/app/components/ui/button'
import { PageHeader, LARGURA_PAGINA } from '@/app/components/PageHeader'
import { SeparadoresNav } from '@/app/components/SeparadoresNav'

// Um só módulo: obras, relatórios diários e subempreitadas debaixo de /obras
export const SEPARADORES_OBRAS = [
  { para: '/obras', rotulo: 'Painel', Icone: LayoutDashboard, fim: true },
  { para: '/obras/lista', rotulo: 'Obras', Icone: Building2, fim: false },
  { para: '/obras/relatorios', rotulo: 'Relatórios diários', Icone: ClipboardList, fim: false },
  { para: '/obras/subempreitadas', rotulo: 'Subempreitadas', Icone: HardHat, fim: false },
]

export function ObrasLayout() {
  const { podeObras, podeSubempreitadas } = useRole()
  const { pathname } = useLocation()
  const emSubempreitadas = pathname === '/obras/subempreitadas' || pathname.startsWith('/obras/subempreitadas/')

  const acao = emSubempreitadas
    ? podeSubempreitadas && (
      <Button asChild>
        <Link to="/obras/subempreitada/novo"><Plus aria-hidden="true" />Nova contratação</Link>
      </Button>
    )
    : podeObras && (
      <Button asChild>
        <Link to="/obras/nova"><Plus aria-hidden="true" />Nova obra</Link>
      </Button>
    )

  return (
    <div className={`${LARGURA_PAGINA} space-y-4 pb-24`}>
      <PageHeader titulo="Obras"
        descricao="Cada obra de ponta a ponta: progresso, equipa, frota, materiais e subempreitadas."
        acoes={acao || undefined} />
      <SeparadoresNav itens={SEPARADORES_OBRAS} ariaLabel="Secções das obras" />
      <Outlet />
    </div>
  )
}
