import { describe, it, expect } from 'vitest'
import { mensagemRecuperacao } from '@/features/auth/lib/recuperacao'

describe('mensagemRecuperacao', () => {
  it('usa o primeiro nome e o link', () => {
    expect(mensagemRecuperacao('  Rui Silva ', 'https://x/y')).toBe(
      'Olá Rui, para criar a sua nova palavra-passe da ENCIVIL Gestão abra este link (pessoal, válido cerca de 1 hora):\nhttps://x/y',
    )
  })
  it('sem nome', () => {
    expect(mensagemRecuperacao('', 'L').startsWith('Olá, para criar')).toBe(true)
  })
})
