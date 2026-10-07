import { describe, it, expect } from 'vitest'
import { nifValido, nissValido, ibanValido, formatarIban } from '@/app/lib/validacoesFiscais'

const PESOS = [29, 23, 19, 17, 13, 11, 7, 5, 3, 2]
function nissCom(dez: string): string {
  const soma = PESOS.reduce((a, p, i) => a + p * Number(dez[i]), 0)
  return dez + String(9 - (soma % 10))
}

describe('nifValido', () => {
  it('aceita e recusa', () => {
    expect(nifValido('123456789')).toBe(true)
    expect(nifValido('123456780')).toBe(false)
    expect(nifValido('423456789')).toBe(false)
    expect(nifValido('12345678')).toBe(false)
  })
})

describe('nissValido', () => {
  it('aceita um número com controlo correto e recusa o último dígito trocado', () => {
    const ok = nissCom('1234567890')
    expect(nissValido(ok)).toBe(true)
    const errado = ok.slice(0, 10) + String((Number(ok[10]) + 1) % 10)
    expect(nissValido(errado)).toBe(false)
    expect(nissValido('12345678901')).toBe(false)
    expect(nissValido('123')).toBe(false)
  })
})

describe('ibanValido / formatarIban', () => {
  it('exemplo oficial português', () => {
    expect(ibanValido('PT50 0002 0123 1234 5678 9015 4')).toBe(true)
    expect(ibanValido('pt50000201231234567890154')).toBe(true)
    expect(ibanValido('PT50000201231234567890155')).toBe(false)
    expect(ibanValido('PT5000020123123456789015')).toBe(false)
  })
  it('formata em grupos de 4', () => {
    expect(formatarIban('pt50000201231234567890154')).toBe('PT50 0002 0123 1234 5678 9015 4')
  })
})
