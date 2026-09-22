// Edge Function: pump-status
// Endpoint de polling para o Shelly Pro 3 verificar se há autorização de bomba.
//
// GET /functions/v1/pump-status?pump_id=polo2
// Headers obrigatórios:
//   Authorization: Bearer <SUPABASE_ANON_KEY>  (chave pública)
//   x-pump-secret: <PUMP_POLO2_SECRET>          (segredo configurado em Supabase Secrets)
//
// Respostas:
//   { "status": "idle" }                              → nenhuma autorização pendente
//   { "status": "authorized", "seconds": 180 }        → ativar relay por 180s
//
// O token é de uso único: a primeira vez que o Shelly recebe "authorized",
// o campo pump_activated_at é preenchido e respostas seguintes voltam a "idle".

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PUMP_POLO2_SECRET = Deno.env.get('PUMP_POLO2_SECRET') ?? ''

const IDLE = new Response(JSON.stringify({ status: 'idle' }), {
  headers: { 'Content-Type': 'application/json' },
})

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Validar shared secret — responde sempre "idle" em caso de falha
  // para não vazar informação sobre autorizações em curso
  const secret = req.headers.get('x-pump-secret')
  if (!PUMP_POLO2_SECRET || secret !== PUMP_POLO2_SECRET) {
    return IDLE
  }

  const url    = new URL(req.url)
  const pumpId = url.searchParams.get('pump_id')?.toUpperCase()
  if (!pumpId) return IDLE

  // Mapa pump_id → tipo_fonte na tabela
  // (extensível para mais bombas no futuro)
  const PUMP_MAP: Record<string, string> = { POLO2: 'POLO2' }
  const tipoFonte = PUMP_MAP[pumpId]
  if (!tipoFonte) return IDLE

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Procurar pedido autorizado com token válido e ainda não ativado
  const { data, error } = await supabase
    .from('comb_abastecimentos_pendentes')
    .select('id')
    .eq('tipo_fonte', tipoFonte)
    .eq('estado', 'AUTORIZADO')
    .not('pump_auth_token', 'is', null)
    .is('pump_activated_at', null)
    .gt('pump_auth_expires_at', new Date().toISOString())
    .order('pump_auth_expires_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error || !data) return IDLE

  // Marcar como ativado de forma atómica (protege contra corrida de polling duplo)
  const { error: updErr, count } = await supabase
    .from('comb_abastecimentos_pendentes')
    .update({ pump_activated_at: new Date().toISOString() })
    .eq('id', data.id)
    .is('pump_activated_at', null)  // só atualiza se ainda não foi ativado

  if (updErr || count === 0) return IDLE

  return new Response(JSON.stringify({ status: 'authorized', seconds: 180 }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
