import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { EmprestimoAtivo, MaterialObra } from '@/features/movimentos/services/armazemService'
import { agruparPorObra } from '@/features/movimentos/armazemRegras'

const m = vi.hoisted(() => ({ papel: 'armazem', materiais: [] as unknown[], emprestimos: [] as unknown[] }))

vi.mock('@/features/auth/useRole', () => ({ useRole: () => ({ podeArmazem: ['admin', 'gestor', 'armazem'].includes(m.papel) }) }))
vi.mock('@/app/lib/fotosArmazem', () => ({ urlFotoArmazem: () => null }))
vi.mock('@/features/obras/hooks/useObras', () => ({
  useObras: () => ({
    obras: [
      { id: 'o1', name: 'Moradia Cascais', status: 'ativa', client: 'Ana' },
      { id: 'o2', name: 'Prédio Sintra', status: 'concluida' },
      { id: 'o3', name: 'Armazém Loures', status: 'ativa' },
    ], loading: false,
  }),
}))
vi.mock('@/features/movimentos/hooks/useArmazem', () => ({
  useMateriaisPorObra: () => ({ materiais: m.materiais, loading: false, error: null }),
  useEmprestimosAtivos: () => ({ emprestimos: m.emprestimos, loading: false, error: null }),
}))

import { ObrasArmazemPage } from '@/app/pages/armazem/ObrasArmazemPage'

function mat(o: Partial<MaterialObra>): MaterialObra {
  return {
    obraId: 'o1', obraNome: 'Moradia Cascais', obraEstado: 'ativa', produtoId: 'p1', produtoNome: 'Cimento', produtoCodigo: 'C', unidade: 'saco',
    fotoPath: null, enviado: 10, devolvido: 2, liquido: 8, valor: 48, ultimoMovimento: new Date(), ...o,
  }
}
function emp(o: Partial<EmprestimoAtivo>): EmprestimoAtivo {
  return {
    id: 'e1', ferramentaId: 'f1', ferramentaNome: 'Berbequim Hilti', ferramentaCodigo: 'F1', fotoPath: null, funcionario: 'Zé',
    desde: new Date(2026, 8, 1), previstaDevolucao: null, obraId: 'o1', destino: null, ...o,
  }
}

beforeEach(() => {
  m.papel = 'armazem'
  m.materiais = [
    mat({}),
    mat({ produtoId: 'p2', produtoNome: 'Areia', liquido: 3, valor: 60, unidade: 'm3' }),
    mat({ produtoId: 'p3', produtoNome: 'Tudo devolvido', liquido: 0, valor: 0 }),
    mat({ obraId: 'o2', obraNome: 'Prédio Sintra', obraEstado: 'concluida', produtoId: 'p4', produtoNome: 'Tijolo', valor: 100 }),
  ]
  m.emprestimos = [
    emp({}),
    emp({ id: 'e2', ferramentaId: 'f2', ferramentaNome: 'Serra', previstaDevolucao: '2000-01-01' }),
    emp({ id: 'e3', ferramentaId: 'f3', ferramentaNome: 'Sem obra', obraId: null }),
  ]
})
afterEach(cleanup)

const abrir = () => render(<MemoryRouter><ObrasArmazemPage /></MemoryRouter>)

describe('agruparPorObra', () => {
  it('soma o valor líquido, ignora material já devolvido e liga ferramentas pela obra', () => {
    const g = agruparPorObra(
      [{ id: 'o1', name: 'A', status: 'ativa' }, { id: 'o3', name: 'B', status: 'ativa' }],
      m.materiais as MaterialObra[], m.emprestimos as EmprestimoAtivo[])
    const a = g.find(x => x.obra.id === 'o1')!
    expect(a.valorMateriais).toBe(108)
    expect(a.materiais.map(x => x.produtoNome)).toEqual(['Areia', 'Cimento'])
    expect(a.ferramentas.map(x => x.ferramentaNome)).toEqual(['Berbequim Hilti', 'Serra'])
    expect(g.find(x => x.obra.id === 'o3')!.ferramentas).toHaveLength(0)
  })
})

describe('Obras do armazém', () => {
  it('mostra só obras em execução, com materiais líquidos, valor total e ferramentas', () => {
    abrir()
    const cartoes = screen.getAllByTestId('cartao-obra')
    expect(cartoes).toHaveLength(2)
    const c = cartoes[0]
    expect(c).toHaveAttribute('aria-label', 'Moradia Cascais')
    expect(within(c).getByTestId('valor-obra').textContent).toMatch(/108,00/)
    const materiais = within(c).getAllByTestId('material-obra')
    expect(materiais).toHaveLength(2)
    expect(materiais[0]).toHaveTextContent('Areia')
    expect(materiais[1]).toHaveTextContent('Enviado 10 · devolvido 2')
    expect(within(c).queryByText('Tudo devolvido')).not.toBeInTheDocument()
    const ferr = within(c).getAllByTestId('ferramenta-obra')
    expect(ferr).toHaveLength(2)
    expect(ferr[0]).toHaveTextContent('Berbequim Hilti')
    expect(ferr[0]).toHaveTextContent('Zé')
    expect(ferr[0]).not.toHaveTextContent('em atraso')
    expect(ferr[1]).toHaveTextContent(/em atraso/)
    expect(screen.queryByText('Sem obra')).not.toBeInTheDocument()
    expect(screen.queryByText('Prédio Sintra')).not.toBeInTheDocument()
  })

  it('ações levam ao formulário com a obra pré-selecionada e à ficha da obra', () => {
    abrir()
    const c = screen.getAllByTestId('cartao-obra')[0]
    expect(within(c).getByRole('link', { name: /Enviar material/ })).toHaveAttribute('href', '/armazem/movimento/saida?obra=o1')
    expect(within(c).getByRole('link', { name: /Receber devolução/ })).toHaveAttribute('href', '/armazem/movimento/entrada?tipo=DEVOLUCAO_OBRA&obra=o1')
    expect(within(c).getByRole('link', { name: /Ficha da obra/ })).toHaveAttribute('href', '/obras/o1')
  })

  it('obras concluídas só com a opção ligada (e sem "Enviar material")', () => {
    abrir()
    fireEvent.click(screen.getByLabelText(/Mostrar obras concluídas/))
    const cartoes = screen.getAllByTestId('cartao-obra')
    expect(cartoes).toHaveLength(3)
    const sintra = cartoes.find(c => c.getAttribute('aria-label') === 'Prédio Sintra')!
    expect(sintra).toHaveTextContent('Concluída')
    expect(within(sintra).queryByRole('link', { name: /Enviar material/ })).not.toBeInTheDocument()
  })

  it('leitura vê tudo mas sem botões de movimento', () => {
    m.papel = 'leitura'
    abrir()
    expect(screen.queryByRole('link', { name: /Enviar material/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Receber devolução/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Ficha da obra/ })).toHaveLength(2)
  })
})
