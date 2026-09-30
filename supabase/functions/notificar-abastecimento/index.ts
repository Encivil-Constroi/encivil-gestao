// Edge Function: notificar-abastecimento
// Notificação imediata do abastecimento, no telemóvel (PWA, incluindo iPhone):
//   NOVO    → a quem aprova (comb_aprovadores; sem nenhum designado, os admins)
//   DECISAO → ao motorista que pediu (autorizado ou recusado, com o motivo)
//
// Chamada pelo trigger trg_notificar_abastecimento (migration 20260930010000)
// via pg_net, com o cabeçalho x-segredo. O segredo é gerado no próprio banco e
// confirmado com abastecimento_push_autorizado() — nada para copiar para o Dashboard.
//
// O texto segue cifrado conforme a RFC 8291 (aes128gcm). O código de cifra é
// o mesmo do send-push-frota, repetido aqui porque cada função é publicada
// pelo Dashboard só com o seu index.ts; os testes validam as duas contra a RFC.
//
// Segredos: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (os mesmos da frota).

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT     = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:gestao@encivil.pt'

// WebCrypto só aceita bytes sobre ArrayBuffer (não SharedArrayBuffer)
export type Bytes = Uint8Array<ArrayBuffer>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

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
export type Pedido = {
  id: string
  estado: string
  funcionario_nome: string | null
  veiculo_nome: string | null
  tipo_fonte: string
  tipo_combustivel: string | null
  contador: number | null
  km_suspeito: boolean | null
  motivo_recusa: string | null
  solicitante_id: string | null
}

export type Mensagem = { title: string; body: string; url: string; tag: string; contagem?: number }

const FONTE: Record<string, string> = { POLO2: 'Bomba Polo 2', CARRINHA: 'Carrinha', POSTO_RUA: 'Posto de rua' }
const COMBUSTIVEL: Record<string, string> = { gasoleo: 'Gasóleo', gasolina: 'Gasolina' }

const km = (n: number | null) => n == null ? null : `${Math.round(Number(n)).toLocaleString('pt-PT')} km`

export function mensagemNovo(p: Pedido, aguardam: number): Mensagem {
  const linhas = [
    `👷 ${p.funcionario_nome ?? 'Motorista'}`,
    `🚐 ${p.veiculo_nome ?? 'Viatura'}${p.contador != null ? ` · ${km(p.contador)}` : ''}`,
    `⛽ ${COMBUSTIVEL[p.tipo_combustivel ?? ''] ?? 'Combustível'} · ${FONTE[p.tipo_fonte] ?? p.tipo_fonte}`,
  ]
  if (p.km_suspeito) linhas.push('⚠️ Km fora do normal — confirme a foto')
  return {
    title: aguardam > 1 ? `⛽ Pedido de abastecimento (${aguardam} à espera)` : '⛽ Pedido de abastecimento',
    body:  linhas.join('\n'),
    url:   `/abastecer/pedidos?pedido=${p.id}`,
    tag:   `abast-${p.id}`,
    contagem: aguardam,
  }
}

export function mensagemDecisao(p: Pedido): Mensagem | null {
  const url = `/abastecer/pedido/${p.id}`
  const tag = `abast-${p.id}`
  if (p.estado === 'AUTORIZADO') {
    const passo = p.tipo_fonte === 'POLO2'
      ? 'Vá à bomba, fotografe o contador e carregue em LIGAR BOMBA.'
      : p.tipo_fonte === 'POSTO_RUA'
        ? 'Pode abastecer no posto. No fim, fotografe o talão.'
        : 'Pode abastecer na carrinha. No fim, fotografe o medidor.'
    return { title: '✅ Abastecimento autorizado', body: `🚐 ${p.veiculo_nome ?? 'Viatura'}\n${passo}`, url, tag }
  }
  if (p.estado === 'REJEITADO') {
    const motivo = p.motivo_recusa?.trim()
    return {
      title: '❌ Pedido de abastecimento recusado',
      body:  `🚐 ${p.veiculo_nome ?? 'Viatura'}\n${motivo ? `Motivo: ${motivo.slice(0, 200)}` : 'Fale com o responsável.'}`,
      url, tag,
    }
  }
  return null
}

// ── VAPID (RFC 8292) ──────────────────────────────────────────────────────────
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
        // Um pedido parado há mais de 1 h já não interessa como alerta
        'TTL': '3600',
        'Urgency': 'high',
        'Topic': 'abastecimento',
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
  if (status >= 400) console.error(`[notificar-abastecimento] ${status} ${JSON.stringify(dados)}`)
  return new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json' } })
}

