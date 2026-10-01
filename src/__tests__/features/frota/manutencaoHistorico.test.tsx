import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { invalidateCache } from '@/app/lib/useAsync'
import type { HistoricoManutencaoRow, ItemCatalogoRow } from '@/features/frota/db'

const mocks = vi.hoisted(() => ({
  role: 'mecanico' as string,
  linhas: [] as unknown[],
  dia: { manutencoes: [] as unknown[], edicoes: [] as unknown[] },
  listarHistorico: vi.fn(),
  carregarDia: vi.fn(),
  exportar: vi.fn(async () => undefined),
}))

vi.mock('@/features/auth/useRole', () => ({
  useRole: () => ({ role: mocks.role, isAdmin: mocks.role === 'admin', podeFrota: ['admin', 'gestor', 'mecanico'].includes(mocks.role) }),
}))
vi.mock('@/app/lib/exportXlsx', () => ({ exportarXlsx: mocks.exportar }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const viaturas = [
  { id: 'v1', nome: 'Carrinha 1', identificacao: '00-AA-00', marca: 'Renault', modelo: 'Master', tipo: 'viatura', unidade_contador: 'km',
    estado_operacional: 'LIVRE', alertas_urgentes: 0, alertas_atencao: 0, data_ultima_revisao: null },
  { id: 'v2', nome: 'Grua', identificacao: '11-BB-11', marca: null, modelo: null, tipo: 'maquina', unidade_contador: 'horas',
    estado_operacional: 'LIVRE', alertas_urgentes: 0, alertas_atencao: 0, data_ultima_revisao: null },
]
const oleo = { id: 'i-oleo', rotulo: 'Óleo', categoria: 'REVISAO_PERIODICA', natureza: 'MANUTENCAO', ativo: true, ordem: 1 } as ItemCatalogoRow
const catalogo = [oleo]

vi.mock('@/features/frota/hooks/useFrota', () => ({
  useResumoFrota: () => ({ viaturas, loading: false, error: null, reload: vi.fn() }),
  useCatalogo: () => ({ catalogo, loading: false, error: null, reload: vi.fn() }),
}))
vi.mock('@/features/frota/services/manutencaoService', () => ({
  LIMITE_HISTORICO: 2000,
  listarHistorico: mocks.listarHistorico,
  carregarDia: mocks.carregarDia,
  listarChecklistsRecentes: async () => [],
  definirEstadoViatura: async () => true,
}))
vi.mock('@/features/frota/services/frotaService', () => ({ registarManutencao: vi.fn() }))

import { ManutencaoPage } from '@/features/frota/components/ManutencaoPage'

function linha(o: Partial<HistoricoManutencaoRow>): HistoricoManutencaoRow {
  return {
    id: 'm', veiculo_id: 'v1', veiculo_nome: 'Carrinha 1', identificacao: '00-AA-00', unidade_contador: 'km',
    item_id: null, item_rotulo: null, descricao: null, data: '2026-09-10', km_na_altura: null, custo: null,
    oficina: null, observacoes: null, condutor_nome: null, registado_por: 'Carlos', registado_em: '2026-09-10T10:30:00',
    editado_por: null, editado_em: null, ...o,
  }
}

const oleoLinha = linha({ id: 'm1', item_id: 'i-oleo', item_rotulo: 'Óleo', km_na_altura: 120000, custo: 80, oficina: 'Polo 2',
  editado_por: 'Ana', editado_em: '2026-09-11T09:00:00' })
const luzLinha = linha({ id: 'm2', veiculo_id: 'v2', veiculo_nome: 'Grua', identificacao: '11-BB-11', unidade_contador: 'horas',
  descricao: 'Lâmpada do farol', custo: 12.5, data: '2026-09-12', km_na_altura: 800 })
const outraNoMesmoDia = linha({ id: 'm3', item_id: 'i-oleo', item_rotulo: 'Óleo', custo: 20, observacoes: 'Filtro Mann' })

const resumo = () => document.querySelector('[aria-live]')?.textContent ?? ''
const clicar = (el: Element) => act(async () => { fireEvent.click(el) })

function abrir() {
  render(<MemoryRouter initialEntries={['/frota/manutencao?vista=historico']}><ManutencaoPage /></MemoryRouter>)
}

beforeEach(() => {
  invalidateCache('frota-*')
  mocks.role = 'mecanico'
  mocks.linhas = [luzLinha, oleoLinha, outraNoMesmoDia]
  mocks.listarHistorico.mockReset().mockImplementation(async () => mocks.linhas)
  mocks.carregarDia.mockReset().mockImplementation(async () => mocks.dia)
  mocks.exportar.mockClear()
  mocks.dia = {
    manutencoes: [oleoLinha, outraNoMesmoDia],
    edicoes: [{
      id: 'e1', manutencao_id: 'm1', editado_por: 'u', editado_por_nome: 'Ana', editado_em: '2026-09-11T09:00:00',
      antes: { item_id: 'i-oleo', descricao: null, data: '2026-09-10', km_na_altura: 110000, custo: 80, oficina: 'Polo 2', observacoes: null },
      depois: { item_id: 'i-oleo', descricao: null, data: '2026-09-10', km_na_altura: 120000, custo: 80, oficina: 'Polo 2', observacoes: null },
    }],
  }
})
afterEach(cleanup)

describe('Histórico de manutenções', () => {
  it('agrupa por dia (mais recente primeiro) com totais e mostra quem registou e quem editou', async () => {
    abrir()
    expect(await screen.findByText(/Lâmpada do farol/)).toBeInTheDocument()
    const dias = screen.getAllByRole('region').filter(r => r.tagName === 'SECTION' && /\d{2}\/\d{2}\/\d{4}/.test(r.getAttribute('aria-label') ?? ''))
    expect(dias.map(d => d.getAttribute('aria-label'))).toEqual(['12/09/2026', '10/09/2026'])
    expect(within(dias[1]).getAllByRole('button')).toHaveLength(2)

    expect(resumo()).toMatch(/3 intervenções/)
    expect(screen.getAllByText(/Registado por Carlos/).length).toBe(3)
    expect(screen.getByText(/editado por Ana/)).toBeInTheDocument()
  })

  it('filtra por viatura pela matrícula (pedido ao servidor)', async () => {
    abrir()
    await screen.findByText(/Lâmpada do farol/)
    const campo = screen.getByRole('combobox', { name: /Viatura ou máquina/ })
    await act(async () => { fireEvent.focus(campo) })
    fireEvent.change(campo, { target: { value: '11-bb' } })
    expect(screen.queryByRole('option', { name: /00-AA-00/ })).not.toBeInTheDocument()
    await clicar(screen.getByRole('option', { name: /11-BB-11/ }))
    expect(mocks.listarHistorico).toHaveBeenLastCalledWith(expect.objectContaining({ veiculoId: 'v2' }))
  })

  it('filtra por período: atalhos e datas', async () => {
    abrir()
    await screen.findByText(/Lâmpada do farol/)
    await clicar(screen.getByRole('button', { name: 'Este ano' }))
    const ano = String(new Date().getFullYear())
    expect(mocks.listarHistorico).toHaveBeenLastCalledWith(expect.objectContaining({ desde: `${ano}-01-01` }))
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-09-11' } })
    expect(mocks.listarHistorico).toHaveBeenLastCalledWith(expect.objectContaining({ desde: '2026-09-11' }))
    await clicar(screen.getByRole('button', { name: 'Todo o período' }))
    expect(screen.getByLabelText('De')).toHaveValue('')
  })

  it('filtra por tipo e pela pesquisa livre', async () => {
    abrir()
    await screen.findByText(/Lâmpada do farol/)
    fireEvent.change(screen.getByLabelText('Tipo de manutenção'), { target: { value: 'i-oleo' } })
    expect(screen.queryByText(/Lâmpada do farol/)).not.toBeInTheDocument()
    expect(resumo()).toMatch(/2 intervenções/)

    fireEvent.change(screen.getByLabelText('Pesquisa livre'), { target: { value: 'mann' } })
    expect(resumo()).toMatch(/1 intervenção/)
    fireEvent.change(screen.getByLabelText('Tipo de manutenção'), { target: { value: '__outro' } })
    expect(screen.getByText(/Sem manutenções para estes filtros/)).toBeInTheDocument()
  })

  it('abrir uma linha mostra o detalhe do dia com utilizador, hora e correções', async () => {
    abrir()
    await clicar((await screen.findAllByRole('button', { name: /Ver detalhe: 00-AA-00, Óleo/ }))[0])
    const dialogo = await screen.findByRole('dialog')
    expect(mocks.carregarDia).toHaveBeenCalledWith('v1', '2026-09-10')
    expect(await within(dialogo).findAllByText('Óleo')).toHaveLength(2)          // as duas intervenções do dia
    expect(within(dialogo).getAllByText(/Registado por/)).toHaveLength(2)
    expect(within(dialogo).getAllByText(/Carlos/).length).toBeGreaterThan(0)
    expect(within(dialogo).getAllByText(/10:30/).length).toBeGreaterThan(0)
    expect(within(dialogo).getByText('Correções')).toBeInTheDocument()
    expect(within(dialogo).getByText(/Corrigido por/)).toHaveTextContent('Ana')
    expect(within(dialogo).getByText(/110000/)).toBeInTheDocument()               // antes → depois
    const editar = within(dialogo).getAllByRole('link', { name: /Editar/ })
    expect(editar[0]).toHaveAttribute('href', '/frota/manutencao/m1/editar')

    await clicar(within(dialogo).getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('quem só consulta não vê o botão Editar', async () => {
    mocks.role = 'leitura'
    abrir()
    await clicar((await screen.findAllByRole('button', { name: /Ver detalhe: 00-AA-00, Óleo/ }))[0])
    const dialogo = await screen.findByRole('dialog')
    await within(dialogo).findAllByText('Óleo')
    expect(within(dialogo).queryByRole('link', { name: /Editar/ })).not.toBeInTheDocument()
  })

  it('exporta para Excel só o que está visível', async () => {
    abrir()
    await screen.findByText(/Lâmpada do farol/)
    fireEvent.change(screen.getByLabelText('Tipo de manutenção'), { target: { value: 'i-oleo' } })
    await clicar(screen.getByRole('button', { name: /Exportar Excel/ }))
    expect(mocks.exportar).toHaveBeenCalledTimes(1)
    const [linhas, nome] = mocks.exportar.mock.calls[0] as unknown as [Record<string, unknown>[], string]
    expect(nome).toBe('manutencoes_frota')
    expect(linhas).toHaveLength(2)
    expect(linhas[0]).toMatchObject({ 'Matrícula': '00-AA-00', 'Registado por': 'Carlos' })
  })
})
