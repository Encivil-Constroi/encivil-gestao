// Edge Function: send-push
// Envia Web Push notifications (data-less) para todos os gestores/admins subscritos.
// Push sem corpo evita a necessidade de encriptação RFC 8291 — o SW mostra
// uma notificação fixa e o chefe abre a app para ver detalhes.
//
// Body: { title: string, body: string, url?: string }
// Auth: JWT de utilizador autenticado (ou anon — chamado pela página pública)

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')!   // base64url, 65 bytes uncompressed
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!  // base64url, 32 bytes raw scalar
const VAPID_SUBJECT     = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:gestao@encivil.pt'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const JSON_H = { ...CORS, 'Content-Type': 'application/json' }

function ok(data: unknown)         { return new Response(JSON.stringify(data),          { status: 200, headers: JSON_H }) }
function err(msg: string, s = 400) { return new Response(JSON.stringify({ erro: msg }), { status: s,   headers: JSON_H }) }

// ── Converter base64url ↔ bytes ────────────────────────────────────────────────
function b64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  return Uint8Array.from(bin, c => c.charCodeAt(0))
}

function bytesToB64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// ── Gerar JWT VAPID (RFC 8292) ─────────────────────────────────────────────────
// VAPID_PUBLIC_KEY é um ponto P-256 não comprimido: 0x04 | x(32 bytes) | y(32 bytes)
// VAPID_PRIVATE_KEY é o escalar privado bruto d (32 bytes)
async function vapidJwt(endpoint: string): Promise<string> {
  const audience = new URL(endpoint).origin
  const now      = Math.floor(Date.now() / 1000)

  const header  = bytesToB64url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const payload = bytesToB64url(new TextEncoder().encode(JSON.stringify({ aud: audience, exp: now + 43200, sub: VAPID_SUBJECT })))
  const signing = `${header}.${payload}`

  // Derivar x e y a partir dos 65 bytes do ponto público não comprimido
  const pubBytes = b64urlToBytes(VAPID_PUBLIC_KEY)
  // pubBytes[0] = 0x04 (marcador de ponto não comprimido)
  const xBytes   = pubBytes.slice(1, 33)
  const yBytes   = pubBytes.slice(33, 65)

  const jwk: JsonWebKey = {
    kty: 'EC', crv: 'P-256', ext: true,
    d: VAPID_PRIVATE_KEY,
    x: bytesToB64url(xBytes),
    y: bytesToB64url(yBytes),
  }

  const cryptoKey = await crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign'],
  )

  const sigRaw = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(signing),
  )

  return `${signing}.${bytesToB64url(new Uint8Array(sigRaw))}`
}

// ── Enviar push data-less para um subscriber ───────────────────────────────────
// Sem corpo → sem encriptação (RFC 8291) necessária.
// O SW mostra uma notificação com texto fixo; o chefe abre a app para detalhes.
async function sendWebPush(
  sub: { endpoint: string },
): Promise<{ ok: boolean; status?: number }> {
  const jwt = await vapidJwt(sub.endpoint).catch(() => null)
  if (!jwt) return { ok: false }

  const res = await fetch(sub.endpoint, {
    method:  'POST',
    headers: {
      'TTL':           '86400',
      'Authorization': `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
      'Content-Length': '0',
    },
  }).catch(() => null)

  return { ok: res?.ok ?? false, status: res?.status }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return err('Método não permitido', 405)

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return ok({ sent: 0, skipped: true, reason: 'VAPID não configurado' })
  }

  const body = await req.json().catch(() => null)
  if (!body?.title) return err('title obrigatório')

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: subs, error: subsErr } = await admin
    .from('push_subscriptions')
    .select('endpoint')

  if (subsErr || !subs?.length) return ok({ sent: 0 })

  const results = await Promise.allSettled(
    subs.map(s => sendWebPush(s as { endpoint: string }))
  )

  // Remover subscrições expiradas (410 Gone ou 404 Not Found)
  const expired = results
    .map((r, i) => ({ r, sub: subs[i] }))
    .filter(({ r }) => {
      if (r.status !== 'fulfilled') return false
      const status = (r.value as { status?: number }).status
      return status === 410 || status === 404
    })
    .map(({ sub }) => (sub as { endpoint: string }).endpoint)

  if (expired.length) {
    await admin.from('push_subscriptions').delete().in('endpoint', expired)
  }

  const sent = results.filter(r =>
    r.status === 'fulfilled' && (r as PromiseFulfilledResult<{ ok: boolean }>).value.ok
  ).length

  return ok({ sent })
})
