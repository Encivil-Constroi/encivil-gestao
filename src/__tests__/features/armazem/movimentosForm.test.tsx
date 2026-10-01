import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router'
import type { ArtigoArmazem } from '@/features/movimentos/services/armazemService'

const m = vi.hoisted(() => ({
  papel: 'armazem', nome: 'Rui Silva',
  registar: vi.fn(), erro: null as string | null,
}))

vi.mock('@/features/auth/useRole', () => ({
  useRole: () => ({ role: m.papel, nome: m.nome, isAdmin: m.papel === 'admin', isGestor: m.papel === 'gestor', podeArmazem: true }),
}))
vi.mock('@/features/obras/hooks/useObras', () => ({
  useObras: () => ({
    obras: [
      { id: 'o1', name: 'Moradia Cascais', status: 'ativa' },
      { id: 'o2', name: 'Prédio Sintra', status: 'concluida' },
    ], loading: false,
  }),
}))
vi.mock('@/app/lib/fotosArmazem', () => ({ urlFotoArmazem: () => null }))

const artigos: ArtigoArmazem[] = [
  { id: 'p1', nome: 'Cimento CEM II', codigo: 'CIM-01', unidade: 'saco', stockAtual: 10, stockMinimo: 5, custoUnitario: 6, fotoPath: null },
  { id: 'p2', nome: 'Areia fina', codigo: 'ARE-01', unidade: 'm3', stockAtual: 0, stockMinimo: 2, custoUnitario: 20, fotoPath: null },
]
vi.mock('@/features/movimentos/hooks/useArmazem', () => ({
  useArtigosArmazem: () => ({ artigos, loading: false }),
  useFornecedoresUsados: () => ['Leroy Merlin', 'Bricomarché'],
  useRegistarMovimentoArmazem: () => ({ registar: m.registar, loading: false, error: m.erro }),
}))

import { MovimentoFormPage } from '@/app/pages/armazem/MovimentoFormPage'

function Onde() { const l = useLocation(); return <p data-testid="onde">{l.pathname}</p> }

function abrir(tipo: 'entrada' | 'saida', url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Onde />
      <Routes><Route path="/armazem/movimento/*" element={<MovimentoFormPage tipo={tipo} />} /><Route path="*" element={<p>OUTRO</p>} /></Routes>
    </MemoryRouter>)
}

async function escolherArtigo(nome: string) {
  fireEvent.click(screen.getByRole('button', { name: /Escolha o artigo/ }))
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(nome) }))
}
const qtd = (v: string) => fireEvent.change(screen.getByLabelText(/Quantidade|Stock contado/), { target: { value: v } })
const submit = () => screen.getByRole('button', { name: /Registar (entrada|saída)/ })

beforeEach(() => { m.papel = 'armazem'; m.erro = null; m.registar.mockReset(); m.registar.mockResolvedValue('ok') })
afterEach(cleanup)

