import { describe, expect, it } from 'vitest'
import { intervaloSemana, rotuloSemana } from '@/app/lib/relatorios/semanal'

describe('intervaloSemana (Europe/Lisbon)', () => {
  it('quarta-feira: segunda a domingo da mesma semana', () => {
    expect(intervaloSemana('atual', new Date('2026-10-14T10:00:00Z'))).toEqual({ inicio: '2026-10-12', fim: '2026-10-18' })
  })
  it('semana anterior recua 7 dias', () => {
    expect(intervaloSemana('anterior', new Date('2026-10-14T10:00:00Z'))).toEqual({ inicio: '2026-10-05', fim: '2026-10-11' })
  })
  it('00:30 de segunda em Lisboa (verão) já é a semana nova, apesar de ainda ser domingo em UTC', () => {
    expect(intervaloSemana('atual', new Date('2026-07-12T23:30:00Z'))).toEqual({ inicio: '2026-07-13', fim: '2026-07-19' })
  })
  it('domingo é o último dia da semana', () => {
    expect(intervaloSemana('atual', new Date('2026-10-18T12:00:00Z')).inicio).toBe('2026-10-12')
  })
  it('rótulo dd/mm – dd/mm', () => {
    expect(rotuloSemana('2026-10-12', '2026-10-18')).toBe('12/10 – 18/10')
  })
})
