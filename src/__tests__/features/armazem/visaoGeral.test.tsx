import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { ArtigoArmazem, EmprestimoAtivo, GarantiaFerramenta, MaterialObra, MovimentoArmazem } from '@/features/movimentos/services/armazemService'
import { estadoGarantia, resumirArmazem } from '@/features/movimentos/armazemRegras'

const m = vi.hoisted(() => ({
  papel: 'armazem', artigos: [] as unknown[], emp: [] as unknown[], gar: [] as unknown[], mat: [] as unknown[], mov: [] as unknown[],
}))

vi.mock('@/features/auth/useRole', () => ({ useRole: () => ({ podeArmazem: m.papel !== 'leitura' }) }))
vi.mock('@/app/lib/fotosArmazem', () => ({ urlFotoArmazem: () => null }))
vi.mock('@/features/movimentos/hooks/useArmazem', () => ({
  useArtigosArmazem: () => ({ artigos: m.artigos, loading: false }),
  useEmprestimosAtivos: () => ({ emprestimos: m.emp, loading: false }),
  useGarantiasFerramentas: () => ({ garantias: m.gar, loading: false }),
  useMateriaisPorObra: () => ({ materiais: m.mat, loading: false }),
  useMovimentosArmazem: () => ({ movimentos: m.mov, total: m.mov.length, loading: false }),
}))

import { VisaoGeralPage } from '@/app/pages/armazem/VisaoGeralPage'

const dia = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const art = (o: Partial<ArtigoArmazem>): ArtigoArmazem => ({ id: 'a', nome: 'X', codigo: 'X', unidade: 'un', stockAtual: 10, stockMinimo: 2, custoUnitario: 1, fotoPath: null, ...o })
const gar = (id: string, n: number): GarantiaFerramenta => ({ id, nome: `Ferr ${id}`, codigo: id, garantiaAte: dia(n), fotoPath: null })
const matObra = (o: Partial<MaterialObra>): MaterialObra => ({
  obraId: 'o1', obraNome: 'Moradia', obraEstado: 'ativa', produtoId: 'a1', produtoNome: 'Cimento', produtoCodigo: 'C', unidade: 'saco', fotoPath: null,
  enviado: 5, devolvido: 0, liquido: 5, valor: 30, ultimoMovimento: new Date(), ...o,
})

beforeEach(() => {
  m.papel = 'armazem'
  m.artigos = [
    art({ id: 'a1', nome: 'Cimento', stockAtual: 10, stockMinimo: 5, custoUnitario: 6 }),
    art({ id: 'a2', nome: 'Areia', stockAtual: 2, stockMinimo: 5, custoUnitario: 10 }),
    art({ id: 'a3', nome: 'Tijolo', stockAtual: 0, stockMinimo: 5, custoUnitario: 1 }),
  ]
  const emprestimos: EmprestimoAtivo[] = [
    { id: 'e1', ferramentaId: 'f1', ferramentaNome: 'Berbequim', ferramentaCodigo: 'F1', fotoPath: null, funcionario: 'Zé', desde: new Date(), previstaDevolucao: dia(-3), obraId: 'o1', destino: null },
    { id: 'e2', ferramentaId: 'f2', ferramentaNome: 'Serra', ferramentaCodigo: 'F2', fotoPath: null, funcionario: 'Rui', desde: new Date(), previstaDevolucao: dia(5), obraId: null, destino: null },
  ]
  m.emp = emprestimos
  m.gar = [gar('g1', 10), gar('g2', 30), gar('g3', 31), gar('g4', -1), gar('g5', 0)]
  m.mat = [
    matObra({}),
    matObra({ obraId: 'o2', obraNome: 'Prédio', produtoId: 'a2', produtoNome: 'Areia', valor: 200 }),
    matObra({ obraId: 'o3', obraNome: 'Concluída', obraEstado: 'concluida', produtoId: 'a2', produtoNome: 'Areia', valor: 900 }),
  ]
  const movimento: MovimentoArmazem = {
    id: 'm1', produtoId: 'a1', produtoNome: 'Cimento', produtoCodigo: 'C', unidade: 'saco', fotoPath: null, tipo: 'entrada', subtipo: 'COMPRA', quantidade: 10,
    stockAntes: 0, stockDepois: 10, responsavel: 'Rui', destino: null, obraId: null, obraNome: null, fornecedor: 'X', cliente: null, numeroFatura: null,
    precoUnitario: null, observacoes: null, data: new Date(),
  }
  m.mov = [movimento]
})
afterEach(cleanup)

