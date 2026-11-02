import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import type { FuelEntry } from '@/app/types'

const m = vi.hoisted(() => ({ papel: 'admin', entries: [] as FuelEntry[], aguardam: 0 }))

vi.mock('@/features/auth/useRole', () => ({
  useRole: () => ({ role: m.papel, isAdmin: m.papel === 'admin', isMotorista: false, podeCombustivel: true }),
}))
vi.mock('@/features/combustivel/hooks/useCombustivel', () => ({
  useAbastecimentos: () => ({ entries: m.entries, loading: false, reload: vi.fn() }),
  useVeiculos: () => ({ vehicles: [], loading: false }),
}))
vi.mock('@/features/combustivel/hooks/useAprovacao', () => ({
  usePodeAprovar: () => ({ podeAprovar: true }),
  useContagemAguardam: () => m.aguardam,
}))
vi.mock('@/app/lib/exportXlsx', () => ({ exportarXlsx: vi.fn(async () => {}) }))

import { HistoricoAbastecimentos } from '@/features/combustivel/components/modulo/HistoricoAbastecimentos'
import { AbastecimentoLayout } from '@/features/combustivel/components/modulo/AbastecimentoLayout'

function registo(o: Partial<FuelEntry> = {}): FuelEntry {
  return {
    id: 'a1', vehicleId: 'v1', vehicleName: 'Ford Transit', vehicleCode: 'V1', date: new Date('2026-11-02T10:00:00Z'),
    liters: 40, totalCost: 60, responsible: 'Zé', createdAt: new Date('2026-10-01T10:00:00Z'), pricePerLiter: 1.5, ...o,
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-02T12:00:00Z'))
  m.papel = 'admin'; m.aguardam = 0
  m.entries = [registo({ id: 'a1', date: new Date('2026-10-28T10:00:00Z') })]
})
afterEach(() => { cleanup(); vi.useRealTimers() })

const abrir = () => render(<MemoryRouter><HistoricoAbastecimentos /></MemoryRouter>)

describe('Histórico de abastecimentos: período', () => {
  it('o mês aparece com maiúscula no texto real, sem depender de CSS', () => {
    abrir()
    const chip = screen.getByRole('button', { name: 'Novembro de 2026' })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(chip.className).not.toContain('capitalize')
  })

  it('"Tudo" e o mês são chips; o mês anterior recua e o seguinte fica bloqueado no mês corrente', () => {
    abrir()
    const seguinte = screen.getByRole('button', { name: 'Mês seguinte' })
    expect(seguinte).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
    expect(screen.getByRole('button', { name: 'Outubro de 2026' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Mês seguinte' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Tudo' }))
    expect(screen.getByRole('button', { name: 'Tudo' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Outubro de 2026' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('o título do dia tem maiúscula no texto e a seta do mês é um Button de ícone', () => {
    abrir()
    const secao = screen.getByRole('region')
    const titulo = secao.querySelector('p')!
    expect(titulo.textContent).toMatch(/^[A-ZÁÉÍÓÚ]/)
    expect(titulo.className).not.toContain('capitalize')
    expect(screen.getByRole('button', { name: 'Mês anterior' }).className).toContain('size-10')
  })

  it('"Lançar registo manual" fica na linha do título da lista (admin)', () => {
    abrir()
    const link = screen.getByRole('link', { name: /Lançar registo manual/ })
    expect(link).toHaveAttribute('href', '/abastecimento/registo/novo')
    const linhaTitulo = link.closest('[data-linha-titulo]')
    expect(linhaTitulo).not.toBeNull()
    expect(within(linhaTitulo as HTMLElement).getByRole('heading', { name: 'Registos' })).toBeInTheDocument()
  })
})

describe('AbastecimentoLayout: separadores', () => {
  const layout = () => render(
    <MemoryRouter initialEntries={['/abastecimento']}>
      <Routes><Route path="/abastecimento" element={<AbastecimentoLayout />}><Route index element={<p>conteudo</p>} /></Route></Routes>
    </MemoryRouter>)

  it('usa a largura de página e marca o separador ativo', () => {
    layout()
    expect(screen.getByRole('heading', { level: 1, name: 'Abastecimento' }).closest('div[class*="max-w-6xl"]')).not.toBeNull()
    expect(screen.getByRole('link', { name: /^Pedidos/ })).toHaveAttribute('aria-current', 'page')
  })

  it('mostra quantos pedidos esperam dentro do separador Pedidos', () => {
    m.aguardam = 3
    layout()
    expect(screen.getByRole('link', { name: /^Pedidos.*3/ })).toBeInTheDocument()
  })
})
