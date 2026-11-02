import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
const m = vi.hoisted(() => ({ role: 'armazem' as string, podeArmazem: true }))

vi.mock('@/app/pages/dashboard/dados', () => ({ carregarDashboard: vi.fn(async () => ({
  atualizadoEm: new Date('2026-11-02T10:00:00Z'),
  visao: {
    obras: { ok: true, data: [] },
    subs: { ok: true, data: { totais: { por_pagar: 0 }, alertas: [], por_sub: [], passivo_documental: { subs_com_pendencia: 0, valor_por_pagar_em_risco: 0 } } },
    frota: { ok: true, data: [] }, artigosEmAlerta: { ok: true, data: 0 }, ferramentasEmAtraso: { ok: true, data: 0 },
  },
  decisoes: { contratosPorValidar: { ok: true, data: 0 }, autosPorValidar: { ok: true, data: 0 }, pedidosCombustivel: { ok: true, data: 0 }, faltasPorDecidir: { ok: true, data: 0 } },
})) }))
vi.mock('@/features/auth/useRole', () => ({ useRole: () => ({ role: m.role, loading: false, podeArmazem: m.podeArmazem }) }))
vi.mock('@/features/alertas', () => ({ AlertasWidget: () => null }))
vi.mock('@/app/pages/dashboard/ArmazemSecao', () => ({ ArmazemSecao: () => null }))

import { DashboardPage } from '@/app/pages/DashboardPage'
import { invalidateCache } from '@/app/lib/useAsync'

beforeEach(() => invalidateCache('dashboard-executivo'))
afterEach(cleanup)

describe('Início — ações rápidas por papel', () => {
  it('quem regista movimentos: saída e entrada com tinta suave, combustível neutro', async () => {
    Object.assign(m, { role: 'armazem', podeArmazem: true })
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    const saida = await screen.findByRole('link', { name: /Registar saída/i })
    const entrada = screen.getByRole('link', { name: /Registar entrada/i })
    const comb = screen.getByRole('link', { name: /Pedir combustível/i })
    expect(saida.className).toContain('bg-destructive/10')
    expect(saida.className).toContain('text-destructive')
    expect(saida.className).not.toMatch(/(^| )bg-destructive( |$)/)
    expect(entrada.className).toContain('bg-success/10')
    expect(entrada.className).toContain('text-success')
    expect(entrada.className).not.toMatch(/(^| )bg-success( |$)/)
    expect(comb.className).toContain('bg-card')
    expect(comb.className).toContain('border')
    expect(comb.className).not.toMatch(/bg-primary/)
  })
  it('motorista: sem saída/entrada; combustível é o principal', async () => {
    Object.assign(m, { role: 'motorista', podeArmazem: false })
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    const comb = await screen.findByRole('link', { name: /Pedir combustível/i })
    expect(screen.queryByRole('link', { name: /Registar saída/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /Registar entrada/i })).toBeNull()
    expect(comb.className).toContain('bg-card')
    expect(comb.className).not.toMatch(/bg-primary/)
  })
})

