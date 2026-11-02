import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

vi.mock('@/features/obras/hooks/useObras', () => ({ useObras: () => ({ obras: [], loading: false }) }))
vi.mock('@/app/lib/fotosArmazem', () => ({ urlFotoArmazem: () => null }))
vi.mock('@/features/movimentos/hooks/useArmazem', () => ({
  useArtigosArmazem: () => ({ artigos: [], loading: false }),
  useMovimentosArmazem: () => ({ movimentos: [], total: 0, loading: false, error: null }),
}))

import { MovimentosPage } from '@/app/pages/armazem/MovimentosPage'

afterEach(cleanup)

describe('Movimentos (lote A)', () => {
  it('vazio com filtros oferece "Limpar filtros" que repõe o período', () => {
    render(<MemoryRouter><MovimentosPage /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull()
    const periodo = screen.getByLabelText('Período') as HTMLSelectElement
    fireEvent.change(periodo, { target: { value: 'todos' } })
    const botoes = screen.getAllByRole('button', { name: 'Limpar filtros' })
    expect(botoes.length).toBe(2)
    fireEvent.click(botoes[botoes.length - 1])
    expect(periodo.value).toBe('mes')
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull()
  })
})
