import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { FuelEntry } from '@/app/types'

const m = vi.hoisted(() => ({
  papel: 'gestor',
  entries: [] as FuelEntry[],
  filtros: [] as unknown[],
}))

vi.mock('@/features/auth/useRole', () => ({
  useRole: () => ({ role: m.papel, isAdmin: m.papel === 'admin' }),
}))
vi.mock('@/features/combustivel/hooks/useCombustivel', () => ({
  useAbastecimentos: (f: unknown) => { m.filtros.push(f); return { entries: m.entries, loading: false, reload: vi.fn() } },
  useVeiculos: () => ({ vehicles: [{ id: 'v1', name: 'Ford Transit', code: 'V1' }], loading: false }),
}))
vi.mock('@/app/lib/exportXlsx', () => ({ exportarXlsx: vi.fn(async () => {}) }))

import { HistoricoAbastecimentos } from '@/features/combustivel/components/modulo/HistoricoAbastecimentos'

function registo(o: Partial<FuelEntry> = {}): FuelEntry {
  return {
    id: 'a1', vehicleId: 'v1', vehicleName: 'Ford Transit', vehicleCode: 'V1', date: new Date('2026-09-10T10:00:00Z'),
    liters: 40, totalCost: 60, responsible: 'Zé Gaitas', createdAt: new Date('2026-09-10T10:00:00Z'), pricePerLiter: 1.5, ...o,
  }
}

function abrir() {
  render(<MemoryRouter><HistoricoAbastecimentos /></MemoryRouter>)
}

beforeEach(() => {
  m.papel = 'gestor'; m.filtros = []
  m.entries = [
    registo({ id: 'a1', pedidoId: 'p1' }),
    registo({ id: 'a2', date: new Date('2026-09-10T15:00:00Z'), responsible: 'Rui' }),
    registo({ id: 'a3', date: new Date('2026-09-08T09:00:00Z'), pedidoId: 'p3', responsible: 'Ana' }),
  ]
})
afterEach(cleanup)

describe('Histórico de abastecimentos', () => {
  it('agrupa por dia (mais recente primeiro) e mostra o sumário', () => {
    abrir()
    const dias = screen.getAllByRole('region')
    expect(dias).toHaveLength(2)
    expect(within(dias[0]).getAllByTestId('registo-abastecimento')).toHaveLength(2)
    expect(within(dias[1]).getAllByTestId('registo-abastecimento')).toHaveLength(1)
    expect(within(dias[1]).getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('Abastecimentos').nextSibling).toHaveTextContent('3')
  })

  it('começa no mês corrente e sem viatura', () => {
    abrir()
    expect(m.filtros.at(-1)).toMatchObject({ veiculoId: undefined, dataInicio: expect.any(String), dataFim: expect.any(String) })
  })

  it('registo com pedido abre o pedido', () => {
    abrir()
    const linha = screen.getAllByTestId('registo-abastecimento').find(e => e.textContent?.includes('Zé Gaitas'))!
    expect(linha.tagName).toBe('A')
    expect(linha).toHaveAttribute('href', '/abastecimento/pedido/p1')
  })

  it('não admin: registo manual não é clicável e não há botão de lançar', () => {
    abrir()
    const manual = screen.getAllByTestId('registo-abastecimento').find(e => e.textContent?.includes('Rui'))!
    expect(manual.tagName).not.toBe('A')
    expect(manual.closest('a')).toBeNull()
    expect(screen.queryByRole('link', { name: /Lançar registo manual/ })).not.toBeInTheDocument()
  })

  it('admin: registo manual abre a correção e vê "Lançar registo manual"', () => {
    m.papel = 'admin'
    abrir()
    const manual = screen.getAllByTestId('registo-abastecimento').find(e => e.textContent?.includes('Rui'))!
    expect(manual).toHaveAttribute('href', '/abastecimento/registo/a2')
    expect(screen.getByRole('link', { name: /Lançar registo manual/ })).toHaveAttribute('href', '/abastecimento/registo/novo')
  })

  it('sem registos: estado vazio', () => {
    m.entries = []
    abrir()
    expect(screen.getByText('Sem abastecimentos')).toBeInTheDocument()
  })
})
