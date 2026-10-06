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
