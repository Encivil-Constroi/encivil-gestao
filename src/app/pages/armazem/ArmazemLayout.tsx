import { Link, Outlet } from 'react-router'
import { LayoutGrid, Package, ArrowLeftRight, Wrench, Building2, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { PageHeader, LARGURA_PAGINA } from '@/app/components/PageHeader'
import { SeparadoresNav } from '@/app/components/SeparadoresNav'
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

  return (
    <div className={`${LARGURA_PAGINA} space-y-4 pb-24`}>
      <PageHeader
        titulo="Armazém"
        descricao="Stock, entradas e saídas, ferramentas e o que está em cada obra."
        acoes={podeArmazem && (
          <>
            <Button asChild className="bg-success text-success-foreground hover:bg-success/90">
              <Link to="/armazem/movimento/entrada"><ArrowDownCircle aria-hidden="true" />Entrada</Link>
            </Button>
            <Button asChild>
              <Link to="/armazem/movimento/saida"><ArrowUpCircle aria-hidden="true" />Saída</Link>
            </Button>
          </>
        )}
      />

      <SeparadoresNav itens={SEPARADORES_ARMAZEM} ariaLabel="Secções do armazém" />

      <Outlet />
    </div>
  )
}