const abrir = () => render(<MemoryRouter><VisaoGeralPage /></MemoryRouter>)
const kpi = (nome: string) => within(screen.getByTestId(`kpi-${nome}`))

describe('regras da visão geral', () => {
  it('garantias: ≤ 30 dias a terminar, passado expirada, depois ok', () => {
    expect(estadoGarantia(dia(30))).toBe('a-terminar')
    expect(estadoGarantia(dia(0))).toBe('a-terminar')
    expect(estadoGarantia(dia(31))).toBe('ok')
    expect(estadoGarantia(dia(-1))).toBe('expirada')
  })

  it('resumo', () => {
    const r = resumirArmazem(m.artigos as ArtigoArmazem[], m.emp as EmprestimoAtivo[], m.gar as GarantiaFerramenta[])
    expect(r.valorStock).toBe(10 * 6 + 2 * 10)
    expect(r.stockBaixo.map(a => a.nome)).toEqual(['Tijolo', 'Areia'])
    expect(r.semStock).toBe(1)
    expect(r.emAtraso.map(e => e.id)).toEqual(['e1'])
    expect(r.garantiasATerminar.map(g => g.id)).toEqual(['g1', 'g2', 'g5'])
    expect(r.garantiasExpiradas.map(g => g.id)).toEqual(['g4'])
  })
})

describe('Visão geral', () => {
  it('KPIs: artigos, valor em stock, stock baixo, ferramentas emprestadas/em atraso', () => {
    abrir()
    expect(kpi('Artigos').getByTestId('kpi-valor')).toHaveTextContent('3')
    expect(kpi('Valor em stock').getByTestId('kpi-valor').textContent).toMatch(/80,00/)
    expect(kpi('Stock baixo').getByTestId('kpi-valor')).toHaveTextContent('2')
    expect(kpi('Stock baixo').getByText('1 sem stock')).toBeInTheDocument()
    expect(kpi('Ferramentas emprestadas').getByTestId('kpi-valor')).toHaveTextContent('2')
    expect(kpi('Ferramentas emprestadas').getByText('1 em atraso')).toBeInTheDocument()
  })

  it('aviso de garantias: a terminar e expiradas', () => {
    abrir()
    expect(screen.getByTestId('aviso-garantias')).toHaveTextContent('3 garantias a terminar em 30 dias')
    expect(screen.getByTestId('aviso-garantias')).toHaveTextContent('1 expirada')
  })

  it('listas clicáveis: stock baixo → artigo e Entrada; atraso e garantias → ferramenta', () => {
    abrir()
    const baixo = screen.getAllByTestId('item-stock-baixo')
    expect(baixo).toHaveLength(2)
    expect(baixo[0]).toHaveTextContent('Tijolo')
    expect(baixo[1]).toHaveTextContent('Areia')
    expect(within(baixo[0]).getByRole('link', { name: 'Tijolo' })).toHaveAttribute('href', '/armazem/produto/a3')
    expect(within(baixo[0]).getByRole('link', { name: /Entrada/ })).toHaveAttribute('href', '/armazem/movimento/entrada?produto=a3')
    expect(within(screen.getByTestId('item-atraso')).getByRole('link', { name: 'Berbequim' })).toHaveAttribute('href', '/armazem/ferramenta/f1')
    const gs = screen.getAllByTestId('item-garantia')
    expect(gs).toHaveLength(4)
    expect(within(gs[0]).getByRole('link')).toHaveAttribute('href', '/armazem/ferramenta/g4')
    expect(gs[0]).toHaveTextContent('Expirada')
  })

  it('obras com mais material ignora concluídas e ordena por valor', () => {
    abrir()
    const o = screen.getAllByTestId('item-obra-top')
    expect(o).toHaveLength(2)
    expect(o[0]).toHaveTextContent('Prédio')
    expect(o[1]).toHaveTextContent('Moradia')
  })

  it('últimos movimentos e leitura sem botão Entrada', () => {
    m.papel = 'leitura'
    abrir()
    expect(screen.getByTestId('item-movimento')).toHaveTextContent('Compra')
    expect(screen.queryByRole('link', { name: /Entrada/ })).not.toBeInTheDocument()
  })
})
