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
// numa única transação — ver migrations 20260928000000 e 20261020100000.
//
// Respostas:
//   { "status": "idle" }                        → nada a fazer
//   { "status": "stop" }                        → desligar relé já
//   { "status": "authorized", "seconds": 180 }  → ligar relé por N segundos
//
// GET …/pump-status?probe=1 (instalador): só valida o segredo, sem tocar na bomba
// nem no heartbeat. Certo → 200 { "probe": "ok" }; errado → 401.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { falhaSegredoPermitida } from '../_shared/limite.ts'

type ClienteRpc = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>
}

function json(body: Record<string, unknown>, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  })
}

function segredoValido(recebido: string | null, esperado: string): boolean {
  if (!esperado || !recebido) return false
  const a = new TextEncoder().encode(recebido)
  const b = new TextEncoder().encode(esperado)
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

function flag(v: string | null): boolean | null {
  return v === '1' ? true : v === '0' ? false : null
}

export function criarHandler({ segredo, cliente }: { segredo: string; cliente: ClienteRpc }) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 })
    }

    const url = new URL(req.url)
    const probe = url.searchParams.get('probe') === '1'

    if (!segredoValido(req.headers.get('x-pump-secret'), segredo)) {
      // Só as falhas contam: trava a adivinhação do segredo sem limitar o Shelly legítimo
      if (!await falhaSegredoPermitida(cliente, req)) {
        return json(probe ? { probe: 'recusado' } : { status: 'idle' }, 429, { 'Retry-After': '600' })
      }
      // O poll responde "idle" para não revelar se há autorizações em curso;
      // o probe diz a verdade ao instalador (sem revelar nada da bomba)
      return probe ? json({ probe: 'recusado' }, 401) : json({ status: 'idle' })
    }

    if (probe) return json({ probe: 'ok' })

    const { data, error } = await cliente.rpc('pump_poll', {
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
  }
}

Deno.serve(criarHandler({
  segredo: Deno.env.get('PUMP_POLO2_SECRET') ?? '',
  cliente: createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!),
}))
