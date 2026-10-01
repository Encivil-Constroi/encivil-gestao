import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router'
import { produto } from './inventarioMocks'

const estado = vi.hoisted(() => ({ podeArmazem: true, ativos: [] as unknown[], arquivados: [] as unknown[] }))

vi.mock('@/features/auth/useRole', () => ({ useRole: () => ({ podeArmazem: estado.podeArmazem }) }))
vi.mock('@/app/lib/fotosArmazem', () => ({
  urlFotoArmazem: (c: string | null) => (c ? `https://x.test/${c}` : null),
}))
vi.mock('@/app/lib/exportXlsx', () => ({ exportarXlsx: vi.fn() }))
vi.mock('@/features/produtos/hooks/useProdutos', () => ({
  useProdutos: () => ({ products: estado.ativos, loading: false, reload: vi.fn() }),
  useProdutosArquivados: () => ({ products: estado.arquivados, loading: false, reload: vi.fn() }),
  useRestaurarProduto: () => ({ restaurar: vi.fn().mockResolvedValue(true), loading: false }),
}))

// O localStorage do ambiente de testes não é fiável; um Map chega para a preferência de vista
const memoria = new Map<string, string>()
vi.stubGlobal('localStorage', { getItem: (k: string) => memoria.get(k) ?? null, setItem: (k: string, v: string) => { memoria.set(k, v) }, removeItem: (k: string) => { memoria.delete(k) }, clear: () => memoria.clear() })

import { InventarioPage } from '@/app/pages/armazem/InventarioPage'
import { exportarXlsx } from '@/app/lib/exportXlsx'

function Onde() {
  const l = useLocation()
  return <p data-testid="onde">{l.pathname}{l.search}</p>
}

function abrir() {
  render(
    <MemoryRouter initialEntries={['/armazem/inventario']}>
      <Onde />
      <Routes>
        <Route path="/armazem/inventario" element={<InventarioPage />} />
        <Route path="*" element={<p>OUTRA</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const dados = () => [
  produto({ id: 'a', code: 'P001', name: 'Cimento Portland', status: 'normal' }),
  produto({ id: 'b', code: 'P002', name: 'Tinta Branca', category: 'tinta', currentStock: 3, minStock: 10, status: 'baixo' }),
  produto({ id: 'c', code: 'P003', name: 'Areia Fina', category: 'areia-brita', currentStock: 0, status: 'sem-stock', fotoPath: 'produtos/c/1.jpg' }),
]

afterEach(() => { cleanup(); memoria.clear(); estado.podeArmazem = true; estado.arquivados = [] })

describe('InventarioPage', () => {
  it('mostra os artigos com estado e foto ou ícone da categoria', () => {
    estado.ativos = dados()
    abrir()
    expect(screen.getByText('Cimento Portland')).toBeInTheDocument()
    expect(screen.getAllByText('Stock baixo').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Sem stock').length).toBeGreaterThan(0)
    expect(screen.getByAltText('Areia Fina')).toHaveAttribute('src', 'https://x.test/produtos/c/1.jpg')
    expect(screen.getAllByTestId('sem-foto')).toHaveLength(2)
  })

  it('pesquisa por nome e por código', () => {
    estado.ativos = dados()
    abrir()
    fireEvent.change(screen.getByLabelText('Pesquisar artigos'), { target: { value: 'tinta' } })
    expect(screen.queryByText('Cimento Portland')).not.toBeInTheDocument()
    expect(screen.getByText('Tinta Branca')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Pesquisar artigos'), { target: { value: 'p003' } })
    expect(screen.getByText('Areia Fina')).toBeInTheDocument()
    expect(screen.queryByText('Tinta Branca')).not.toBeInTheDocument()
  })

  it('filtra por categoria e por estado', () => {
    estado.ativos = dados()
    abrir()
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'tinta' } })
    expect(screen.getByText('Tinta Branca')).toBeInTheDocument()
    expect(screen.queryByText('Areia Fina')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'todas' } })

    fireEvent.click(within(screen.getByRole('group', { name: 'Estado do stock' })).getByRole('button', { name: /Sem stock/ }))
    expect(screen.getByText('Areia Fina')).toBeInTheDocument()
    expect(screen.queryByText('Tinta Branca')).not.toBeInTheDocument()
    expect(screen.queryByText('Cimento Portland')).not.toBeInTheDocument()
  })

  it('mostra botões rápidos Entrada/Saída e Novo produto só com permissão', () => {
    estado.ativos = dados()
    abrir()
    expect(screen.getByRole('link', { name: 'Entrada de Cimento Portland' })).toHaveAttribute('href', '/armazem/movimento/entrada?produto=a')
    expect(screen.getByRole('link', { name: 'Saída de Cimento Portland' })).toHaveAttribute('href', '/armazem/movimento/saida?produto=a')
    expect(screen.getByRole('link', { name: /Novo produto/ })).toHaveAttribute('href', '/armazem/produto/novo')
    cleanup()

    estado.podeArmazem = false
    abrir()
    expect(screen.queryByRole('link', { name: /Entrada de/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Saída de/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Novo produto/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Arquivados/ })).not.toBeInTheDocument()
  })

  it('clicar no cartão abre o detalhe', () => {
    estado.ativos = dados()
    abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Tinta Branca' }))
    expect(screen.getByTestId('onde')).toHaveTextContent('/armazem/produto/b')
  })

  it('alterna para lista e guarda a preferência', () => {
    estado.ativos = dados()
    abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Ver em lista' }))
    expect(localStorage.getItem('armazem.inventario.vista')).toBe('lista')
    expect(screen.getByText('Cimento Portland')).toBeInTheDocument()
  })

  it('mostra arquivados com botão Restaurar', () => {
    estado.ativos = dados()
    estado.arquivados = [produto({ id: 'z', name: 'Velho', code: 'P009' })]
    abrir()
    fireEvent.click(screen.getByRole('button', { name: /Arquivados/ }))
    expect(screen.getByText('Velho')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Restaurar/ })).toBeInTheDocument()
    expect(screen.queryByText('Cimento Portland')).not.toBeInTheDocument()
  })

  it('exporta para Excel os artigos filtrados', () => {
    estado.ativos = dados()
    abrir()
    fireEvent.click(screen.getByRole('button', { name: /Excel/ }))
    expect(exportarXlsx).toHaveBeenCalledTimes(1)
    expect(vi.mocked(exportarXlsx).mock.calls[0][0]).toHaveLength(3)
  })

  it('sem resultados mostra estado vazio', () => {
    estado.ativos = []
    abrir()
    expect(screen.getByText('Nenhum artigo encontrado')).toBeInTheDocument()
  })
})
