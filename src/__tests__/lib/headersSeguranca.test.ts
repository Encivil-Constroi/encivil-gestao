// Cabeçalhos de segurança servidos pelo Cloudflare Pages (public/_headers)
import { describe, it, expect } from 'vitest'
import headers from '../../../public/_headers?raw'
import html from '../../../index.html?raw'

const publicas = import.meta.glob<string>('../../../public/*.{html,js}', { query: '?raw', import: 'default', eager: true })
const publico = (f: string) => publicas['../../../public/' + f]
// Todas as páginas HTML estáticas: index.html e tudo o que está em public/
const paginasHtml: Record<string, string> = { 'index.html': html }
for (const [caminho, conteudo] of Object.entries(publicas)) {
  if (caminho.endsWith('.html')) paginasHtml[caminho.replace('../../../', '')] = conteudo
}
const swReset = publico('sw-reset.html')
const swResetJs = publico('sw-reset.js')

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
  it.each(Object.entries(paginasHtml))('%s sem scripts inline, handlers on*= nem javascript: (a CSP bloqueá-los-ia)', (_n, conteudo) => {
    expect([...conteudo.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]).toHaveLength(0)
    expect(conteudo).not.toMatch(/\son\w+\s*=/i)
    expect(conteudo).not.toMatch(/javascript:/i)
  })
  it('a página de recuperação carrega o seu script externo', () => {
    expect(swReset).toMatch(/<script src="\/sw-reset\.js"><\/script>/)
    expect(swResetJs).toMatch(/location\.replace\('\/'\)/)
  })
  it('frame-src permite a pré-visualização de PDFs do Storage', () => {
    expect(diretiva('frame-src')).toContain('https://*.supabase.co')
  })
  it('o tema inicial carrega antes do bundle', () => {
    expect(html.indexOf('/tema-inicial.js')).toBeGreaterThan(-1)
    expect(html.indexOf('/tema-inicial.js')).toBeLessThan(html.indexOf('/src/main.tsx'))
  })
})
