import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router'
import { produto } from './inventarioMocks'
import type { MovimentoArtigo } from '@/features/produtos/services/produtosService'

const estado = vi.hoisted(() => ({
  podeArmazem: true,
  produto: null as unknown,
  movimentos: [] as unknown[],
  desativar: vi.fn(), deletar: vi.fn(),
}))

vi.mock('@/features/auth/useRole', () => ({ useRole: () => ({ podeArmazem: estado.podeArmazem }) }))
vi.mock('@/app/lib/fotosArmazem', () => ({ urlFotoArmazem: () => null }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/produtos/hooks/useProdutos', () => ({
  useProduto: () => ({ product: estado.produto, loading: false }),
  useMovimentosProduto: () => ({ movimentos: estado.movimentos, loading: false }),
  useDesativarProduto: () => ({ desativar: estado.desativar, loading: false }),
  useDeletarProduto: () => ({ deletar: estado.deletar, loading: false }),
}))

import { ProdutoDetalhePage } from '@/app/pages/armazem/ProdutoDetalhePage'

function Onde() {
  return <p data-testid="onde">{useLocation().pathname}</p>
}

function abrir() {
  render(
    <MemoryRouter initialEntries={['/armazem/produto/p1']}>
      <Onde />
      <Routes>
        <Route path="/armazem/produto/:id" element={<ProdutoDetalhePage />} />
        <Route path="*" element={<p>OUTRA</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

function mov(m: Partial<MovimentoArtigo>): MovimentoArtigo {
  return {
    id: 'm', tipo: 'entrada', subtipo: null, quantidade: 5, stockAntes: 0, stockDepois: 5, responsavel: 'Ana',
    obraId: null, obraNome: null, destino: null, fornecedor: null, cliente: null, numeroFatura: null,
    precoUnitario: null, observacoes: null, data: new Date('2026-09-30T10:00:00'), ...m,
  }
}

beforeEach(() => {
  estado.podeArmazem = true
  estado.produto = produto({ id: 'p1', currentStock: 3, minStock: 10, status: 'baixo', unitCost: 2 })
  estado.movimentos = []
  estado.desativar.mockReset(); estado.deletar.mockReset()
})
afterEach(cleanup)

describe('ProdutoDetalhePage', () => {
  it('mostra o stock em destaque com estado, mínimo e localização', () => {
    abrir()
    expect(screen.getByTestId('stock-atual')).toHaveTextContent('3')
    expect(screen.getAllByText('Stock baixo').length).toBeGreaterThan(0)
    expect(screen.getByText('Corredor A')).toBeInTheDocument()
    expect(screen.getByText('10 saco(s)')).toBeInTheDocument()
  })

  it('histórico traduz os subtipos e mostra obra, fornecedor, cliente e fatura', () => {
    estado.movimentos = [
      mov({ id: '1', tipo: 'entrada', subtipo: 'COMPRA', fornecedor: 'Leroy', numeroFatura: 'FT 12' }),
      mov({ id: '2', tipo: 'entrada', subtipo: 'DEVOLUCAO_OBRA', obraNome: 'Obra Sul' }),
      mov({ id: '3', tipo: 'saida', subtipo: 'OBRA', obraNome: 'Obra Norte' }),
      mov({ id: '4', tipo: 'saida', subtipo: 'VENDA', cliente: 'Cliente Lda' }),
      mov({ id: '5', tipo: 'saida', subtipo: 'QUEBRA' }),
      mov({ id: '6', tipo: 'ajuste', subtipo: 'INVENTARIO' }),
      mov({ id: '7', tipo: 'entrada', subtipo: 'PROPRIO_ENCIVIL' }),
      mov({ id: '8', tipo: 'entrada', subtipo: 'ACERTO' }),
    ]
    abrir()
    const historico = within(screen.getByRole('region', { name: 'Histórico de movimentos' }))
    for (const t of ['Compra', 'Devolução de obra', 'Para obra', 'Venda', 'Quebra', 'Inventário', 'Próprio ENCIVIL', 'Acerto']) {
      expect(historico.getByText(t)).toBeInTheDocument()
    }
    expect(historico.getByText('Leroy')).toBeInTheDocument()
    expect(historico.getByText('Fatura FT 12')).toBeInTheDocument()
    expect(historico.getByText('Obra Norte')).toBeInTheDocument()
    expect(historico.getByText('Cliente Lda')).toBeInTheDocument()
  })

  it('registos antigos sem subtipo mostram Entrada/Saída/Ajuste', () => {
    estado.movimentos = [mov({ id: '1', tipo: 'entrada' }), mov({ id: '2', tipo: 'saida' }), mov({ id: '3', tipo: 'ajuste' })]
    abrir()
    const historico = within(screen.getByRole('region', { name: 'Histórico de movimentos' }))
    expect(historico.getByText('Entrada')).toBeInTheDocument()
    expect(historico.getByText('Saída')).toBeInTheDocument()
    expect(historico.getByText('Ajuste')).toBeInTheDocument()
  })

  it('com permissão mostra as ações e os links certos', () => {
    abrir()
    expect(screen.getByRole('link', { name: /Entrada/ })).toHaveAttribute('href', '/armazem/movimento/entrada?produto=p1')
    expect(screen.getByRole('link', { name: /Saída/ })).toHaveAttribute('href', '/armazem/movimento/saida?produto=p1')
    expect(screen.getByRole('link', { name: /Editar/ })).toHaveAttribute('href', '/armazem/produto/p1/editar')
    expect(screen.getByRole('button', { name: /Arquivar/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Eliminar/ })).toBeInTheDocument()
  })

  it('não permite eliminar um artigo com movimentos', () => {
    estado.movimentos = [mov({ id: '1' })]
    abrir()
    expect(screen.queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument()
  })

  it('sem permissão esconde todas as ações', () => {
    estado.podeArmazem = false
    abrir()
    expect(screen.queryByRole('link', { name: /Editar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Entrada/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Arquivar/ })).not.toBeInTheDocument()
  })

  it('arquivar pede confirmação e volta ao inventário', async () => {
    estado.desativar.mockResolvedValue(true)
    abrir()
    fireEvent.click(screen.getByRole('button', { name: /Arquivar/ }))
    expect(estado.desativar).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: 'Arquivar' }).at(-1)!)
    await waitFor(() => expect(estado.desativar).toHaveBeenCalledWith('p1'))
    await waitFor(() => expect(screen.getByTestId('onde')).toHaveTextContent('/armazem/inventario'))
  })

  it('artigo inexistente mostra aviso', () => {
    estado.produto = undefined
    abrir()
    expect(screen.getByText('Artigo não encontrado')).toBeInTheDocument()
  })
})
