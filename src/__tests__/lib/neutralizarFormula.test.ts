import { describe, it, expect } from 'vitest'
import { neutralizarFormula } from '@/app/lib/neutralizarFormula'

describe('neutralizarFormula (injeção de fórmulas em CSV/Excel)', () => {
  it.each([
    ['=HYPERLINK("http://x","clique")'], ['+1+1'], ['-2+3'], ['@SUM(A1)'], ['\t=1'], ['\r=1'],
  ])('texto perigoso %j fica como texto', (s) => { expect(neutralizarFormula(s)).toBe(`'${s}`) })
  it('números genuínos ficam números (inclui negativos)', () => {
    expect(neutralizarFormula(-5)).toBe(-5)
    expect(neutralizarFormula(12.5)).toBe(12.5)
  })
  it('texto que é um número negativo simples fica como está', () => {
    expect(neutralizarFormula('-5')).toBe('-5')
    expect(neutralizarFormula('-5,25')).toBe('-5,25')
  })
  it('"-5 sacos" é texto livre → neutralizado', () => {
    expect(neutralizarFormula('-5 sacos')).toBe("'-5 sacos")
  })
  it('texto normal, null, datas e booleanos intactos', () => {
    expect(neutralizarFormula('Cimento')).toBe('Cimento')
    expect(neutralizarFormula(null)).toBe(null)
    expect(neutralizarFormula(true)).toBe(true)
    const d = new Date(0); expect(neutralizarFormula(d)).toBe(d)
  })
})
