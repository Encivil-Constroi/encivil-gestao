import { assertEquals } from 'jsr:@std/assert@1'
import { origemPermitida, cabecalhosCors, origemRecusada } from './cors.ts'

const pedido = (origem?: string) => new Request('https://x.supabase.co/functions/v1/f', {
  method: 'POST', headers: origem ? { Origin: origem } : {},
})

Deno.test('origens permitidas', () => {
  for (const o of ['https://app.encivilconstroi.com', 'https://encivil-gestao.pages.dev',
                   'https://abc123.encivil-gestao.pages.dev', 'http://localhost:5173', 'http://127.0.0.1:5173'])
    assertEquals(origemPermitida(o), true, o)
})
Deno.test('origens recusadas', () => {
  for (const o of ['https://evil.com', 'https://app.encivilconstroi.com.evil.com', 'http://app.encivilconstroi.com',
                   'https://encivil-gestao.pages.dev.evil.com', 'https://a.b.encivil-gestao.pages.dev', 'null', '',
                   'https://x.encivil-gestao.pages.dev.evil.com', 'https://x.encivil-gestao.pages.dev/', 'https://evil.com/https://x.encivil-gestao.pages.dev'])
    assertEquals(origemPermitida(o), false, o)
  assertEquals(origemPermitida(null), false)
})
Deno.test('cabeçalhos ecoam só a origem permitida', () => {
  assertEquals(cabecalhosCors(pedido('https://app.encivilconstroi.com'))['Access-Control-Allow-Origin'], 'https://app.encivilconstroi.com')
  assertEquals(cabecalhosCors(pedido('https://evil.com'))['Access-Control-Allow-Origin'], undefined)
  assertEquals(cabecalhosCors(pedido('https://evil.com'))['Vary'], 'Origin')
})
Deno.test('sem Origin (cron, servidor) não é recusado; origem estranha é', () => {
  assertEquals(origemRecusada(pedido()), false)
  assertEquals(origemRecusada(pedido('https://evil.com')), true)
  assertEquals(origemRecusada(pedido('https://app.encivilconstroi.com')), false)
})