describe('entrada', () => {
  it('compra: pede fornecedor, mostra stock atual e depois e chama a RPC com os argumentos certos', async () => {
    abrir('entrada', '/armazem/movimento/entrada')
    await escolherArtigo('Cimento')
    expect(screen.getByTestId('stock-atual')).toHaveTextContent('10')
    qtd('5')
    expect(screen.getByTestId('stock-depois')).toHaveTextContent('15')
    expect(submit()).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Fornecedor/), { target: { value: 'Leroy Merlin' } })
    fireEvent.change(screen.getByLabelText(/Preço unitário/), { target: { value: '7.5' } })
    expect(screen.getByText(/Atualiza o custo do artigo/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/N.º de fatura/), { target: { value: 'FT 2026/55' } })
    expect(submit()).toBeEnabled()
    fireEvent.click(submit())
    await waitFor(() => expect(m.registar).toHaveBeenCalledTimes(1))
    expect(m.registar).toHaveBeenCalledWith({
      produtoId: 'p1', subtipo: 'COMPRA', quantidade: 5, responsavel: 'Rui Silva', obraId: null,
      fornecedor: 'Leroy Merlin', numeroFatura: 'FT 2026/55', cliente: null, precoUnitario: 7.5, observacoes: null,
    })
    await waitFor(() => expect(screen.getByTestId('onde').textContent).toBe('/armazem/movimentos'))
  })

  it('atalho ENCIVIL preenche o fornecedor', async () => {
    abrir('entrada', '/armazem/movimento/entrada')
    await escolherArtigo('Cimento'); qtd('1')
    fireEvent.click(screen.getByRole('button', { name: 'ENCIVIL' }))
    expect(screen.getByLabelText(/Fornecedor/)).toHaveValue('ENCIVIL')
    expect(submit()).toBeEnabled()
  })

  it('devolução de obra: pede a obra (qualquer uma, incluindo concluída) e não pede fornecedor', async () => {
    abrir('entrada', '/armazem/movimento/entrada?tipo=DEVOLUCAO_OBRA')
    await escolherArtigo('Cimento'); qtd('2')
    expect(screen.queryByLabelText(/Fornecedor/)).not.toBeInTheDocument()
    expect(submit()).toBeDisabled()
    const obra = screen.getByLabelText(/Obra de onde volta/)
    expect(within(obra).getAllByRole('option').map(o => o.textContent)).toContain('Prédio Sintra (concluída)')
    fireEvent.change(obra, { target: { value: 'o2' } })
    fireEvent.click(submit())
    await waitFor(() => expect(m.registar).toHaveBeenCalledWith(expect.objectContaining({ subtipo: 'DEVOLUCAO_OBRA', obraId: 'o2', fornecedor: null })))
  })

  it('pré-seleciona artigo e obra pelos parâmetros do endereço', async () => {
    abrir('entrada', '/armazem/movimento/entrada?tipo=DEVOLUCAO_OBRA&obra=o1&produto=p1')
    expect(await screen.findByText('Cimento CEM II')).toBeInTheDocument()
    expect(screen.getByLabelText(/Obra de onde volta/)).toHaveValue('o1')
  })

  it('stock próprio não leva fornecedor nem obra', async () => {
    abrir('entrada', '/armazem/movimento/entrada?tipo=PROPRIO_ENCIVIL')
    await escolherArtigo('Cimento'); qtd('3')
    expect(screen.queryByLabelText(/Fornecedor/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Obra/)).not.toBeInTheDocument()
    fireEvent.click(submit())
    await waitFor(() => expect(m.registar).toHaveBeenCalledWith(expect.objectContaining({ subtipo: 'PROPRIO_ENCIVIL', obraId: null, fornecedor: null })))
  })

  it('contagem de inventário só para admin/gestor, mostra a diferença', async () => {
    abrir('entrada', '/armazem/movimento/entrada')
    expect(screen.queryByRole('radio', { name: /Contagem de inventário/ })).not.toBeInTheDocument()
    cleanup()
    m.papel = 'gestor'
    abrir('entrada', '/armazem/movimento/entrada')
    fireEvent.click(screen.getByRole('radio', { name: /Contagem de inventário/ }))
    await escolherArtigo('Cimento'); qtd('7')
    expect(screen.getByTestId('diferenca').textContent).toMatch(/3/)
    expect(screen.getByTestId('stock-depois')).toHaveTextContent('7')
    fireEvent.click(submit())
    await waitFor(() => expect(m.registar).toHaveBeenCalledWith(expect.objectContaining({ subtipo: 'INVENTARIO', quantidade: 7 })))
  })

  it('erro do servidor aparece tal como vem', () => {
    m.erro = 'Escolha a obra'
    abrir('entrada', '/armazem/movimento/entrada')
    expect(screen.getByRole('alert')).toHaveTextContent('Escolha a obra')
  })

  it('guardado offline volta ao detalhe do artigo', async () => {
    m.registar.mockResolvedValue('guardado-offline')
    abrir('entrada', '/armazem/movimento/entrada?tipo=ACERTO&produto=p1')
    await screen.findByText('Cimento CEM II'); qtd('1')
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByTestId('onde')).toHaveTextContent('/armazem/produto/p1'))
  })
})

describe('saída', () => {
  it('bloqueia quantidade acima do stock com mensagem clara', async () => {
    abrir('saida', '/armazem/movimento/saida')
    await escolherArtigo('Cimento'); qtd('11')
    expect(screen.getByRole('alert')).toHaveTextContent('Stock insuficiente: há 10')
    fireEvent.change(screen.getByLabelText(/Obra em execução/), { target: { value: 'o1' } })
    expect(submit()).toBeDisabled()
    qtd('10')
    expect(submit()).toBeEnabled()
  })

  it('para obra: só obras ativas; envia obraId', async () => {
    abrir('saida', '/armazem/movimento/saida?obra=o1')
    await escolherArtigo('Cimento'); qtd('4')
    const obra = screen.getByLabelText(/Obra em execução/)
    expect(within(obra).getAllByRole('option').map(o => o.textContent)).toEqual(['Escolha a obra', 'Moradia Cascais'])
    expect(obra).toHaveValue('o1')
    fireEvent.click(submit())
    await waitFor(() => expect(m.registar).toHaveBeenCalledWith(expect.objectContaining({ subtipo: 'OBRA', obraId: 'o1', quantidade: 4, cliente: null })))
  })

  it('venda: cliente obrigatório e total = preço × quantidade', async () => {
    abrir('saida', '/armazem/movimento/saida?tipo=VENDA')
    await escolherArtigo('Cimento'); qtd('3')
    expect(screen.queryByLabelText(/Obra/)).not.toBeInTheDocument()
    expect(submit()).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Preço de venda/), { target: { value: '12.5' } })
    expect(screen.getByTestId('total-venda').textContent).toMatch(/37,50/)
    fireEvent.change(screen.getByLabelText(/Cliente/), { target: { value: 'José Pinto' } })
    fireEvent.click(submit())
    await waitFor(() => expect(m.registar).toHaveBeenCalledWith(expect.objectContaining({
      subtipo: 'VENDA', cliente: 'José Pinto', precoUnitario: 12.5, obraId: null, fornecedor: null })))
  })

  it('quebra não pede obra nem cliente', async () => {
    abrir('saida', '/armazem/movimento/saida?tipo=QUEBRA')
    await escolherArtigo('Cimento'); qtd('1')
    expect(submit()).toBeEnabled()
  })
})
