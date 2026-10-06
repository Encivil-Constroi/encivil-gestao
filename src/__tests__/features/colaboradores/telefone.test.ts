import { describe, it, expect } from 'vitest'
import { hrefTel } from '@/features/colaboradores/lib/telefone'

describe('hrefTel', () => {
  it('limpa espaços e mantém o indicativo', () => {
    expect(hrefTel('912 345 678')).toBe('tel:912345678')
    expect(hrefTel('+351 912 345 678')).toBe('tel:+351912345678')
  })
  it('sem número válido não há ligação', () => {
    expect(hrefTel(undefined)).toBeNull()
    expect(hrefTel('')).toBeNull()
    expect(hrefTel('123')).toBeNull()
  })
})
