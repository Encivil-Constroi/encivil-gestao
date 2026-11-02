import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { LayoutGrid } from 'lucide-react'
import { SeparadoresNav } from '@/app/components/SeparadoresNav'
afterEach(cleanup)

describe('SeparadoresNav — contagem', () => {
  const itens = (n?: number) => [
    { para: '/a', rotulo: 'Pedidos', Icone: LayoutGrid, fim: true, contagem: n },
    { para: '/b', rotulo: 'Histórico', Icone: LayoutGrid },
  ]
  it('mostra pastilha e inclui a contagem no aria-label', () => {
    render(<MemoryRouter><SeparadoresNav itens={itens(4)} ariaLabel="s" /></MemoryRouter>)
    expect(screen.getByText('4').className).toContain('bg-warning')
    expect(screen.getByRole('link', { name: /Pedidos.*4/ })).toBeTruthy()
  })
  it('0 ou indefinido não mostra nada', () => {
    render(<MemoryRouter><SeparadoresNav itens={itens(0)} ariaLabel="s" /></MemoryRouter>)
    expect(screen.queryByText('0')).toBeNull()
    expect(screen.getByRole('link', { name: 'Pedidos' })).toBeTruthy()
  })
})

