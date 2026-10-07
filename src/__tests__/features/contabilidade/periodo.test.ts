import { describe, it, expect } from 'vitest'
import { limitesLisboa, mesAtual, mesAnterior } from '@/features/contabilidade/lib/periodo'

describe('limitesLisboa', () => {
  it('verão (UTC+1)', () => {
    expect(limitesLisboa('2026-07-01', '2026-07-31')).toEqual({ desde: '2026-06-30T23:00:00.000Z', ate: '2026-07-31T23:00:00.000Z' })
  })
  it('inverno (UTC+0)', () => {
    expect(limitesLisboa('2026-01-01', '2026-01-31')).toEqual({ desde: '2026-01-01T00:00:00.000Z', ate: '2026-02-01T00:00:00.000Z' })
  })
  it('mudança de hora (fim de março)', () => {
    expect(limitesLisboa(undefined, '2026-03-28')).toEqual({ ate: '2026-03-29T00:00:00.000Z' })
    expect(limitesLisboa('2026-03-29', '2026-03-29')).toEqual({ desde: '2026-03-29T00:00:00.000Z', ate: '2026-03-29T23:00:00.000Z' })
  })
  it('sem datas devolve vazio', () => {
    expect(limitesLisboa()).toEqual({})
  })
})

describe('mesAtual / mesAnterior', () => {
  it('usa o calendário de Lisboa', () => {
    expect(mesAtual(new Date('2026-09-30T23:30:00Z'))).toEqual({ dataInicio: '2026-10-01', dataFim: '2026-10-31' })
  })
  it('mesAnterior atravessa o ano', () => {
    expect(mesAnterior(new Date('2026-01-15T12:00:00Z'))).toEqual({ dataInicio: '2025-12-01', dataFim: '2025-12-31' })
    expect(mesAnterior(new Date('2026-03-15T12:00:00Z'))).toEqual({ dataInicio: '2026-02-01', dataFim: '2026-02-28' })
  })
})
