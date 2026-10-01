import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { MovimentoArmazem } from '@/features/movimentos/services/armazemService'

const m = vi.hoisted(() => ({
  filtros: [] as { filtros: Record<string, unknown>; pagina: number }[],
  movs: [] as unknown[], total: 0, exportar: vi.fn(), xlsx: vi.fn(),
}))

vi.mock('@/features/obras/hooks/useObras', () => ({ useObras: () => ({ obras: [{ id: 'o1', name: 'Moradia Cascais', status: 'ativa' }], loading: false }) }))
vi.mock('@/app/lib/fotosArmazem', () => ({ urlFotoArmazem: () => null }))
vi.mock('@/app/lib/exportXlsx', () => ({ exportarXlsx: m.xlsx }))
vi.mock('@/features/movimentos/hooks/useArmazem', () => ({
  useArtigosArmazem: () => ({ artigos: [{ id: 'p1', nome: 'Cimento CEM II' }], loading: false }),
  useMovimentosArmazem: (filtros: Record<string, unknown>, pagina: number) => {
    m.filtros.push({ filtros, pagina })
    return { movimentos: m.movs, total: m.total, loading: false, error: null }
  },
}))
vi.mock('@/features/movimentos/services/armazemService', async orig => ({
  ...(await orig<typeof import('@/features/movimentos/services/armazemService')>()),
  exportarMovimentosArmazem: m.exportar,
}))

import { MovimentosPage } from '@/app/pages/armazem/MovimentosPage'

function mov(o: Partial<MovimentoArmazem>): MovimentoArmazem {
  return {
    id: 'm1', produtoId: 'p1', produtoNome: 'Cimento CEM II', produtoCodigo: 'CIM', unidade: 'saco', fotoPath: null, tipo: 'entrada', subtipo: 'COMPRA',
    quantidade: 10, stockAntes: 5, stockDepois: 15, responsavel: 'Rui', destino: null, obraId: null, obraNome: null, fornecedor: 'Leroy', cliente: null,
    numeroFatura: 'FT 1', precoUnitario: 6, observacoes: null, data: new Date(2026, 8, 10, 10, 0), ...o,
  }
}

const ultimo = () => m.filtros[m.filtros.length - 1]

beforeEach(() => {
  m.filtros = []; m.total = 3
  m.movs = [
    mov({ id: 'a' }),
    mov({ id: 'b', tipo: 'saida', subtipo: 'OBRA', quantidade: 4, stockAntes: 15, stockDepois: 11, fornecedor: null, numeroFatura: null, precoUnitario: null, obraNome: 'Moradia Cascais', obraId: 'o1', data: new Date(2026, 8, 10, 15, 0) }),
    mov({ id: 'c', tipo: 'saida', subtipo: 'VENDA', cliente: 'José', fornecedor: null, data: new Date(2026, 8, 8, 9, 0) }),
  ]
  m.exportar.mockReset(); m.exportar.mockResolvedValue(m.movs); m.xlsx.mockReset()
})
afterEach(cleanup)

const abrir = (url = '/armazem/movimentos') => render(<MemoryRouter initialEntries={[url]}><MovimentosPage /></MemoryRouter>)

describe('histórico do armazém', () => {
  it('agrupa por dia e mostra subtipo, quantidade ±, stock antes→depois, obra, fornecedor, cliente e fatura', () => {
    abrir()
    const dias = screen.getAllByRole('region')
    expect(dias).toHaveLength(2)
    const linhasDia1 = within(dias[0]).getAllByTestId('movimento')
    expect(linhasDia1).toHaveLength(2)
    expect(linhasDia1[0]).toHaveTextContent('Compra')
    expect(linhasDia1[0]).toHaveTextContent('+10')
    expect(linhasDia1[0]).toHaveTextContent('5 → 15')
    expect(linhasDia1[0]).toHaveTextContent('Fornecedor Leroy')
    expect(linhasDia1[0]).toHaveTextContent('Fatura FT 1')
    expect(linhasDia1[1]).toHaveTextContent('Saída para obra')
    expect(linhasDia1[1]).toHaveTextContent('−4')
    expect(linhasDia1[1]).toHaveTextContent('Moradia Cascais')
    expect(within(dias[1]).getByTestId('movimento')).toHaveTextContent('Cliente José')
  })

  it('começa no mês corrente; os filtros chegam ao serviço', () => {
    abrir()
    expect(ultimo().filtros).toMatchObject({ desde: expect.any(String), tipo: undefined })
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'saida' } })
    expect(ultimo().filtros).toMatchObject({ tipo: 'saida' })
    fireEvent.change(screen.getByLabelText('Subtipo'), { target: { value: 'VENDA' } })
    fireEvent.change(screen.getByLabelText('Obra'), { target: { value: 'o1' } })
    fireEvent.change(screen.getByLabelText('Artigo'), { target: { value: 'p1' } })
    fireEvent.change(screen.getByLabelText('Período'), { target: { value: 'todos' } })
    fireEvent.change(screen.getByLabelText('Pesquisar movimentos'), { target: { value: ' FT 1 ' } })
    expect(ultimo()).toMatchObject({ pagina: 0, filtros: { tipo: 'saida', subtipo: 'VENDA', obraId: 'o1', produtoId: 'p1', desde: undefined, pesquisa: 'FT 1' } })
  })

  it('mudar o tipo limpa o subtipo; "Limpar filtros" repõe tudo', () => {
    abrir()
    fireEvent.change(screen.getByLabelText('Subtipo'), { target: { value: 'COMPRA' } })
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'saida' } })
    expect(ultimo().filtros).toMatchObject({ subtipo: undefined })
    fireEvent.click(screen.getByRole('button', { name: /Limpar filtros/ }))
    expect(ultimo().filtros).toMatchObject({ tipo: undefined, desde: expect.any(String) })
    expect(screen.queryByRole('button', { name: /Limpar filtros/ })).not.toBeInTheDocument()
  })

  it('o artigo vem pré-filtrado pelo endereço', () => {
    abrir('/armazem/movimentos?produto=p1')
    expect(ultimo().filtros).toMatchObject({ produtoId: 'p1' })
  })

  it('paginação avança de 50 em 50', () => {
    m.total = 120
    abrir()
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Página seguinte' }))
    expect(ultimo().pagina).toBe(1)
  })

  it('exportar Excel usa os filtros atuais e as colunas novas', async () => {
    abrir()
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'entrada' } })
    fireEvent.click(screen.getByRole('button', { name: /Excel/ }))
    await waitFor(() => expect(m.xlsx).toHaveBeenCalled())
    expect(m.exportar).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'entrada' }))
    const [linhas, nome] = m.xlsx.mock.calls[0]
    expect(nome).toBe('movimentos_armazem')
    expect(Object.keys(linhas[0])).toEqual(expect.arrayContaining(['Fornecedor', 'Cliente', 'N.º fatura', 'Stock antes', 'Stock depois', 'Obra']))
    expect(linhas[0].Tipo).toBe('Compra')
  })

  it('sem resultados mostra o estado vazio', () => {
    m.movs = []; m.total = 0
    abrir()
    expect(screen.getByText('Sem movimentos')).toBeInTheDocument()
  })
})
