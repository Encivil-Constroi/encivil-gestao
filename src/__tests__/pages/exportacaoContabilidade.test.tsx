import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

const m = vi.hoisted(() => ({
  toastInfo: vi.fn(),
  toastError: vi.fn(),
  autos: vi.fn(async (_f?: unknown) => [] as Record<string, string | number>[]),
  xlsx: vi.fn(async () => {}),
  multi: vi.fn(async () => {}),
  mapa: vi.fn(async () => [{ Nome: 'Rui' }] as Record<string, string | number>[]),
  fecho: vi.fn(async () => [{ nome: 'Assiduidade', linhas: [{ Nome: 'Rui' }] }]),
}))

vi.mock('sonner', () => ({ toast: { info: m.toastInfo, error: m.toastError, success: vi.fn() } }))
vi.mock('@/features/obras/hooks/useObras', () => ({ useObras: () => ({ obras: [{ id: 'o1', name: 'Cascais' }], loading: false }) }))
vi.mock('@/app/lib/exportXlsx', () => ({ exportarXlsx: m.xlsx, exportarXlsxMultiFolha: m.multi }))
vi.mock('@/features/contabilidade/contabilidadeService', () => ({
  exportarMateriais: vi.fn(async () => []),
  exportarCombustivel: vi.fn(async () => []),
  exportarAutos: m.autos,
  exportarPLObras: vi.fn(async () => []),
  exportarMapaAssiduidade: m.mapa,
  exportarFaltas: vi.fn(async () => []),
  exportarDadosLaborais: vi.fn(async () => []),
  exportarFaturas: vi.fn(async () => []),
  exportarFechoMes: m.fecho,
}))

import { ExportacaoContabilidadePage } from '@/app/pages/ExportacaoContabilidadePage'
import { mesAnterior, mesAtual } from '@/features/contabilidade/lib/periodo'

beforeEach(() => { vi.clearAllMocks() })
afterEach(cleanup)

describe('ExportacaoContabilidadePage', () => {
  it('mostra os 8 cards', () => {
    render(<ExportacaoContabilidadePage />)
    for (const t of ['Assiduidade e horas (salários)', 'Faltas', 'Dados laborais', 'Faturas de fornecedor',
      'Saídas de Materiais', 'Abastecimentos de Combustível', 'Autos de Medição Validados', 'P&L Resumo por Obra']) {
      expect(screen.getAllByText(t).length).toBeGreaterThan(0)
    }
  })

  it('atalhos preenchem as datas', () => {
    render(<ExportacaoContabilidadePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
    const ant = mesAnterior()
    expect(screen.getByLabelText('De')).toHaveValue(ant.dataInicio)
    expect(screen.getByLabelText('Até')).toHaveValue(ant.dataFim)
    fireEvent.click(screen.getByRole('button', { name: 'Mês atual' }))
    expect(screen.getByLabelText('De')).toHaveValue(mesAtual().dataInicio)
  })

  it('exporta o card de assiduidade com o período', async () => {
    render(<ExportacaoContabilidadePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
    fireEvent.click(screen.getByRole('button', { name: 'Descarregar Assiduidade e horas (salários)' }))
    await waitFor(() => expect(m.xlsx).toHaveBeenCalled())
    expect(m.mapa).toHaveBeenCalledWith(expect.objectContaining({ dataInicio: mesAnterior().dataInicio }))
  })

  it('export vazio mostra aviso "Sem dados no período"', async () => {
    render(<ExportacaoContabilidadePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Descarregar Faltas' }))
    await waitFor(() => expect(m.toastInfo).toHaveBeenCalledWith('Sem dados no período'))
    expect(m.xlsx).not.toHaveBeenCalled()
  })

  it('Fecho do mês gera o Excel multi-folha', async () => {
    render(<ExportacaoContabilidadePage />)
    fireEvent.click(screen.getByRole('button', { name: /Fecho do mês \(Excel\)/ }))
    await waitFor(() => expect(m.multi).toHaveBeenCalled())
    expect(m.fecho).toHaveBeenCalled()
    expect(m.multi.mock.calls[0]).toEqual([[{ nome: 'Assiduidade', linhas: [{ Nome: 'Rui' }] }], expect.stringContaining('fecho_mes')])
  })

  it('falha num card mostra a mensagem específica em toast e no card', async () => {
    m.mapa.mockRejectedValueOnce(new Error('Sem permissão para o mapa de assiduidade'))
    render(<ExportacaoContabilidadePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Descarregar Assiduidade e horas (salários)' }))
    await waitFor(() => expect(m.toastError).toHaveBeenCalled())
    expect(m.toastError.mock.calls[0][0]).toContain('Sem permissão')
    expect((await screen.findAllByText(/Sem permissão/)).length).toBeGreaterThan(0)
  })

  it('falha no Fecho do mês mostra toast de erro', async () => {
    m.fecho.mockRejectedValueOnce(new Error('Período inválido'))
    render(<ExportacaoContabilidadePage />)
    fireEvent.click(screen.getByRole('button', { name: /Fecho do mês \(Excel\)/ }))
    await waitFor(() => expect(m.toastError).toHaveBeenCalled())
    expect(m.toastError.mock.calls[0][0]).toContain('Período inválido')
    expect(m.multi).not.toHaveBeenCalled()
  })

  it('Fecho do mês sem linhas em nenhuma folha avisa "Sem dados no período"', async () => {
    m.fecho.mockResolvedValueOnce([{ nome: 'Notas', linhas: [] }])
    render(<ExportacaoContabilidadePage />)
    fireEvent.click(screen.getByRole('button', { name: /Fecho do mês \(Excel\)/ }))
    await waitFor(() => expect(m.toastInfo).toHaveBeenCalledWith('Sem dados no período'))
  })

  it('o card de Autos respeita o filtro de obra', async () => {
    render(<ExportacaoContabilidadePage />)
    fireEvent.change(screen.getByLabelText('Obra'), { target: { value: 'o1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Descarregar Autos de Medição Validados' }))
    await waitFor(() => expect(m.autos).toHaveBeenCalled())
    expect(m.autos).toHaveBeenCalledWith(expect.objectContaining({ obraId: 'o1' }))
  })
})
