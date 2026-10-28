import { describe, it, expect, afterEach } from 'vitest'
import { isNetworkError, ehErroDefinitivo } from '@/app/lib/errosRede'

function onLine(valor: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => valor })
}
afterEach(() => onLine(true))

describe('isNetworkError', () => {
  it('reconhece o erro do supabase-js, que é um objeto simples e não um Error', () => {
    expect(isNetworkError({ message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' })).toBe(true)
  })
  it('reconhece Error de fetch (Chrome e Safari) e sem rede', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkError(new TypeError('Load failed'))).toBe(true)
    onLine(false)
    expect(isNetworkError({ code: 'P0001', message: 'Stock insuficiente' })).toBe(true)
  })
  it('erro de negócio não é de rede', () => {
    expect(isNetworkError({ code: 'P0001', message: 'Stock insuficiente' })).toBe(false)
  })
})

describe('ehErroDefinitivo', () => {
  it.each(['P0001', '42501', '23505', '23503', '22P02', '22003', 'PGRST116'])('%s é definitivo (retentar não resolve)', code => {
    expect(ehErroDefinitivo({ code, message: 'x' })).toBe(true)
  })
  it.each(['57014', '40001', '40P01', '53300', 'PGRST202', 'PGRST301', 'PGRST303', '', '503'])('%s é transitório ou desconhecido', code => {
    expect(ehErroDefinitivo({ code, message: 'x' })).toBe(false)
  })
  it('5xx/429 do Cloudflare (sem code) e erros sem forma conhecida não são definitivos', () => {
    expect(ehErroDefinitivo({ message: 'error code: 522' })).toBe(false)
    expect(ehErroDefinitivo({ message: '<html>502 Bad Gateway</html>' })).toBe(false)
    expect(ehErroDefinitivo(new Error('qualquer coisa'))).toBe(false)
    expect(ehErroDefinitivo(null)).toBe(false)
    expect(ehErroDefinitivo('texto')).toBe(false)
  })
  it('falha de rede nunca é definitiva', () => {
    expect(ehErroDefinitivo({ message: 'TypeError: Failed to fetch', code: '' })).toBe(false)
  })
})
