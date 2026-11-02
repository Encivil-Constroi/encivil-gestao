import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { FiltroChips } from '@/app/components/FiltroChips'
afterEach(cleanup)

describe('FiltroChips — tom', () => {
  it('pinta a contagem com o token do tom', () => {
    render(<FiltroChips ariaLabel="x" valor="a" onChange={() => {}} opcoes={[
      { valor: 'a', rotulo: 'Ativos', contagem: 3, tom: 'destructive' },
      { valor: 'b', rotulo: 'Pendentes', contagem: 2, tom: 'warning' },
      { valor: 'c', rotulo: 'Todos', contagem: 5 },
    ]} />)
    expect(screen.getByText('2').className).toContain('text-warning')
    expect(screen.getByText('5').className).not.toMatch(/text-(warning|destructive)/)
    // chip ativo: cor do tom sobre pastilha clara (contraste com o fundo primary)
    expect(screen.getByText('3').className).toContain('text-destructive')
    expect(screen.getByText('3').className).toContain('bg-card')
  })
  it('contagem do tom destructive em chip inativo usa text-destructive', () => {
    render(<FiltroChips ariaLabel="x" valor="c" onChange={() => {}} opcoes={[
      { valor: 'a', rotulo: 'Ativos', contagem: 3, tom: 'destructive' }, { valor: 'c', rotulo: 'Todos' },
    ]} />)
    expect(screen.getByText('3').className).toContain('text-destructive')
  })
})

