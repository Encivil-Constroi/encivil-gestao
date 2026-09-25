// Edge Function: pump-status
// Endpoint de polling do Shelly Pro 3 (Polo 2). O Shelly chama para fora a cada 5s —
// não é preciso abrir portas no router do armazém.
//
// GET /functions/v1/pump-status?pump_id=polo2&on=0|1&nivel=0|1
// Header obrigatório: x-pump-secret: <PUMP_POLO2_SECRET>
// Deploy OBRIGATÓRIO com --no-verify-jwt (ver supabase/config.toml): as chaves
// sb_publishable_* não são JWT e o gateway rejeitaria o Shelly com 401.
//
// Respostas:
//   { "status": "idle" }                        → nada a fazer
//   { "status": "stop" }                        → desligar relé já
//   { "status": "authorized", "seconds": 180 }  → ligar relé por N segundos

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PUMP_POLO2_SECRET = Deno.env.get('PUMP_POLO2_SECRET') ?? ''

// Um STOP mais antigo que isto é descartado: aplicá-lo tarde podia cortar
// o abastecimento seguinte depois de o Shelly voltar a estar online
const STOP_VALIDO_MS = 120_000

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const PUMP_MAP: Record<string, string> = { POLO2: 'POLO2' }

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

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Falha de segredo responde "idle" para não revelar se há autorizações em curso
  if (!segredoValido(req.headers.get('x-pump-secret'))) return json({ status: 'idle' })

  const url       = new URL(req.url)
  const tipoFonte = PUMP_MAP[url.searchParams.get('pump_id')?.toUpperCase() ?? '']
  if (!tipoFonte) return json({ status: 'idle' })

  const flag = (nome: string) => {
    const v = url.searchParams.get(nome)
    return v === '1' ? true : v === '0' ? false : null
  }
  const agora = new Date()

  const [beat, stops] = await Promise.all([
    supabase
      .from('pump_heartbeat')
      .upsert({
        pump_id:      tipoFonte,
        last_seen_at: agora.toISOString(),
        relay_on:     flag('on'),
        nivel_alarme: flag('nivel'),
      }),
    // Consome todos os STOP pendentes (inclusive os velhos) num único round-trip
    supabase
      .from('pump_comandos')
      .update({ consumido_em: agora.toISOString() })
      .eq('pump_id', tipoFonte)
      .is('consumido_em', null)
      .select('criado_em'),
  ])

  if (beat.error) console.error('[pump-status] heartbeat:', beat.error.message)
  if (stops.error) {
    // Na dúvida, desligar: um STOP perdido é pior que um corte a mais
    console.error('[pump-status] comandos:', stops.error.message)
    return json({ status: 'stop' })
  }

  const stopRecente = (stops.data ?? []).some(
    s => agora.getTime() - new Date(s.criado_em as string).getTime() < STOP_VALIDO_MS
  )
  if (stopRecente) {
    console.log('[pump-status] STOP enviado ao Shelly')
    return json({ status: 'stop' })
  }

  const { data, error } = await supabase
    .from('comb_abastecimentos_pendentes')
    .select('id, pump_max_seconds')
    .eq('tipo_fonte', tipoFonte)
    .eq('estado', 'AUTORIZADO')
    .not('pump_auth_token', 'is', null)
    .is('pump_activated_at', null)
    .gt('pump_auth_expires_at', agora.toISOString())
    .order('pump_auth_expires_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[pump-status] query:', error.message)
    return json({ status: 'idle' })
  }
  if (!data) return json({ status: 'idle' })

  // CAS: só um poll consegue marcar a ativação
  const { error: updErr, count } = await supabase
    .from('comb_abastecimentos_pendentes')
    .update({ pump_activated_at: agora.toISOString() }, { count: 'exact' })
    .eq('id', data.id)
    .is('pump_activated_at', null)

  if (updErr) {
    console.error('[pump-status] ativação:', updErr.message)
    return json({ status: 'idle' })
  }
  if (count === 0) return json({ status: 'idle' })

  const seconds = (data as { pump_max_seconds?: number }).pump_max_seconds ?? 180
  console.log('[pump-status] Bomba ativada — pedido:', data.id, '— segundos:', seconds)
  return json({ status: 'authorized', seconds })
})
