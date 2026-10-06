import { assertEquals } from 'jsr:@std/assert@1'
import { dentroDoLimite, respostaLimite, MSG_LIMITE } from './limite.ts'

const cliente = (r: { data: unknown; error: { message: string } | null }) => {
  const chamadas: unknown[] = []
  return { chamadas, rpc: (fn: string, args: Record<string, unknown>) => { chamadas.push([fn, args]); return Promise.resolve(r) } }
}

Deno.test('dentro do limite', async () => {
  const c = cliente({ data: true, error: null })
  assertEquals(await dentroDoLimite(c, 'extrair-fatura:u1', 600, 20), true)
  assertEquals(c.chamadas[0], ['rate_limit_consumir', { p_chave: 'extrair-fatura:u1', p_janela_seg: 600, p_max: 20 }])
})
Deno.test('acima do limite', async () => {
  assertEquals(await dentroDoLimite(cliente({ data: false, error: null }), 'k', 60, 1), false)
})
Deno.test('falha aberta se a RPC não existir ou falhar (função publicada antes da migration)', async () => {
  assertEquals(await dentroDoLimite(cliente({ data: null, error: { message: 'function does not exist' } }), 'k', 60, 1), true)
})
Deno.test('429 com Retry-After e mensagem pt-PT', async () => {
  const r = respostaLimite({ 'Vary': 'Origin' }, 600)
  assertEquals(r.status, 429)
  assertEquals(r.headers.get('Retry-After'), '600')
  assertEquals((await r.json()).erro, MSG_LIMITE)
})

import { ipCliente, falhaSegredoPermitida } from './limite.ts'
const pedido = (h: Record<string, string>) => new Request('https://x.test/', { headers: h })

Deno.test('ipCliente: cf-connecting-ip ganha', () => {
  assertEquals(ipCliente(pedido({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '9.9.9.9, 2.2.2.2' })), '1.1.1.1')
})
Deno.test('ipCliente: usa a última entrada do x-forwarded-for', () => {
  assertEquals(ipCliente(pedido({ 'x-forwarded-for': '2.2.2.2, 3.3.3.3 ' })), '3.3.3.3')
})
Deno.test('ipCliente: primeira entrada falsificada é ignorada', () => {
  assertEquals(ipCliente(pedido({ 'x-forwarded-for': 'falso-1, 4.4.4.4' })), ipCliente(pedido({ 'x-forwarded-for': 'falso-2, 4.4.4.4' })))
})
Deno.test('ipCliente: sem cabeçalhos devolve null', () => {
  assertEquals(ipCliente(pedido({})), null)
})

const clienteChaves = (negar: string) => {
  const chaves: string[] = []
  return { chaves, rpc: (_fn: string, a: Record<string, unknown>) => {
    chaves.push(a.p_chave as string)
    return Promise.resolve({ data: a.p_chave !== negar, error: null })
  } }
}
Deno.test('falha de segredo: limite global recusa mesmo com IP sempre diferente', async () => {
  const c = clienteChaves('pump-status:falhas')
  assertEquals(await falhaSegredoPermitida(c, pedido({ 'cf-connecting-ip': '5.5.5.5' })), false)
  assertEquals(c.chaves, ['pump-status:5.5.5.5', 'pump-status:falhas'])
})
Deno.test('falha de segredo: limite por IP recusa', async () => {
  assertEquals(await falhaSegredoPermitida(clienteChaves('pump-status:5.5.5.5'), pedido({ 'cf-connecting-ip': '5.5.5.5' })), false)
})
Deno.test('falha de segredo sem IP só conta o global', async () => {
  const c = clienteChaves('nenhuma')
  assertEquals(await falhaSegredoPermitida(c, pedido({})), true)
  assertEquals(c.chaves, ['pump-status:falhas'])
})
