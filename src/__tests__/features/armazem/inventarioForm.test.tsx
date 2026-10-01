import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router'
import { produto } from './inventarioMocks'

const estado = vi.hoisted(() => ({
  podeArmazem: true,
  existente: null as unknown,
  criar: vi.fn(), atualizar: vi.fn(),
}))

vi.mock('@/features/auth/useRole', () => ({ useRole: () => ({ podeArmazem: estado.podeArmazem }) }))
vi.mock('@/app/lib/fotosArmazem', () => ({ urlFotoArmazem: () => null }))
// O envio real da foto é testado à parte; aqui só interessa o id e o caminho que o formulário usa
vi.mock('@/app/components/FotoInput', () => ({
  FotoInput: ({ dono, valor, onChange }: { dono: { tipo: string; id: string }; valor: string | null; onChange: (c: string | null) => void }) => (
    <div>
      <p data-testid="foto-dono">{dono.tipo}/{dono.id}</p>
      <p data-testid="foto-valor">{valor ?? 'nenhuma'}</p>
      <button type="button" onClick={() => onChange(`${dono.tipo}/${dono.id}/1.jpg`)}>tirar foto</button>
    </div>
  ),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/produtos/hooks/useProdutos', () => ({
  useProduto: () => ({ product: estado.existente, loading: false }),
  useCodigoProdutoPreview: () => ({ codigo: 'P099', loading: false }),
  useCriarProduto: () => ({ criar: estado.criar, loading: false }),
  useAtualizarProduto: () => ({ atualizar: estado.atualizar, loading: false }),
}))

import { ProdutoFormPage } from '@/app/pages/armazem/ProdutoFormPage'

function Onde() {
  return <p data-testid="onde">{useLocation().pathname}</p>
}

function abrir(caminho: string) {
  render(
    <MemoryRouter initialEntries={[caminho]}>
      <Onde />
      <Routes>
        <Route path="/armazem/produto/novo" element={<ProdutoFormPage />} />
        <Route path="/armazem/produto/:id/editar" element={<ProdutoFormPage />} />
        <Route path="*" element={<p>OUTRA</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => { estado.criar.mockReset(); estado.atualizar.mockReset(); estado.existente = null; estado.podeArmazem = true })
afterEach(cleanup)

describe('ProdutoFormPage', () => {
  it('criar: valida o nome e não grava', () => {
    abrir('/armazem/produto/novo')
    fireEvent.click(screen.getByRole('button', { name: 'Criar artigo' }))
    expect(screen.getByText('Indique o nome do artigo.')).toBeInTheDocument()
    expect(estado.criar).not.toHaveBeenCalled()
  })

  it('criar: rejeita números negativos', () => {
    abrir('/armazem/produto/novo')
    fireEvent.change(screen.getByLabelText(/Nome/), { target: { value: 'Tijolo' } })
    fireEvent.change(screen.getByLabelText('Stock mínimo'), { target: { value: '-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar artigo' }))
    expect(screen.getByText('O stock mínimo não pode ser negativo.')).toBeInTheDocument()
    expect(estado.criar).not.toHaveBeenCalled()
  })

  it('criar: usa o mesmo id gerado na foto e no INSERT, e vai para o detalhe', async () => {
    estado.criar.mockImplementation(async (i: { id: string }) => produto({ id: i.id }))
    abrir('/armazem/produto/novo')
    expect(screen.getByDisplayValue('P099')).toBeInTheDocument()

    const idFoto = screen.getByTestId('foto-dono').textContent!.replace('produtos/', '')
    expect(idFoto).toMatch(/^[0-9a-f-]{36}$/)
    fireEvent.click(screen.getByText('tirar foto'))

    fireEvent.change(screen.getByLabelText(/Nome/), { target: { value: '  Tijolo 11  ' } })
    fireEvent.change(screen.getByLabelText('Stock inicial'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText('Stock mínimo'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('Custo unitário (€)'), { target: { value: '0.45' } })
    fireEvent.change(screen.getByLabelText(/Localização/), { target: { value: 'Pátio' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar artigo' }))

    await waitFor(() => expect(estado.criar).toHaveBeenCalledTimes(1))
    expect(estado.criar.mock.calls[0][0]).toMatchObject({
      id: idFoto, name: 'Tijolo 11', currentStock: 100, minStock: 20, unitCost: 0.45,
      localizacao: 'Pátio', fotoPath: `produtos/${idFoto}/1.jpg`,
    })
    await waitFor(() => expect(screen.getByTestId('onde')).toHaveTextContent(`/armazem/produto/${idFoto}`))
  })

  it('editar: preenche os dados, não mostra stock inicial e atualiza', async () => {
    estado.existente = produto({ id: 'p7', name: 'Cimento', minStock: 5, localizacao: 'A1' })
    estado.atualizar.mockResolvedValue(produto({ id: 'p7' }))
    abrir('/armazem/produto/p7/editar')
    expect(screen.getByLabelText(/Nome/)).toHaveValue('Cimento')
    expect(screen.getByDisplayValue('P001')).toBeInTheDocument()
    expect(screen.queryByLabelText('Stock inicial')).not.toBeInTheDocument()
    expect(screen.getByTestId('foto-dono')).toHaveTextContent('produtos/p7')

    fireEvent.change(screen.getByLabelText('Stock mínimo'), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar alterações' }))

    await waitFor(() => expect(estado.atualizar).toHaveBeenCalledTimes(1))
    expect(estado.atualizar.mock.calls[0][0]).toBe('p7')
    expect(estado.atualizar.mock.calls[0][1]).toMatchObject({ name: 'Cimento', minStock: 8, localizacao: 'A1' })
    expect(estado.atualizar.mock.calls[0][1]).not.toHaveProperty('currentStock')
    await waitFor(() => expect(screen.getByTestId('onde')).toHaveTextContent('/armazem/produto/p7'))
  })

  it('sem permissão não mostra o formulário', () => {
    estado.podeArmazem = false
    abrir('/armazem/produto/novo')
    expect(screen.getByText('Sem permissão')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Criar artigo' })).not.toBeInTheDocument()
  })
})
