import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { RelatorioListaRow } from '@/features/obras/db'

const m = vi.hoisted(() => ({ relatorios: [] as RelatorioListaRow[] }))
vi.mock('@/features/obras/hooks/useRelatoriosDiarios', () => ({
  useRelatoriosDiarios: () => ({ relatorios: m.relatorios, loading: false, error: null, reload: vi.fn() }),
}))
vi.mock('@/features/obras/hooks/useObras', () => ({
  usePainelObras: () => ({ obras: [{ obra_id: 'obra-1', nome: 'Escola' }, { obra_id: 'obra-2', nome: 'Pavilhão' }] }),
}))

import { RelatoriosDiariosPage } from '@/features/obras/components/RelatoriosDiariosPage'

const linha = (id: string, autor: string, ocorrencias: boolean): RelatorioListaRow => ({
  id, obra_id: 'obra-1', obra_nome: 'Escola', data: '2026-10-01', estado: 'submetido', clima: 'SOL',
  houve_ocorrencias: ocorrencias, trabalhos: 'Betonagem', n_fotos: ocorrencias ? 1 : 0,
  n_equipa: 2, autor_id: autor, autor_nome: autor === 'a1' ? 'Ana' : 'Rui', submetido_em: '2026-10-01T12:00:00Z',
})

afterEach(() => { cleanup(); m.relatorios = [] })

describe('lista de relatórios diários', () => {
  it('destaca ocorrências e abre o relatório escolhido', () => {
    m.relatorios = [linha('r1', 'a1', true), linha('r2', 'a2', false)]
    render(<MemoryRouter><RelatoriosDiariosPage /></MemoryRouter>)
    expect(screen.getByText('Ocorrências')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ana/ })).toHaveAttribute('href', '/obras/relatorio-diario/r1')
  })

  it('filtra por autor mantendo a lista global', () => {
    m.relatorios = [linha('r1', 'a1', true), linha('r2', 'a2', false)]
    render(<MemoryRouter initialEntries={['/obras/relatorios']}><Routes><Route path="/obras/relatorios" element={<RelatoriosDiariosPage />} /></Routes></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('Autor'), { target: { value: 'a1' } })
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/obras/relatorio-diario/r1')
  })
})
