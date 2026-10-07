import { describe, it, expect, vi } from 'vitest'
import { normalizarNumero, formatarNumero, linkWhatsApp, numerosRecentes, guardarNumeroRecente } from '@/app/lib/whatsapp'

// O localStorage do ambiente de testes não é fiável; um Map chega
const memoria = new Map<string, string>()
vi.stubGlobal('localStorage', { getItem: (k: string) => memoria.get(k) ?? null, setItem: (k: string, v: string) => { memoria.set(k, v) }, removeItem: (k: string) => { memoria.delete(k) }, clear: () => memoria.clear() })

describe('whatsapp', () => {
  it.each([
    ['912 345 678', '351912345678'], ['+351 912345678', '351912345678'], ['00351912345678', '351912345678'],
    ['212345678', '351212345678'], ['+33 6 12 34 56 78', '33612345678'],
  ])('normaliza %s', (i, o) => expect(normalizarNumero(i)).toBe(o))
  it.each(['', '123', '812345678', '+351 81234', 'abc'])('recusa %s', i => expect(normalizarNumero(i)).toBeNull())
  it('link', () => expect(linkWhatsApp('351912345678', 'Olá & até')).toBe('https://wa.me/351912345678?text=Ol%C3%A1%20%26%20at%C3%A9'))
  it('recentes: máx 5, sem duplicados, mais recente primeiro', () => {
    localStorage.clear()
    ;['1', '2', '3', '4', '5', '6', '3'].forEach(guardarNumeroRecente)
    expect(numerosRecentes()).toEqual(['3', '6', '5', '4', '2'])
  })
  it('formatar', () => {
    expect(formatarNumero('351912345678')).toBe('+351 912 345 678')
    expect(formatarNumero('33612345678')).toBe('+33612345678')
  })
})
