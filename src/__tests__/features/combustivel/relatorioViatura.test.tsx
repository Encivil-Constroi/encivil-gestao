import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import type { AbastecimentoAnaliseRow } from '@/features/combustivel/db'

const m = vi.hoisted(() => ({ rows: [] as AbastecimentoAnaliseRow[] }))

vi.mock('@/features/combustivel/hooks/usePedidos', () => ({
  useDadosAnalise: () => ({ abastecimentos: m.rows, anteriores: [], pedidos: [], loading: false, error: null }),
}))
vi.mock('@/app/lib/exportXlsx', () => ({ exportarXlsx: vi.fn(async () => {}) }))

import { RelatorioCombustivelPage } from '@/features/combustivel/components/relatorio/RelatorioCombustivelPage'

function linha(o: Partial<AbastecimentoAnaliseRow>): AbastecimentoAnaliseRow {
  return {
    id: 'a', veiculo_id: 'v1', data: new Date().toISOString().slice(0, 10), litros: 40, custo_total: 60, contador: null,
    responsavel: 'Zé', tipo_fonte: 'POLO2', tipo_combustivel: 'gasoleo', solicitante_id: null, colaborador_id: null,
    pedido_id: null, comb_veiculos: { nome: 'Ford Transit', codigo: 'V1', unidade_contador: 'km' }, ...o,
  }
}

function Onde() { const l = useLocation(); return <p data-testid="onde">{l.pathname + l.search}</p> }

function abrir(caminho: string, embutido = true) {
  render(
    <MemoryRouter initialEntries={[caminho]}>
      <Onde />
      <RelatorioCombustivelPage embutido={embutido} />
    </MemoryRouter>,
  )
}

beforeAll(() => {
  // O ResponsiveContainer do recharts precisa disto no jsdom
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
})
afterEach(cleanup)

describe('Análise de combustível — filtro de viatura na URL', () => {
  m.rows = [
    linha({ id: 'a1' }),
    linha({ id: 'a2', veiculo_id: 'v2', litros: 10, custo_total: 15, comb_veiculos: { nome: 'Hilux', codigo: 'V2', unidade_contador: 'km' } }),
  ]

  it('?viatura= pré-seleciona a viatura e filtra os números', () => {
    abrir('/abastecimento/analise?viatura=v2')
    expect(screen.getByLabelText('Viatura')).toHaveValue('v2')
    expect(screen.getByText('Abastecimentos').nextSibling).toHaveTextContent('1')
  })

  it('mudar a viatura atualiza a URL; "Todas" remove o parâmetro', () => {
    abrir('/abastecimento/analise')
    expect(screen.getByLabelText('Viatura')).toHaveValue('')
    fireEvent.change(screen.getByLabelText('Viatura'), { target: { value: 'v1' } })
    expect(screen.getByTestId('onde')).toHaveTextContent('/abastecimento/analise?viatura=v1')
    fireEvent.change(screen.getByLabelText('Viatura'), { target: { value: '' } })
    expect(screen.getByTestId('onde')).toHaveTextContent(/^\/abastecimento\/analise$/)
  })

  it('viatura sem abastecimentos no período continua escolhida', () => {
    abrir('/abastecimento/analise?viatura=v9')
    expect(screen.getByLabelText('Viatura')).toHaveValue('v9')
  })

  it('embutido não tem cabeçalho próprio; sozinho tem', () => {
    abrir('/abastecimento/analise')
    expect(screen.queryByRole('heading', { name: 'Relatório de combustível' })).not.toBeInTheDocument()
    cleanup()
    abrir('/combustivel/relatorio', false)
    expect(screen.getByRole('heading', { name: 'Relatório de combustível' })).toBeInTheDocument()
  })
})
