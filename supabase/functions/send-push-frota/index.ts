// Edge Function: send-push-frota
// Avalia a frota e envia uma notificação push, com o texto dos alertas, só a
// quem está em frota_alerta_destinatarios (o chefe e o mecânico) — nunca a
// todos os subscritos, ao contrário do send-push do combustível.
//
// Chamada pelo pg_cron (migration 20260929040000), com o cabeçalho x-frota-secret.
// O segredo é gerado no próprio banco e confirmado com frota_push_autorizado()
// — não há segredo para copiar para o Dashboard.
//
// Cada alerta é notificado uma vez; volta a ser notificado se passar de
// ATENÇÃO a URGENTE (colunas push_severidade / push_em em alertas).
//
// Ao contrário do send-push (sem corpo, texto fixo no service worker), aqui o
// texto segue no payload cifrado conforme a RFC 8291 (aes128gcm) — é o que
// permite ao service worker distinguir uma notificação de frota de um pedido
// de combustível.
//
// Segredos: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (já usados pelo send-push).

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT     = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:gestao@encivil.pt'

// WebCrypto só aceita bytes sobre ArrayBuffer (não SharedArrayBuffer)
export type Bytes = Uint8Array<ArrayBuffer>

const MAX_CORPO = 300  // o payload cifrado tem de caber num registo de 4096 bytes

// ── base64url ─────────────────────────────────────────────────────────────────
export function b64urlParaBytes(b64url: string): Bytes {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  return Uint8Array.from(atob(b64 + pad), c => c.charCodeAt(0))
}

export function bytesParaB64url(bytes: Bytes): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function juntar(...partes: Bytes[]): Bytes {
  const total = partes.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let i = 0
  for (const p of partes) { out.set(p, i); i += p.length }
  return out
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
  const chave = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits  = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, chave, bytes * 8)
  return new Uint8Array(bits)
}

const texto = (s: string) => new TextEncoder().encode(s)

// ── Cifragem RFC 8291 (Web Push, aes128gcm, um só registo) ────────────────────
// `teste` injeta o salt e a chave do servidor para reproduzir o exemplo da RFC.
export async function cifrarPayload(
  conteudo: Bytes,
  uaPublicB64: string,
  authB64: string,
  teste?: { salt: Bytes; asPrivateJwk: JsonWebKey },
): Promise<Bytes> {
  const uaPublic = b64urlParaBytes(uaPublicB64)
  const auth     = b64urlParaBytes(authB64)
  const salt     = teste?.salt ?? crypto.getRandomValues(new Uint8Array(16))

  let asPrivate: CryptoKey
  let asPublic: Bytes
  if (teste) {
    asPrivate = await crypto.subtle.importKey('jwk', teste.asPrivateJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
    asPublic  = juntar(new Uint8Array([4]), b64urlParaBytes(teste.asPrivateJwk.x!), b64urlParaBytes(teste.asPrivateJwk.y!))
  } else {
    const par = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
    asPrivate = par.privateKey
    asPublic  = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey))
  }

  const uaChave = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdh    = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaChave }, asPrivate, 256))

  const ikm   = await hkdf(auth, ecdh, juntar(texto('WebPush: info\0'), uaPublic, asPublic), 32)
  const cek   = await hkdf(salt, ikm, texto('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, texto('Content-Encoding: nonce\0'), 12)

  const chaveAes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  // 0x02 = delimitador do último (e único) registo
  const cifrado = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce }, chaveAes, juntar(conteudo, new Uint8Array([2])),
  ))

  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, 4096)
  return juntar(salt, rs, new Uint8Array([asPublic.length]), asPublic, cifrado)
}

// ── Texto da notificação ──────────────────────────────────────────────────────
export type AlertaFrota = {
  id: string
  severidade: 'ATENCAO' | 'URGENTE'
  push_severidade: string | null
  valor_atual: number | null
  valor_limiar: number | null   // preenchido = prazo em km; vazio = prazo em dias
  veiculo: string
  item: string
}

export function precisaNotificar(a: Pick<AlertaFrota, 'severidade' | 'push_severidade'>): boolean {
  return a.push_severidade == null || (a.push_severidade === 'ATENCAO' && a.severidade === 'URGENTE')
}

export function textoPrazo(a: Pick<AlertaFrota, 'valor_atual' | 'valor_limiar'>): string {
  const n = Math.round(Number(a.valor_atual ?? 0))
  if (a.valor_limiar != null) {
    const km = Math.abs(n).toLocaleString('pt-PT')
    if (n === 0) return 'chegou ao prazo'
    return n > 0 ? `faltam ${km} km` : `passou ${km} km do prazo`
  }
  if (n > 1)  return `vence em ${n} dias`
  if (n === 1) return 'vence amanhã'
  if (n === 0) return 'vence hoje'
  return n === -1 ? 'atrasado 1 dia' : `atrasado ${-n} dias`
}

export function montarMensagem(alertas: AlertaFrota[]): { title: string; body: string; url: string; tag: string } {
  const ordenados = [...alertas].sort((a, b) =>
    a.severidade === b.severidade ? 0 : a.severidade === 'URGENTE' ? -1 : 1)
  const urgentes = ordenados.filter(a => a.severidade === 'URGENTE').length
  const linhas = ordenados.map(a => `${a.veiculo} — ${a.item}: ${textoPrazo(a)}`)

  const title = alertas.length === 1
    ? `Frota · ${ordenados[0].severidade === 'URGENTE' ? 'Urgente' : 'Atenção'}`
    : `Frota · ${alertas.length} alertas${urgentes ? ` (${urgentes} urgente${urgentes > 1 ? 's' : ''})` : ''}`

  let body = linhas.join('\n')
  if (body.length > MAX_CORPO) body = body.slice(0, MAX_CORPO - 1).trimEnd() + '…'
  return { title, body, url: '/frota', tag: 'frota' }
}

