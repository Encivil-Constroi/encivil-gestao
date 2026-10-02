import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MedicaoAuto } from '../../legacy/autosService'
import type { AutoEvidenciaRow, AutoGlosaRow } from '../../db'

const h = vi.hoisted(() => ({
  auto: null as unknown,
  glosas: [] as unknown[],
  evidencias: [] as unknown[],
  aprovadores: [] as unknown[],
}))

vi.mock('../../legacy/useAutos', () => ({
  useAuto: () => ({ auto: h.auto, loading: false }),
  useAprovadoresAuto: () => ({ aprovadores: h.aprovadores, loading: false }),
}))
vi.mock('../../legacy/useSubempreiteiros', () => ({
  useSubempreiteiro: () => ({ sub: { id: 'sub-1', name: 'Alvenaria Silva', obraName: 'Obra Norte' }, loading: false }),
}))
vi.mock('../../hooks/useSubsControlo', () => ({
  useGlosasAuto: () => ({ glosas: h.glosas }),
  useEvidenciasAutoLista: () => ({ evidencias: h.evidencias }),
}))
vi.mock('./AutoEvidenciasView', () => ({ AutoEvidenciasView: () => null }))

import { AutoPdfPage } from './AutoPdfPage'

const base: MedicaoAuto = {
  id: 'auto-1', subcontractorId: 'sub-1', number: 4, date: new Date('2026-09-30'), periodValue: 10000,
  status: 'validado', createdAt: new Date('2026-09-30'), validatedAt: new Date('2026-10-02'),
  lines: [], retencaoPercentagem: 5, valorRetido: 400, valorLiquido: 7600, estadoPagamento: 'por_pagar',
  workflow: 'validado', valorGlosado: 2000, valorCertificado: 8000, fatura: null,
}

const glosa = (extra: Partial<AutoGlosaRow>): AutoGlosaRow => ({
  id: 'g1', auto_id: 'auto-1', linha_id: null, motivo: 'QUALIDADE', descricao: 'Reboco com fissuras',
  valor: 2000, estado: 'aplicada', ocorrencia_id: null, criado_por: null, criado_em: '2026-10-01T10:00:00Z',
  levantada_por: null, levantada_em: null, motivo_levantamento: null, ...extra,
})

const evidencia = (id: string, valida: boolean) => ({ id, valida }) as AutoEvidenciaRow

function ver() {
  return render(
    <MemoryRouter initialEntries={['/auto/auto-1/pdf']}>
      <Routes><Route path="/auto/:autoId/pdf" element={<AutoPdfPage />} /></Routes>
    </MemoryRouter>,
  )
}

afterEach(cleanup)

beforeEach(() => {
  h.auto = base
  h.glosas = []
  h.evidencias = []
  h.aprovadores = []
})

describe('PDF do auto de medição', () => {
  it('imprime glosas aplicadas, certificado e retenção sobre o certificado', () => {
    h.glosas = [glosa({}), glosa({ id: 'g2', descricao: 'Levantada', estado: 'levantada' })]
    ver()
    expect(screen.getAllByText('Glosas aplicadas').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Reboco com fissuras').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Levantada')).toHaveLength(0)
    expect(screen.getAllByText('Valor certificado').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/do certificado\)/).length).toBeGreaterThan(0)
  })

  it('sem glosas não mostra a secção nem o certificado separado', () => {
    h.auto = { ...base, valorGlosado: 0, valorCertificado: 10000, valorRetido: 500, valorLiquido: 9500 }
    ver()
    expect(screen.queryAllByText('Glosas aplicadas')).toHaveLength(0)
    expect(screen.queryAllByText('Valor certificado')).toHaveLength(0)
  })

  it('mostra a fatura guardada do subempreiteiro e avisa quando o valor diverge', () => {
    h.auto = { ...base, fatura: { numero: 'FT 2026/14', data: '2026-10-03', valor: 9000 } }
    ver()
    expect(screen.getAllByText('FT 2026/14').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/difere do valor líquido aprovado/).length).toBeGreaterThan(0)
  })

  it('não avisa quando a fatura coincide com o líquido', () => {
    h.auto = { ...base, fatura: { numero: 'FT 1', valor: 7600 } }
    ver()
    expect(screen.queryAllByText(/difere do valor líquido/)).toHaveLength(0)
  })

  it('sem fatura não mostra o bloco', () => {
    ver()
    expect(screen.queryAllByText(/Fatura do subempreiteiro/)).toHaveLength(0)
  })

  it('lista os aprovadores e a exceção do administrador', () => {
    h.auto = { ...base, excecaoMotivo: 'Certidão em renovação' }
    h.aprovadores = [
      { etapa: 'Verificado', nome: 'Rui Medições', em: new Date('2026-10-01') },
      { etapa: 'Aprovado', nome: null, em: new Date('2026-10-02') },
    ]
    ver()
    expect(screen.getAllByText(/Rui Medições/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Exceção autorizada pelo administrador: Certidão em renovação/).length).toBeGreaterThan(0)
  })

  it('conta as evidências válidas e o total registado', () => {
    h.evidencias = [evidencia('e1', true), evidencia('e2', true), evidencia('e3', false)]
    ver()
    expect(screen.getAllByText('2').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/de 3 registadas/).length).toBeGreaterThan(0)
  })

  it('mostra o estado do workflow', () => {
    h.auto = { ...base, workflow: 'verificado', status: 'rascunho' }
    ver()
    expect(screen.getAllByText('Verificado').length).toBeGreaterThan(0)
  })
})
