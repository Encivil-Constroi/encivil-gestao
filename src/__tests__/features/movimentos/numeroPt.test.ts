import { describe, it, expect } from 'vitest'
import { lerNumeroPt } from '@/features/movimentos/armazemRegras'

describe('lerNumeroPt (quantidades e preços em pt-PT)', () => {
  it.each([
    ['10', 10], ['2,5', 2.5], ['0,5', 0.5], ['1,234', 1.234], ['7.5', 7.5], ['12.5', 12.5], [' 3 ', 3], ['0,125', 0.125],
    // Um só ponto é sempre decimal (teclados de telemóvel com ponto)
    ['0.250', 0.25], ['1.250', 1.25], ['1.500', 1.5],
    // Ponto é milhar só com vírgula ou com 2+ grupos de 3
    ['1.234,5', 1234.5], ['1.500,25', 1500.25], ['1.234.567', 1234567], ['12.345.678,9', 12345678.9], ['1 500,5', 1500.5],
  ])('"%s" → %s', (v, n) => { expect(lerNumeroPt(v)).toBe(n) })

  it.each(['', '   ', '10abc', 'abc', '1,2,3', '1.2.3', '1.23.456', '1,5.2', '12.34,5', '--1', 'Infinity', '1e3', '0x10', '.', '1.'])(
    '"%s" é inválido', v => { expect(lerNumeroPt(v)).toBeNull() })
})
