import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { FuelEntry } from '@/app/types'

// Tem de ser definido antes de qualquer Date: o desfasamento só existe a leste de UTC
vi.stubEnv('TZ', 'Europe/Lisbon')

const m = vi.hoisted(() => ({ entries: [] as FuelEntry[], filtros: [] as Array<Record<string, unknown>> }))

vi.mock('@/features/auth/useRole', () => ({ useRole: () => ({ role: 'gestor', isAdmin: false }) }))
vi.mock('@/features/combustivel/hooks/useCombustivel', () => ({
  useAbastecimentos: (f: Record<string, unknown>) => { m.filtros.push(f); return { entries: m.entries, loading: false, reload: vi.fn() } },
  useVeiculos: () => ({ vehicles: [], loading: false }),
}))
vi.mock('@/app/lib/exportXlsx', () => ({ exportarXlsx: vi.fn(async () => {}) }))

import { HistoricoAbastecimentos } from '@/features/combustivel/components/modulo/HistoricoAbastecimentos'
import { urlHttps } from '@/app/lib/urlSegura'

function registo(o: Partial<FuelEntry> = {}): FuelEntry {
  return {
    id: 'a1', vehicleId: 'v1', vehicleName: 'Ford Transit', vehicleCode: 'V1', date: new Date('2026-07-10T10:00:00Z'),
    liters: 40, totalCost: 60, responsible: 'Zé', createdAt: new Date('2026-07-10T10:00:00Z'), pricePerLiter: 1.5, ...o,
  }
}

beforeEach(() => {
  m.filtros = []; m.entries = []
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-07-15T12:00:00Z'))
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Combustível: datas de Lisboa e fotos', () => {
  it('filtro do mês de julho/2026 vai de 01 a 31 (sem recuar um dia por causa do UTC)', () => {
    render(<MemoryRouter><HistoricoAbastecimentos /></MemoryRouter>)
    expect(m.filtros.at(-1)).toMatchObject({ dataInicio: '2026-07-01', dataFim: '2026-07-31' })
  })

  it('foto_url com esquema perigoso não gera imagem', () => {
    m.entries = [registo({ photoUrl: 'javascript:alert(1)' })]
    const { container } = render(<MemoryRouter><HistoricoAbastecimentos /></MemoryRouter>)
    expect(container.querySelector('img')).toBeNull()
  })

  it('foto_url https continua a aparecer', () => {
    m.entries = [registo({ photoUrl: 'https://x.supabase.co/f.jpg' })]
    render(<MemoryRouter><HistoricoAbastecimentos /></MemoryRouter>)
    expect(screen.getByAltText('Foto do abastecimento')).toHaveAttribute('src', 'https://x.supabase.co/f.jpg')
  })

  it('urlHttps só aceita https', () => {
    expect(urlHttps('https://a/b')).toBe('https://a/b')
    expect(urlHttps('http://a/b')).toBeNull()
    expect(urlHttps('javascript:alert(1)')).toBeNull()
    expect(urlHttps(null)).toBeNull()
  })
})
