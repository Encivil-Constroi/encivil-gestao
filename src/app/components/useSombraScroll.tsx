import { useCallback, useEffect, useRef, useState } from 'react'

// Deteta conteúdo escondido nas pontas de um contentor com scroll horizontal e centra o item ativo.
export function useSombraScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [estado, setEstado] = useState({ esquerda: false, direita: false })

  const medir = useCallback(() => {
    const el = ref.current
    if (!el) return
    // Tolerância de 1px: arredondamentos de subpíxel deixavam o gradiente aceso no fim do scroll.
    const esquerda = el.scrollLeft > 1
    const direita = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setEstado(a => (a.esquerda === esquerda && a.direita === direita ? a : { esquerda, direita }))
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [medir])

  return { ref, onScroll: medir, ...estado }
}

// Colocar dentro de um pai `relative`, junto ao contentor com scroll.
export function SombrasScroll({ esquerda, direita }: { esquerda: boolean; direita: boolean }) {
  return (
    <>
      {esquerda && (
        <div data-sombra-scroll aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-linear-to-r from-background to-transparent" />
      )}
      {direita && (
        <div data-sombra-scroll aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-background to-transparent" />
      )}
    </>
  )
}
