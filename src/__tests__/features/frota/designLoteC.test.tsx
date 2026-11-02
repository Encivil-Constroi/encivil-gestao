import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import type { ResumoViaturaRow, VeiculoFrotaRow } from '@/features/frota/db'
import { resumo, mockUseRole } from './frotaFixtures'

const mocks = vi.hoisted(() => ({ role: 'mecanico' as string, viaturas: [] as ResumoViaturaRow[], detalhe: null as unknown as VeiculoFrotaRow }))

vi.mock('@/features/auth/useRole', () => ({ useRole: () => mockUseRole(mocks.role) }))
vi.mock('@/features/frota/hooks/useFrota', () => ({
  useResumoFrota: () => ({ viaturas: mocks.viaturas, loading: false, error: null, reload: vi.fn() }),
  useFichaViatura: () => ({
    ficha: {
      viatura: { id: 'v1', codigo: 'V-01', nome: 'Carrinha', identificacao: '50-AA-50', tipo: 'viatura', unidadeContador: 'km' },
      detalhe: mocks.detalhe, obraNome: null, kmAtual: 9800, itens: [], alertas: [], manutencoes: [], checklists: [], atribuicoes: [],
      colaboradores: new Map(),
    },
    loading: false, error: null, reload: vi.fn(),
  }),
  useCatalogo: () => ({ catalogo: [], loading: false, error: null, reload: vi.fn() }),
  useLinhaTempo: () => ({ eventos: [], loading: false, error: null, reload: vi.fn() }),
  useDefinirEstadoViatura: () => ({ definir: vi.fn(), loading: false }),
}))
vi.mock('@/features/frota/services/frotaService', () => ({ urlFotoChecklist: (k: string) => k }))
vi.mock('@/features/frota/lib/fotosFrota', () => ({ urlFotoDocumento: () => null }))
vi.mock('@/features/frota/hooks/useManutencao', () => ({
  useDiaDaViatura: () => ({ dia: { manutencoes: [], edicoes: [] }, loading: false, error: null }),
  useHistoricoManutencoes: () => ({
    linhas: [{
      id: 'm1', veiculo_id: 'v1', veiculo_nome: 'Carrinha', identificacao: '50-AA-50', unidade_contador: 'km', item_id: null,
      item_rotulo: null, descricao: 'Lâmpada', data: '2026-11-02', km_na_altura: null, custo: null, oficina: null,
      observacoes: null, condutor_nome: null, registado_por: 'Carlos', registado_em: '2026-11-02T10:30:00',
      editado_por: null, editado_em: null,
    }],
    loading: false, error: null,
  }),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { FrotaLayout } from '@/features/frota/components/FrotaLayout'
import { ViaturasListaPage } from '@/features/frota/components/ViaturasListaPage'
import { FichaViaturaPage } from '@/features/frota/components/FichaViaturaPage'
import { DetalheDia } from '@/features/frota/components/manutencao/DetalheDia'
import { HistoricoManutencoes } from '@/features/frota/components/manutencao/HistoricoManutencoes'

beforeEach(() => {
  mocks.role = 'mecanico'
  mocks.viaturas = [
    resumo({ id: 'a', identificacao: '50-AA-50' }),
    resumo({ id: 'g', identificacao: 'GIR-01', tipo: 'maquina', unidade_contador: 'horas' }),
  ]
  mocks.detalhe = {
    id: 'v1', codigo: 'V-01', nome: 'Carrinha', marca: 'Toyota', modelo: 'Hilux', identificacao: '50-AA-50', tipo: 'viatura',
    tipo_combustivel: 'gasoleo', unidade_contador: 'km', estado_operacional: 'LIVRE', obra_atual_id: null,
    data_ultima_revisao: null, km_ultima_revisao: null, km_registo: 8000, data_fim_seguro: null, seguro_foto_path: null,
    data_proxima_ipo: null, ipo_foto_path: null, observacoes: null, ativo: true, created_at: '2026-01-15T10:00:00Z', created_by: null,
  }
})
afterEach(cleanup)

describe('FrotaLayout', () => {
  it('usa a largura de página, cabeçalho e separadores com o ativo assinalado', () => {
    render(
      <MemoryRouter initialEntries={['/frota/viaturas']}>
        <Routes><Route path="/frota" element={<FrotaLayout />}><Route path="viaturas" element={<p>x</p>} /></Route></Routes>
      </MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: 'Frota' }).closest('div[class*="max-w-6xl"]')).not.toBeNull()
    expect(screen.getByRole('navigation', { name: 'Secções da frota' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Viaturas e máquinas/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /Nova viatura/ }).className).toContain('h-10')
  })
})

describe('ViaturasListaPage: chips', () => {
  const abrir = () => render(
    <MemoryRouter initialEntries={['/frota/viaturas']}>
      <Routes><Route path="/frota/viaturas" element={<ViaturasListaPage />} /></Routes>
    </MemoryRouter>)

  it('estado e classe usam FiltroChips (alvo mínimo) e o chip de classe filtra', () => {
    abrir()
    const maquinas = screen.getByRole('button', { name: 'Máquinas' })
    expect(maquinas.className).toContain('min-h-10')
    expect(screen.getByRole('button', { name: /^Livres/ }).className).toContain('min-h-10')
    expect(screen.getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(maquinas)
    expect(screen.getByRole('button', { name: 'Máquinas' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('50-AA-50')).not.toBeInTheDocument()
    expect(screen.getByText('GIR-01')).toBeInTheDocument()
  })
})

describe('Datas com maiúscula inicial no texto', () => {
  it('DetalheDia: "Segunda-feira, 2 de novembro de 2026"', () => {
    render(<MemoryRouter><DetalheDia veiculoId="v1" nomeViatura="Carrinha" data="2026-11-02" catalogo={[]} podeEditar={false} aoFechar={() => {}} /></MemoryRouter>)
    const t = screen.getByText('Segunda-feira, 2 de novembro de 2026')
    expect(t.className).not.toContain('capitalize')
  })

  it('HistoricoManutencoes: título do dia', () => {
    render(<MemoryRouter><HistoricoManutencoes viaturas={[]} catalogo={[]} podeEditar={false} /></MemoryRouter>)
    const t = screen.getByRole('heading', { level: 3 })
    expect(t).toHaveTextContent('Segunda-feira, 2 de novembro de 2026')
    expect(t.className).not.toContain('capitalize')
  })
})

describe('FichaViaturaPage: cabeçalho', () => {
  it('largura de página e "Voltar" leva à lista de viaturas', () => {
    render(
      <MemoryRouter initialEntries={['/frota/viatura/v1']}>
        <Routes><Route path="/frota/viatura/:id" element={<FichaViaturaPage />} /></Routes>
      </MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '/frota/viaturas')
    expect(screen.getByRole('heading', { level: 1 }).closest('div[class*="max-w-6xl"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Tudo' }).className).toContain('min-h-10')
  })
})
