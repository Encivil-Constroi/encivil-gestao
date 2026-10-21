// deno test --no-lock --node-modules-dir=none --allow-env supabase/functions/
import { assertEquals } from 'jsr:@std/assert@1'

Deno.env.set('SUPABASE_URL', 'https://teste.supabase.co')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'chave-servico')

const servirOriginal = Deno.serve
;(Deno as unknown as { serve: unknown }).serve = () => ({})
const { criarHandler } = await import('./index.ts')
;(Deno as unknown as { serve: unknown }).serve = servirOriginal

const SEGREDO = 'segredo-da-bomba-0123456789'

function cliente(pumpPoll: { data: unknown; error: { message: string } | null } = { data: { status: 'idle' }, error: null }) {
  const chamadas: [string, Record<string, unknown>][] = []
  return {
    chamadas,
    rpc: (fn: string, args: Record<string, unknown>) => {
      chamadas.push([fn, args])
      // rate_limit_consumir: dentro do limite
      return Promise.resolve(fn === 'pump_poll' ? pumpPoll : { data: true, error: null })
    },
  }
}
const pedido = (query: string, segredo: string | null = SEGREDO) =>
  new Request(`https://x.test/functions/v1/pump-status?${query}`, {
    headers: segredo === null ? {} : { 'x-pump-secret': segredo },
  })

Deno.test('probe=1 com o segredo certo: {"probe":"ok"} sem tocar na bomba', async () => {
  const c = cliente()
  const r = await criarHandler({ segredo: SEGREDO, cliente: c })(pedido('probe=1&pump_id=polo2&on=0&nivel=0'))
  assertEquals(r.status, 200)
  assertEquals(await r.json(), { probe: 'ok' })
  assertEquals(c.chamadas.filter(([fn]) => fn === 'pump_poll'), [])
})

Deno.test('probe=1 com o segredo errado ou em falta: 401', async () => {
  for (const s of ['errado', null]) {
    const c = cliente()
    const r = await criarHandler({ segredo: SEGREDO, cliente: c })(pedido('probe=1&pump_id=polo2', s))
    assertEquals(r.status, 401)
    assertEquals((await r.json()).probe, 'recusado')
    assertEquals(c.chamadas.filter(([fn]) => fn === 'pump_poll'), [])
  }
})

Deno.test('probe=1 sem segredo configurado no servidor: 401 (falha fechada)', async () => {
  const r = await criarHandler({ segredo: '', cliente: cliente() })(pedido('probe=1', ''))
  assertEquals(r.status, 401)
})

Deno.test('poll normal: passa o estado do relé e devolve a decisão do pump_poll', async () => {
  const c = cliente({ data: { status: 'authorized', seconds: 600 }, error: null })
  const r = await criarHandler({ segredo: SEGREDO, cliente: c })(pedido('pump_id=polo2&on=1&nivel=0'))
  assertEquals(await r.json(), { status: 'authorized', seconds: 600 })
  assertEquals(c.chamadas, [['pump_poll', { p_pump_id: 'polo2', p_relay_on: true, p_nivel: false }]])
})

Deno.test('poll com segredo errado: "idle" (não revela nada) e sem pump_poll', async () => {
  const c = cliente()
  const r = await criarHandler({ segredo: SEGREDO, cliente: c })(pedido('pump_id=polo2&on=1', 'errado'))
  assertEquals(r.status, 200)
  assertEquals(await r.json(), { status: 'idle' })
  assertEquals(c.chamadas.filter(([fn]) => fn === 'pump_poll'), [])
})

Deno.test('erro do pump_poll: na dúvida, stop', async () => {
  const c = cliente({ data: null, error: { message: 'falhou' } })
  const r = await criarHandler({ segredo: SEGREDO, cliente: c })(pedido('pump_id=polo2&on=1'))
  assertEquals(await r.json(), { status: 'stop' })
})

Deno.test('só GET', async () => {
  const r = await criarHandler({ segredo: SEGREDO, cliente: cliente() })(new Request('https://x.test/', { method: 'POST' }))
  assertEquals(r.status, 405)
})
