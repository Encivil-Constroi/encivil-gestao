// Edge Function: pump-status
// Endpoint de polling do Shelly Pro 3 (Polo 2). O Shelly chama para fora a cada 5s —
// não é preciso abrir portas no router do armazém.
//
// GET /functions/v1/pump-status?pump_id=polo2&on=0|1&nivel=0|1
// Headers obrigatórios:
//   apikey: <sb_publishable_…>          — sem ele a gateway responde 401 antes de chegar aqui
//   x-pump-secret: <PUMP_POLO2_SECRET>  — a autenticação real do Shelly
// Verify JWT desligado (supabase/config.toml): sb_publishable_* não é um JWT.
//
// Toda a decisão (STOP, fila, sessões, autorização) é feita pela RPC pump_poll
// numa única transação — ver migration 20260928000000_bomba_fila_sessoes.sql.
//
// Respostas:
//   { "status": "idle" }                        → nada a fazer
//   { "status": "stop" }                        → desligar relé já
//   { "status": "authorized", "seconds": 180 }  → ligar relé por N segundos

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PUMP_POLO2_SECRET = Deno.env.get('PUMP_POLO2_SECRET') ?? ''

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

function json(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  })
}

function segredoValido(recebido: string | null): boolean {
  if (!PUMP_POLO2_SECRET || !recebido) return false
  const a = new TextEncoder().encode(recebido)
  const b = new TextEncoder().encode(PUMP_POLO2_SECRET)
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

function flag(v: string | null): boolean | null {
  return v === '1' ? true : v === '0' ? false : null
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Falha de segredo responde "idle" para não revelar se há autorizações em curso
  if (!segredoValido(req.headers.get('x-pump-secret'))) return json({ status: 'idle' })

  const url = new URL(req.url)
  const { data, error } = await supabase.rpc('pump_poll', {
    p_pump_id:  url.searchParams.get('pump_id') ?? '',
    p_relay_on: flag(url.searchParams.get('on')),
    p_nivel:    flag(url.searchParams.get('nivel')),
  })

  if (error) {
    // Na dúvida, desligar: um STOP perdido é pior que um corte a mais
    console.error('[pump-status] pump_poll:', error.message)
    return json({ status: 'stop' })
  }

  const resposta = data as { status: string; seconds?: number }
  if (resposta.status !== 'idle') console.log('[pump-status]', JSON.stringify(resposta))
  return json(resposta)
})
