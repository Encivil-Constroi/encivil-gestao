import { describe, expect, it } from 'vitest'
import { dataISOLocal, hojeLisboa, limitesDiaLisboa } from '@/app/lib/dataLisboa'

describe('dataLisboa', () => {
  it('hojeLisboa usa o dia de Lisboa, não o de UTC', () => {
    expect(hojeLisboa(new Date('2026-07-14T23:30:00Z'))).toBe('2026-07-15')
    expect(hojeLisboa(new Date('2026-01-14T23:30:00Z'))).toBe('2026-01-14')
  })

  it('dataISOLocal usa os campos locais da Date', () => {
    expect(dataISOLocal(new Date(2026, 6, 31))).toBe('2026-07-31')
    expect(dataISOLocal(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('limitesDiaLisboa no verão', () => {
    expect(limitesDiaLisboa('2026-07-15')).toEqual({
      inicio: '2026-07-15T00:00:00+01:00',
      fimExclusivo: '2026-07-16T00:00:00+01:00',
    })
  })

  it('limitesDiaLisboa no inverno e na mudança de hora', () => {
    expect(limitesDiaLisboa('2026-01-10').inicio).toBe('2026-01-10T00:00:00+00:00')
    expect(limitesDiaLisboa('2026-10-25')).toEqual({
      inicio: '2026-10-25T00:00:00+01:00',
      fimExclusivo: '2026-10-26T00:00:00+00:00',
    })
    expect(limitesDiaLisboa('2026-03-29').fimExclusivo).toBe('2026-03-30T00:00:00+01:00')
  })
})
