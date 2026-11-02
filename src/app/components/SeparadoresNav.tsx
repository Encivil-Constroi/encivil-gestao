import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router'
import type { LucideIcon } from 'lucide-react'

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
  const navRef = useRef<HTMLElement>(null)
  const [escondido, setEscondido] = useState({ esquerda: false, direita: false })

  const medir = useCallback(() => {
    const el = navRef.current
    if (!el) return
    // Tolerância de 1px: arredondamentos de subpíxel deixavam o gradiente aceso no fim do scroll.
    const esquerda = el.scrollLeft > 1
    const direita = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setEscondido(a => (a.esquerda === esquerda && a.direita === direita ? a : { esquerda, direita }))
  }, [])

  useEffect(() => {
    const el = navRef.current
    if (!el) return
    el.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [medir])

  return (
    <div className="relative border-b border-border">
      <nav ref={navRef} aria-label={ariaLabel} onScroll={medir} className="flex overflow-x-auto [scrollbar-width:none]">
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
      {escondido.esquerda && (
        <div data-sombra-scroll aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-linear-to-r from-background to-transparent" />
      )}
      {escondido.direita && (
        <div data-sombra-scroll aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-background to-transparent" />
      )}
    </div>
  )
}
