import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { useSombraScroll, SombrasScroll } from '@/app/components/useSombraScroll'
afterEach(cleanup)

describe('useSombraScroll', () => {
  function Demo() {
    const { ref, onScroll, esquerda, direita } = useSombraScroll<HTMLDivElement>()
    return (
      <div className="relative">
        <div ref={ref} onScroll={onScroll} data-testid="alvo">x</div>
        <SombrasScroll esquerda={esquerda} direita={direita} />
      </div>
    )
  }
  it('acende o gradiente do lado com conteúdo escondido', () => {
    const def = (k: string, v: number) => Object.defineProperty(HTMLElement.prototype, k, { configurable: true, get: () => v })
    def('scrollWidth', 500); def('clientWidth', 200); def('scrollLeft', 0)
    const { container } = render(<Demo />)
    expect(container.querySelectorAll('[data-sombra-scroll]')).toHaveLength(1)
    def('scrollLeft', 100)
    fireEvent.scroll(screen.getByTestId('alvo'))
    expect(container.querySelectorAll('[data-sombra-scroll]')).toHaveLength(2)
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollWidth
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollLeft
  })
})
