import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const hoje = new Date()
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const ha3dias = iso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 3))

const base = {
  identificacao: 'CC-22-DD', veiculo_nome: 'Carrinha 2', veiculo_id: 'v2', obra_id: null, obra_nome: 'Obra Norte',
  adblue: 'NA', oleo: 'OK', refrigeracao: 'OK', pneus: 'OK', limpeza: 'OK', inventario: {}, observacoes: null, para_oficina: false,
  registado_por: 'Maria', criado_em: '2026-09-20T10:00:00Z',
}
const mocks = vi.hoisted(() => ({ podeFrota: true, entregas: [] as unknown[] }))

vi.mock('@/features/auth/useRole', () => ({ useRole: () => ({ podeFrota: mocks.podeFrota }) }))
vi.mock('@/features/frota/hooks/useFrota', () => ({
  useResumoFrota: () => ({
    viaturas: [
      { id: 'v1', codigo: 'V-01', nome: 'Carrinha 1', identificacao: 'AA-11-BB', unidade_contador: 'km', estado_operacional: 'LIVRE', condutor_nome: null, condutor_desde: null, obra_nome: null },
      { id: 'v2', codigo: 'V-02', nome: 'Carrinha 2', identificacao: 'CC-22-DD', unidade_contador: 'km', estado_operacional: 'EM_USO', condutor_nome: 'Zé Manel', condutor_desde: ha3dias, obra_nome: 'Obra Norte' },
    ],
    loading: false, error: null, reload: vi.fn(),
  }),
}))
vi.mock('@/features/frota/hooks/useEntregas', () => ({
  useEntregas: () => ({ entregas: mocks.entregas, loading: false, error: null, reload: vi.fn() }),
}))

import { EntregasPage } from '@/features/frota/components/EntregasPage'

const ent = (extra: object) => ({ ...base, combustivel: 'CHEIO', danos: [{ vista: 'frente', x: 0.1, y: 0.1 }], ...extra })

beforeEach(() => {
  mocks.podeFrota = true
  mocks.entregas = [
    ent({ id: 'd1', tipo: 'DEVOLUCAO', colaborador_id: 'c1', colaborador_nome: 'Zé Manel', data: '2026-09-25', km: 2400, combustivel: 'QUARTO',
      entrega_ref: 'e1', danos: [{ vista: 'frente', x: 0.1, y: 0.1 }, { vista: 'tras', x: 0.5, y: 0.5, nota: 'Risco novo' }] }),
    ent({ id: 'e1', tipo: 'ENTREGA', colaborador_id: 'c1', colaborador_nome: 'Zé Manel', data: '2026-09-20', km: 1900, entrega_ref: null }),
    ent({ id: 'e2', tipo: 'ENTREGA', colaborador_id: 'c2', colaborador_nome: 'Ana Silva', data: '2026-09-20', km: 1000, identificacao: 'AA-11-BB', veiculo_id: 'v1', veiculo_nome: 'Carrinha 1', obra_nome: null, entrega_ref: null }),
  ]
})
afterEach(cleanup)

const abrir = (url = '/frota/entregas') => render(<MemoryRouter initialEntries={[url]}><EntregasPage /></MemoryRouter>)
const linhas = () => screen.getAllByRole('button').filter(b => /registado por/.test(b.textContent ?? ''))

describe('Entregas: lista', () => {
  it('agrupa por dia, do mais recente para o mais antigo', () => {
    abrir()
    const dias = screen.getAllByRole('region').map(r => r.getAttribute('aria-label')).filter(l => l?.startsWith('Dia'))
    expect(dias).toEqual(['Dia 25/09/2026', 'Dia 20/09/2026'])
    expect(within(screen.getByRole('region', { name: 'Dia 20/09/2026' })).getAllByRole('button')).toHaveLength(2)
  })

  it('mostra quem tem o quê e há quantos dias', () => {
    abrir()
    expect(screen.getByText('Atualmente entregues (1)')).toBeTruthy()
    expect(screen.getByText('há 3 dias')).toBeTruthy()
  })

  it('filtra por tipo, colaborador, período, pesquisa e ?viatura=', () => {
    abrir()
    expect(linhas()).toHaveLength(3)
    fireEvent.change(screen.getByLabelText('Filtrar por tipo'), { target: { value: 'DEVOLUCAO' } })
    expect(linhas()).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Filtrar por tipo'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Filtrar por colaborador'), { target: { value: 'c2' } })
    expect(linhas()).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Filtrar por colaborador'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Data desde'), { target: { value: '2026-09-22' } })
    expect(linhas()).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Data desde'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Pesquisar entregas'), { target: { value: 'ana' } })
    expect(linhas()).toHaveLength(1)
    cleanup()
    abrir('/frota/entregas?viatura=v2')
    expect(linhas()).toHaveLength(2)
  })

  it('botões de entregar/devolver só com permissão', () => {
    abrir()
    expect(screen.getByRole('link', { name: /Entregar viatura/ }).getAttribute('href')).toBe('/frota/entregar')
    cleanup()
    mocks.podeFrota = false
    abrir()
    expect(screen.queryByRole('link', { name: /Entregar viatura/ })).toBeNull()
  })

  it('o detalhe de uma devolução compara com a entrega e conta os danos novos', () => {
    abrir('/frota/entregas?id=d1')
    const dialogo = screen.getByRole('dialog')
    const comparacao = within(dialogo).getByLabelText('Comparação com a entrega')
    expect(comparacao.textContent).toContain('Km percorridos500 km')
    expect(comparacao.textContent).toMatch(/Danos novos1/)
    expect(comparacao.textContent).toContain('Cheio')
    expect(comparacao.textContent).toContain('1/4')
    expect(within(dialogo).getByText('Risco novo')).toBeTruthy()
    fireEvent.click(within(dialogo).getByLabelText('Fechar'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('clicar numa linha abre o detalhe da entrega', () => {
    abrir()
    fireEvent.click(linhas().find(b => /AA-11-BB/.test(b.textContent ?? ''))!)
    expect(within(screen.getByRole('dialog')).getByText('Ana Silva')).toBeTruthy()
  })
})
