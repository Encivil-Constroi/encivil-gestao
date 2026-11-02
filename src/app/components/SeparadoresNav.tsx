import { NavLink } from 'react-router'
import type { LucideIcon } from 'lucide-react'
import { useSombraScroll, SombrasScroll } from './useSombraScroll'

export interface SeparadorNav {
  para: string
  rotulo: string
  Icone: LucideIcon
  /** Só ativo na rota exata (NavLink `end`). */
  fim?: boolean
  /** Pastilha de aviso (ex.: pedidos à espera); 0 ou ausente não mostra nada. */
  contagem?: number
}

interface SeparadoresNavProps {
  itens: readonly SeparadorNav[]
  ariaLabel: string
}

export function SeparadoresNav({ itens, ariaLabel }: SeparadoresNavProps) {
  const { ref, onScroll, esquerda, direita } = useSombraScroll<HTMLElement>()

  return (
    <div className="relative border-b border-border">
      <nav ref={ref} aria-label={ariaLabel} onScroll={onScroll} className="flex overflow-x-auto [scrollbar-width:none]">
        {itens.map(({ para, rotulo, Icone, fim, contagem }) => (
          <NavLink key={para} to={para} end={fim} aria-label={contagem ? `${rotulo} (${contagem})` : undefined}
            className={({ isActive }) => `flex items-center gap-1.5 min-h-10 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
              isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <Icone className="w-4 h-4" aria-hidden="true" />
            {rotulo}
            {contagem ? (
              <span className="bg-warning text-warning-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none tabular-nums">{contagem}</span>
            ) : null}
          </NavLink>
        ))}
      </nav>
      <SombrasScroll esquerda={esquerda} direita={direita} />
    </div>
  )
}
