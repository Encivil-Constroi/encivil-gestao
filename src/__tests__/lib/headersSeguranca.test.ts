// Cabeçalhos de segurança servidos pelo Cloudflare Pages (public/_headers)
import { describe, it, expect } from 'vitest'
import headers from '../../../public/_headers?raw'
import html from '../../../index.html?raw'

const csp = headers.match(/Content-Security-Policy: (.+)/)?.[1] ?? ''
const diretiva = (nome: string) =>
  csp.split(';').map(s => s.trim()).find(s => s === nome || s.startsWith(nome + ' ')) ?? ''

describe('cabeçalhos de segurança', () => {
  it('HSTS de 2 anos com subdomínios e preload', () => {
    expect(headers).toMatch(/Strict-Transport-Security: max-age=63072000; includeSubDomains; preload/)
  })
  it('script-src sem unsafe-inline nem unsafe-eval', () => {
    expect(diretiva('script-src')).toBe("script-src 'self'")
  })
  it.each([
    ["object-src 'none'"], ["base-uri 'self'"], ["form-action 'self'"], ["frame-ancestors 'none'"],
    ['upgrade-insecure-requests'],
  ])('CSP tem %s', d => { expect(csp.split(';').map(s => s.trim())).toContain(d) })
  it('isolamento de origem', () => {
    expect(headers).toMatch(/Cross-Origin-Opener-Policy: same-origin/)
    expect(headers).toMatch(/Cross-Origin-Resource-Policy: same-origin/)
  })
  it('index.html sem scripts inline (a CSP bloqueá-los-ia)', () => {
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    expect(inline).toHaveLength(0)
  })
  it('o tema inicial carrega antes do bundle', () => {
    expect(html.indexOf('/tema-inicial.js')).toBeGreaterThan(-1)
    expect(html.indexOf('/tema-inicial.js')).toBeLessThan(html.indexOf('/src/main.tsx'))
  })
})