const SELECT_PEDIDO =
  'id, estado, funcionario_nome, veiculo_nome, tipo_fonte, tipo_combustivel, contador, km_suspeito, motivo_recusa, solicitante_id'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return resposta({ erro: 'Método não permitido' }, 405)
  const segredo = req.headers.get('x-segredo')
  if (!segredo) return resposta({ erro: 'Não autorizado' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: autorizado, error: autErr } = await admin.rpc('abastecimento_push_autorizado', { p_segredo: segredo })
  if (autErr) return resposta({ erro: 'Falha ao validar o pedido', detalhe: autErr.message }, 500)
  if (autorizado !== true) return resposta({ erro: 'Não autorizado' }, 401)
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return resposta({ erro: 'VAPID não configurado' }, 500)

  const body = await req.json().catch(() => null) as { evento?: unknown; pedido_id?: unknown } | null
  const evento = body?.evento
  const pedidoId = typeof body?.pedido_id === 'string' ? body.pedido_id : ''
  if ((evento !== 'NOVO' && evento !== 'DECISAO') || !UUID_RE.test(pedidoId)) {
    return resposta({ erro: 'evento e pedido_id obrigatórios' }, 400)
  }

  const { data: pedido, error: pedErr } = await admin
    .from('comb_abastecimentos_pendentes').select(SELECT_PEDIDO).eq('id', pedidoId).maybeSingle()
  if (pedErr) return resposta({ erro: 'Falha ao ler o pedido', detalhe: pedErr.message }, 500)
  if (!pedido) return resposta({ erro: 'Pedido inexistente' }, 404)
  const p = pedido as Pedido

  let destinatarios: string[] = []
  let mensagem: Mensagem | null = null

  if (evento === 'NOVO') {
    // Só uma vez por pedido, e só enquanto ainda aguarda decisão
    const { data: marcado, error: mErr } = await admin
      .from('comb_abastecimentos_pendentes')
      .update({ push_notificado_em: new Date().toISOString() })
      .eq('id', p.id).eq('estado', 'AGUARDA_AUTORIZACAO').is('push_notificado_em', null)
      .select('id')
    if (mErr) return resposta({ erro: 'Falha ao marcar o pedido', detalhe: mErr.message }, 500)
    if (!marcado?.length) return resposta({ enviados: 0, motivo: 'já notificado ou já decidido' })

    const { data: designados, error: dErr } = await admin.from('comb_aprovadores').select('user_id')
    if (dErr) return resposta({ erro: 'Falha ao ler aprovadores', detalhe: dErr.message }, 500)
    destinatarios = (designados ?? []).map(d => d.user_id as string)
    if (!destinatarios.length) {
      const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin')
      destinatarios = (admins ?? []).map(a => a.id as string)
    }

    const { count } = await admin
      .from('comb_abastecimentos_pendentes')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'AGUARDA_AUTORIZACAO')
    mensagem = mensagemNovo(p, count ?? 1)
  } else {
    mensagem = mensagemDecisao(p)
    if (!mensagem) return resposta({ enviados: 0, motivo: `estado ${p.estado} sem notificação` })
    if (p.solicitante_id) destinatarios = [p.solicitante_id]
    await admin.from('comb_abastecimentos_pendentes')
      .update({ notificado_decisao_em: new Date().toISOString() }).eq('id', p.id)
  }

  // Quem pede não recebe o seu próprio pedido (ex.: o António a abastecer)
  if (evento === 'NOVO') destinatarios = destinatarios.filter(id => id !== p.solicitante_id)
  if (!destinatarios.length) return resposta({ enviados: 0, motivo: 'sem destinatários' })

  const { data: subs } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth').in('user_id', destinatarios)
  if (!subs?.length) return resposta({ enviados: 0, motivo: 'destinatários sem notificações ativas' })

  const conteudo = texto(JSON.stringify(mensagem))
  const estados = await Promise.all(subs.map(s => enviar(s as Subscricao, conteudo)))

  const expiradas = subs.filter((_, i) => estados[i] === 404 || estados[i] === 410).map(s => s.endpoint)
  if (expiradas.length) await admin.from('push_subscriptions').delete().in('endpoint', expiradas)

  const enviados = estados.filter(s => s >= 200 && s < 300).length
  console.log(`[notificar-abastecimento] evento=${evento} pedido=${p.id} subscrições=${subs.length} enviados=${enviados} expiradas=${expiradas.length}`)
  return resposta({ enviados, subscricoes: subs.length })
})
