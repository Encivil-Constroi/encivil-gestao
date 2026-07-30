import { describe, it, expect } from 'vitest'
import { calcStatus } from '@/app/lib/stockUtils'

describe('calcStatus', () => {
  it('sem-stock quando stock é zero', () => {
    expect(calcStatus(0, 10)).toBe('sem-stock')
  })

  it('sem-stock quando stock é negativo', () => {
    expect(calcStatus(-5, 10)).toBe('sem-stock')
  })

  it('baixo quando stock está abaixo do mínimo', () => {
    expect(calcStatus(3, 10)).toBe('baixo')
  })

  it('normal quando stock é igual ao mínimo', () => {
    expect(calcStatus(10, 10)).toBe('normal')
  })

  it('normal quando stock supera o mínimo', () => {
    expect(calcStatus(50, 10)).toBe('normal')
  })

  it('normal quando mínimo é zero e há stock', () => {
    expect(calcStatus(1, 0)).toBe('normal')
  })
})
