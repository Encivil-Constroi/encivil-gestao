import { describe, it, expect } from 'vitest'
import { primeiraMaiuscula, fmtDataExtensa, fmtMesAno, fmtQuantidade } from '@/app/lib/format'

describe('primeiraMaiuscula', () => {
  it('só muda o primeiro carácter', () => {
    expect(primeiraMaiuscula('segunda-feira, 2 de novembro')).toBe('Segunda-feira, 2 de novembro')
    expect(primeiraMaiuscula('ÉPOCA de testes')).toBe('ÉPOCA de testes')
  })
  it('string vazia fica vazia', () => {
    expect(primeiraMaiuscula('')).toBe('')
  })
})

describe('fmtDataExtensa', () => {
  it('dia da semana com maiúscula só no início', () => {
    const s = fmtDataExtensa(new Date(2026, 10, 2))
    expect(s).toBe('Segunda-feira, 2 de novembro de 2026')
    expect(s).not.toMatch(/ De /)
    expect(s).not.toMatch(/Feira/)
  })
  it('aceita string ISO e vazio', () => {
    expect(fmtDataExtensa('2026-11-02T12:00:00')).toBe('Segunda-feira, 2 de novembro de 2026')
    expect(fmtDataExtensa(null)).toBe('—')
  })
})

describe('fmtMesAno', () => {
  it('mês com maiúscula e "de" minúsculo', () => {
    expect(fmtMesAno(new Date(2026, 10, 2))).toBe('Novembro de 2026')
    expect(fmtMesAno(undefined)).toBe('—')
  })
})

describe('fmtQuantidade', () => {
  it('número pt-PT com unidade', () => {
    expect(fmtQuantidade(1453.52, 'kg')).toBe('1453,52 kg')
  })
  it('sem unidade fica só o número', () => {
    expect(fmtQuantidade(12)).toBe('12')
    expect(fmtQuantidade(null, 'un')).toBe('0 un')
  })
})
