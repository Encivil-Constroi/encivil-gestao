import { describe, it, expect } from 'vitest'
import { textoFaltamKm, textoFaltamDias, textoPrazoAlerta, diasAte, formatarData } from '@/app/lib/prazoFrota'

describe('prazoFrota', () => {
  it.each([
    [400, 'faltam 400 km'],
    [0, 'chegou ao prazo'],
    [-150, 'passou 150 km do prazo'],
    [399.6, 'faltam 400 km'],
  ])('km %d → %s', (n, t) => expect(textoFaltamKm(n)).toBe(t))

  it.each([
    [5, 'vence em 5 dias'], [1, 'vence amanhã'], [0, 'vence hoje'],
    [-1, 'atrasado 1 dia'], [-12, 'atrasado 12 dias'],
  ])('dias %d → %s', (n, t) => expect(textoFaltamDias(n)).toBe(t))

  it('alerta: limiar preenchido é km, vazio é dias', () => {
    expect(textoPrazoAlerta(400, 10000)).toBe('faltam 400 km')
    expect(textoPrazoAlerta(3, undefined)).toBe('vence em 3 dias')
    expect(textoPrazoAlerta(undefined, undefined)).toBe('')
  })

  it('dias entre datas de calendário, sem depender da hora do dia', () => {
    const hoje = new Date(2026, 8, 29, 23, 59)   // 29/09/2026 às 23:59
    expect(diasAte('2026-09-29', hoje)).toBe(0)
    expect(diasAte('2026-09-30', hoje)).toBe(1)
    expect(diasAte('2026-09-24', hoje)).toBe(-5)
    expect(diasAte('2027-09-29', hoje)).toBe(365)
    // mudança da hora (último domingo de outubro) não estraga a contagem
    expect(diasAte('2026-11-01', new Date(2026, 9, 24, 12))).toBe(8)
  })

  it('data em formato português', () => expect(formatarData('2026-09-29')).toBe('29/09/2026'))
})
