import { describe, it, expect } from 'vitest'
import { detetarPlataforma, PASSOS_INSTALACAO } from '@/app/pages/ajuda/instalacao'

describe('detetarPlataforma', () => {
  it('iPhone → ios', () => {
    expect(detetarPlataforma('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari', false)).toBe('ios')
  })
  it('iPadOS com UA de Mac e ecrã tátil → ios', () => {
    expect(detetarPlataforma('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari', false, 5)).toBe('ios')
  })
  it('Mac sem ecrã tátil → desktop', () => {
    expect(detetarPlataforma('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari', false, 0)).toBe('desktop')
  })
  it('Android → android', () => {
    expect(detetarPlataforma('Mozilla/5.0 (Linux; Android 14; SM-A54) Chrome/120 Mobile', false)).toBe('android')
  })
  it('Windows → desktop', () => {
    expect(detetarPlataforma('Mozilla/5.0 (Windows NT 10.0) Chrome/120', false)).toBe('desktop')
  })
  it('modo standalone → instalada, seja qual for o aparelho', () => {
    expect(detetarPlataforma('qualquer', true)).toBe('instalada')
    expect(detetarPlataforma('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', true)).toBe('instalada')
  })
})

describe('PASSOS_INSTALACAO', () => {
  it('iOS usa Partilhar e Adicionar ao ecrã principal', () => {
    expect(PASSOS_INSTALACAO.ios.join(' ')).toMatch(/Partilhar/)
    expect(PASSOS_INSTALACAO.ios.join(' ')).toMatch(/Adicionar ao ecrã principal/)
  })
  it('Android fala em Instalar', () => {
    expect(PASSOS_INSTALACAO.android.join(' ')).toMatch(/Instalar/)
  })
  it('todas as plataformas têm passos', () => {
    for (const p of ['ios', 'android', 'desktop'] as const) expect(PASSOS_INSTALACAO[p].length).toBeGreaterThan(1)
  })
})
