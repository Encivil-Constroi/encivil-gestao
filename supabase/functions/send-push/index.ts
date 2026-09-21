// Edge Function: send-push
// Envia Web Push notifications para todos os gestores/admins subscritos.
// Chamada pelo frontend após o motorista submeter um pedido de autorização.
//
// Body: { title: string, body: string, url?: string }
// Auth: JWT de utilizador autenticado (anon via service-role para trigger interno)

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT     = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:gestao@encivil.pt'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const JSON_H = { ...CORS, 'Content-Type': 'application/json' }

function ok(data: unknown)         { return new Response(JSON.stringify(data),          { status: 200, headers: JSON_H }) }
function err(msg: string, s = 400) { return new Response(JSON.stringify({ erro: msg }), { status: s,   headers: JSON_H }) }

// ── Gerar JWT VAPID (RFC 8292) ─────────────────────────────────────────────────
async function vapidJwt(endpoint: string): Promise<string> {
  const audience = new URL(endpoint).origin
  const now      = Math.floor(Date.now() / 1000)
  const header   = btoa(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  const payload  = btoa(JSON.stringify({ aud: audience, exp: now + 43200, sub: VAPID_SUBJECT }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  const signing  = `${header}.${payload}`

  // Importar a chave privada VAPID (formato raw base64url → JWK)
  const rawKey   = Uint8Array.from(atob(VAPID_PRIVATE_KEY.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    rawKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  ).catch(async () => {
    // Tentar como raw (32 bytes)
    const jwk: JsonWebKey = {
      kty: 'EC', crv: 'P-256', ext: true,
      d: VAPID_PRIVATE_KEY,
      // x e y são necessários mas podem ficar vazios para sign
      x: '', y: '',
    }
    return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  })

  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, cryptoKey, new TextEncoder().encode(signing))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  return `${signing}.${sigB64}`
}

// ── Enviar push para um subscriber ────────────────────────────────────────────
async function sendWebPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: string
): Promise<{ ok: boolean; status?: number }> {
  const jwt = await vapidJwt(sub.endpoint).catch(() => null)
  if (!jwt) return { ok: false }

  const res = await fetch(sub.endpoint, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/octet-stream',
      'TTL':           '86400',
      'Authorization': `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
      'Content-Encoding': 'aes128gcm',
    },
    body: new TextEncoder().encode(payload),
  }).catch(() => null)

  return { ok: res?.ok ?? false, status: res?.status }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return err('Método não permitido', 405)

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    // Graceful: sem VAPID configurado, ignorar silenciosamente
    return ok({ sent: 0, skipped: true, reason: 'VAPID não configurado' })
  }

  const body = await req.json().catch(() => null)
  if (!body?.title) return err('title obrigatório')

  const { title, body: msgBody = '', url = '/' } = body as {
    title: string; body?: string; url?: string
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Buscar todas as subscrições de gestores e admins
  const { data: subs, error: subsErr } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')

  if (subsErr || !subs?.length) return ok({ sent: 0 })

  const payload = JSON.stringify({ title, body: msgBody, url, icon: '/pwa-192x192.png', badge: '/pwa-64x64.png' })

  const results = await Promise.allSettled(
    subs.map(s => sendWebPush(s as { endpoint: string; p256dh: string; auth: string }, payload))
  )

  // Remover subscrições expiradas (410 Gone)
  const expired = results
    .map((r, i) => ({ r, sub: subs[i] }))
    .filter(({ r }) => r.status === 'fulfilled' && (r.value as { status?: number }).status === 410)
    .map(({ sub }) => (sub as { endpoint: string }).endpoint)

  if (expired.length) {
    await admin.from('push_subscriptions').delete().in('endpoint', expired)
  }

  const sent = results.filter(r => r.status === 'fulfilled' && (r as PromiseFulfilledResult<{ok: boolean}>).value.ok).length
  return ok({ sent })
})
