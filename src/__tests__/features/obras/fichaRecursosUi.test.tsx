import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const estado = vi.hoisted(() => ({
  podeObras: true,
  alocar: vi.fn(), remover: vi.fn(), definirAutores: vi.fn(), reload: vi.fn(), exportarCsv: vi.fn(),
}))

vi.mock('@/features/auth/useRole', () => ({ useRole: () => ({ podeObras: estado.podeObras }) }))
vi.mock('@/features/obras/hooks/useObras', () => ({ useColaboradoresAtivos: () => ({ colaboradores: [{ id: 'c2', nome: 'Ana Lopes' }] }) }))
vi.mock('@/app/lib/exportCsv', () => ({ exportarCsv: estado.exportarCsv }))
vi.mock('@/features/obras/hooks/useFichaRecursos', () => ({
  useEquipaObra: () => ({ equipa: [{ alocacao_id: 'a1', colaborador_id: 'c1', nome: 'João Silva', funcao: 'Encarregado', desde: '2026-09-01', ate: null, ativo: true, presente_hoje: true, ultima_picagem: '2026-10-01T08:00:00Z' }], loading: false, error: null, reload: estado.reload }),
  useAutoresObra: () => ({ autores: [{ user_id: 'u1', nome: 'Maria Costa', role: 'leitura', designado: false }], loading: false, error: null }),
  useGerirEquipa: () => ({ alocar: estado.alocar, remover: estado.remover, definirAutores: estado.definirAutores, loading: false, error: null }),
  useFrotaObra: () => ({ frota: [{ veiculo_id: 'v1', nome: 'Escavadora', identificacao: 'EQ-01', tipo: 'máquina', marca: null, modelo: null, estado_operacional: 'Em uso', condutor_nome: 'João Silva', desde: '2026-09-01', km_atual: null, ehmaquina: true, atual: true, entregue_em: '2026-09-01T08:00:00Z', devolvido_em: null }], loading: false, error: null }),
  useFerramentasObra: () => ({ ferramentas: [{ emprestimo_id: 'e1', ferramenta_id: 'f1', nome: 'Berbequim', numero_serie: '123', foto_path: null, colaborador_nome: 'João Silva', data_saida: '2026-09-28T08:00:00Z', data_devolucao: null, ativo: true, dias_fora: 3 }], loading: false, error: null }),
  useMateriaisObra: () => ({ materiais: [{ produto_id: 'p1', nome: 'Cimento', unidade: 'saco', enviado: 10, devolvido: 2, liquido: 8, valor: 80, ultimo_movimento: '2026-09-30' }], loading: false, error: null }),
}))

import { Equipa } from '@/features/obras/components/ficha/Equipa'
import { Frota } from '@/features/obras/components/ficha/Frota'
import { Ferramentas } from '@/features/obras/components/ficha/Ferramentas'
import { Materiais } from '@/features/obras/components/ficha/Materiais'

afterEach(() => { cleanup(); vi.clearAllMocks(); estado.podeObras = true })

describe('secções de recursos da obra', () => {
  it('mostra presença e último ponto e permite alocar com função', async () => {
    estado.alocar.mockResolvedValue('a2')
    render(<Equipa obraId="obra-1" />)
    expect(screen.getByText('● Presente hoje')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Colaborador'), { target: { value: 'c2' } })
    fireEvent.change(screen.getByLabelText('Função na obra'), { target: { value: 'Pedreira' } })
    fireEvent.click(screen.getByRole('button', { name: 'Alocar' }))
    expect(estado.alocar).toHaveBeenCalledWith('c2', 'Pedreira', expect.any(String))
  })

  it('só gestores vêem gestão da equipa e designação de autores', () => {
    estado.podeObras = false
    render(<Equipa obraId="obra-1" />)
    expect(screen.queryByRole('button', { name: 'Alocar' })).not.toBeInTheDocument()
    expect(screen.queryByText('Quem pode escrever relatórios')).not.toBeInTheDocument()
    expect(screen.getByText('João Silva')).toBeInTheDocument()
  })

  it('separa máquinas e mostra condutor', () => {
    render(<MemoryRouter><Frota obraId="obra-1" /></MemoryRouter>)
    const secao = screen.getByRole('heading', { name: 'Máquinas na obra · 1' }).closest('section')!
    expect(within(secao).getByText(/Escavadora/)).toBeInTheDocument()
    expect(within(secao).getByText(/Condutor: João Silva/)).toBeInTheDocument()
    expect(within(secao).getByRole('link', { name: /Escavadora/ })).toHaveAttribute('href', '/frota/viatura/v1')
  })

  it('mostra dias fora das ferramentas emprestadas', () => {
    render(<MemoryRouter><Ferramentas obraId="obra-1" /></MemoryRouter>)
    expect(screen.getByText('3 dias fora')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Berbequim/ })).toHaveAttribute('href', '/armazem/ferramenta/f1')
  })

  it('exporta quantidades e valor por produto', () => {
    render(<MemoryRouter><Materiais obraId="obra-1" /></MemoryRouter>)
    expect(screen.getByText('8 saco')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cimento' })).toHaveAttribute('href', '/armazem/produto/p1')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Pesquisar materiais' }), { target: { value: 'Areia' } })
    expect(screen.queryByRole('link', { name: 'Cimento' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Pesquisar materiais' }), { target: { value: 'Cimento' } })
    expect(screen.getByRole('link', { name: 'Cimento' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }))
    expect(estado.exportarCsv).toHaveBeenCalledWith([expect.objectContaining({ Produto: 'Cimento', Enviado: 10, Devolvido: 2, 'Líquido': 8, 'Valor (€)': 80 })], 'materiais_obra_obra-1')
  })
})