// ── VAPID (RFC 8292) — igual ao send-push ─────────────────────────────────────
async function vapidJwt(endpoint: string): Promise<string> {
  const header  = bytesParaB64url(texto(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const payload = bytesParaB64url(texto(JSON.stringify({
    aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 43200, sub: VAPID_SUBJECT,
  })))
  const pub = b64urlParaBytes(VAPID_PUBLIC_KEY)
  const chave = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256', ext: true, d: VAPID_PRIVATE_KEY,
    x: bytesParaB64url(pub.slice(1, 33)), y: bytesParaB64url(pub.slice(33, 65)),
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const assinatura = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, chave, texto(`${header}.${payload}`))
  return `${header}.${payload}.${bytesParaB64url(new Uint8Array(assinatura))}`
}

type Subscricao = { endpoint: string; p256dh: string; auth: string }

async function enviar(sub: Subscricao, conteudo: Bytes): Promise<number> {
  try {
    const corpo = await cifrarPayload(conteudo, sub.p256dh, sub.auth)
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        'TTL': '86400',
        'Urgency': 'high',
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        'Authorization': `vapid t=${await vapidJwt(sub.endpoint)},k=${VAPID_PUBLIC_KEY}`,
      },
      body: corpo,
    })
    return res.status
  } catch {
    return 0
  }
}

function resposta(dados: Record<string, unknown>, status = 200) {
  if (status >= 400) console.error(`[send-push-frota] ${status} ${JSON.stringify(dados)}`)
  return new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return resposta({ erro: 'Método não permitido' }, 405)
  const segredo = req.headers.get('x-frota-secret')
  if (!segredo) return resposta({ erro: 'Não autorizado' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: autorizado, error: autErr } = await admin.rpc('frota_push_autorizado', { p_segredo: segredo })
  if (autErr) return resposta({ erro: 'Falha ao validar o pedido', detalhe: autErr.message }, 500)
  if (autorizado !== true) return resposta({ erro: 'Não autorizado' }, 401)
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return resposta({ erro: 'VAPID não configurado' }, 500)

  // Datas avançam de um dia para o outro: avaliar antes de decidir o que enviar
  const { error: avalErr } = await admin.rpc('avaliar_frota')
  if (avalErr) return resposta({ erro: 'Falha ao avaliar a frota', detalhe: avalErr.message }, 500)

  const { data: regra } = await admin.from('regras_alerta').select('id').eq('tipo', 'FROTA_ITEM').limit(1).maybeSingle()
  if (!regra) return resposta({ enviados: 0, motivo: 'regra FROTA_ITEM inexistente' })

  const { data: ativos, error: alErr } = await admin
    .from('alertas')
    .select('id, severidade, push_severidade, valor_atual, valor_limiar, entidade_id')
    .eq('regra_id', regra.id)
    .eq('estado', 'ATIVO')
  if (alErr) return resposta({ erro: 'Falha ao ler alertas', detalhe: alErr.message }, 500)

  const pendentes = (ativos ?? []).filter(precisaNotificar)
  if (!pendentes.length) return resposta({ enviados: 0, alertas: 0 })

  const { data: itens, error: itErr } = await admin
    .from('frota_veiculo_itens')
    .select('id, comb_veiculos(nome), frota_itens_catalogo(rotulo)')
    .in('id', pendentes.map(a => a.entidade_id))
  if (itErr) return resposta({ erro: 'Falha ao ler itens', detalhe: itErr.message }, 500)

  const porId = new Map((itens ?? []).map(i => [i.id, i as unknown as {
    comb_veiculos: { nome: string } | null; frota_itens_catalogo: { rotulo: string } | null
  }]))
  const alertas: AlertaFrota[] = pendentes.map(a => ({
    id: a.id,
    severidade: a.severidade,
    push_severidade: a.push_severidade,
    valor_atual: a.valor_atual,
    valor_limiar: a.valor_limiar,
    veiculo: porId.get(a.entidade_id)?.comb_veiculos?.nome ?? 'Viatura',
    item: porId.get(a.entidade_id)?.frota_itens_catalogo?.rotulo ?? 'Item',
  }))

  const { data: dest } = await admin.from('frota_alerta_destinatarios').select('user_id')
  const ids = (dest ?? []).map(d => d.user_id)
  if (!ids.length) return resposta({ enviados: 0, alertas: alertas.length, motivo: 'sem destinatários' })

  const { data: subs } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth').in('user_id', ids)
  // Sem telemóvel subscrito não se marca como notificado: fica para quando subscreverem
  if (!subs?.length) return resposta({ enviados: 0, alertas: alertas.length, motivo: 'destinatários sem notificações ativas' })

  const conteudo = texto(JSON.stringify(montarMensagem(alertas)))
  const estados = await Promise.all(subs.map(s => enviar(s as Subscricao, conteudo)))

  const expiradas = subs.filter((_, i) => estados[i] === 404 || estados[i] === 410).map(s => s.endpoint)
  if (expiradas.length) await admin.from('push_subscriptions').delete().in('endpoint', expiradas)

  const enviados = estados.filter(s => s >= 200 && s < 300).length
  if (enviados > 0) {
    const agora = new Date().toISOString()
    for (const a of alertas) {
      await admin.from('alertas').update({ push_severidade: a.severidade, push_em: agora }).eq('id', a.id)
    }
  }
  console.log(`[send-push-frota] alertas=${alertas.length} subscrições=${subs.length} enviados=${enviados} expiradas=${expiradas.length}`)
  return resposta({ enviados, alertas: alertas.length, subscricoes: subs.length })
})
