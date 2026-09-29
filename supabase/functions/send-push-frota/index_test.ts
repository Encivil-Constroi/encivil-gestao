// deno test --no-lock --node-modules-dir=none --allow-env supabase/functions/
import { assertEquals, assert } from 'jsr:@std/assert@1'

Deno.env.set('SUPABASE_URL', 'https://teste.supabase.co')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'chave-servico')

const servirOriginal = Deno.serve
;(Deno as unknown as { serve: unknown }).serve = () => ({})
const {
  cifrarPayload, b64urlParaBytes, bytesParaB64url, precisaNotificar, textoPrazo, montarMensagem,
} = await import('./index.ts')
type Bytes = Uint8Array<ArrayBuffer>
;(Deno as unknown as { serve: unknown }).serve = servirOriginal

// RFC 8291, secção 5 e anexo A — o resultado tem de ser byte a byte o da norma
const RFC = {
  texto:     'When I grow up, I want to be a watermelon',
  auth:      'BTBZMqHH6r4Tts7J_aSIgg',
  uaPublic:  'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  asPublic:  'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  salt:      'DGv6ra1nlYgDCS1FRnbzlw',
  corpo:     'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
             'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
             'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

function jwkPrivado(publico: string, privado: string): JsonWebKey {
  const p = b64urlParaBytes(publico)
  return {
    kty: 'EC', crv: 'P-256', ext: true, d: privado,
    x: bytesParaB64url(p.slice(1, 33)), y: bytesParaB64url(p.slice(33, 65)),
  }
}

Deno.test('cifragem reproduz exatamente o exemplo da RFC 8291', async () => {
  const corpo = await cifrarPayload(new TextEncoder().encode(RFC.texto), RFC.uaPublic, RFC.auth, {
    salt: b64urlParaBytes(RFC.salt), asPrivateJwk: jwkPrivado(RFC.asPublic, RFC.asPrivate),
  })
  assertEquals(bytesParaB64url(corpo), RFC.corpo)
})

// Decifra como o browser faria (lado do recetor), a partir da chave privada
// do recetor da RFC — prova a cifragem real (salt e chave aleatórios)
async function decifrar(corpo: Bytes): Promise<string> {
  const salt = corpo.slice(0, 16)
  const idlen = corpo[20]
  const asPublic = corpo.slice(21, 21 + idlen)
  const cifrado = corpo.slice(21 + idlen)
  const uaPublic = b64urlParaBytes(RFC.uaPublic)
  const uaPriv = await crypto.subtle.importKey('jwk', jwkPrivado(RFC.uaPublic, RFC.uaPrivate),
    { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
  const asChave = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asChave }, uaPriv, 256))
  const t = (s: string) => new TextEncoder().encode(s)
  const cat = (...p: Bytes[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length } return o }
  const hk = async (s: Bytes, k: Bytes, info: Bytes, n: number) => new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: s, info }, await crypto.subtle.importKey('raw', k, 'HKDF', false, ['deriveBits']), n * 8))
  const ikm = await hk(b64urlParaBytes(RFC.auth), ecdh, cat(t('WebPush: info\0'), uaPublic, asPublic), 32)
  const cek = await hk(salt, ikm, t('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hk(salt, ikm, t('Content-Encoding: nonce\0'), 12)
  const claro = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce },
    await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), cifrado))
  assertEquals(claro[claro.length - 1], 2)   // delimitador do último registo
  return new TextDecoder().decode(claro.slice(0, -1))
}

Deno.test('cifragem real (chave e salt aleatórios) é decifrável pelo recetor', async () => {
  const msg = JSON.stringify(montarMensagem([
    { id: '1', severidade: 'URGENTE', push_severidade: null, valor_atual: 3, valor_limiar: null, veiculo: 'Carrinha 2', item: 'Seguro (validade)' },
  ]))
  const a = await cifrarPayload(new TextEncoder().encode(msg), RFC.uaPublic, RFC.auth)
  const b = await cifrarPayload(new TextEncoder().encode(msg), RFC.uaPublic, RFC.auth)
  assert(bytesParaB64url(a) !== bytesParaB64url(b), 'cada envio usa salt e chave novos')
  assertEquals(await decifrar(a), msg)
  assertEquals(await decifrar(b), msg)
})

Deno.test('notifica uma vez, e de novo só ao passar a urgente', () => {
  assertEquals(precisaNotificar({ severidade: 'ATENCAO', push_severidade: null }), true)
  assertEquals(precisaNotificar({ severidade: 'URGENTE', push_severidade: null }), true)
  assertEquals(precisaNotificar({ severidade: 'ATENCAO', push_severidade: 'ATENCAO' }), false)
  assertEquals(precisaNotificar({ severidade: 'URGENTE', push_severidade: 'ATENCAO' }), true)
  assertEquals(precisaNotificar({ severidade: 'URGENTE', push_severidade: 'URGENTE' }), false)
  assertEquals(precisaNotificar({ severidade: 'ATENCAO', push_severidade: 'URGENTE' }), false)
})

Deno.test('texto do prazo: km e dias, antes e depois do prazo', () => {
  assertEquals(textoPrazo({ valor_atual: 400, valor_limiar: 10000 }), 'faltam 400 km')
  assertEquals(textoPrazo({ valor_atual: -150, valor_limiar: 10000 }), 'passou 150 km do prazo')
  assertEquals(textoPrazo({ valor_atual: 0, valor_limiar: 10000 }), 'chegou ao prazo')
  assertEquals(textoPrazo({ valor_atual: 5, valor_limiar: null }), 'vence em 5 dias')
  assertEquals(textoPrazo({ valor_atual: 1, valor_limiar: null }), 'vence amanhã')
  assertEquals(textoPrazo({ valor_atual: 0, valor_limiar: null }), 'vence hoje')
  assertEquals(textoPrazo({ valor_atual: -1, valor_limiar: null }), 'atrasado 1 dia')
  assertEquals(textoPrazo({ valor_atual: -12, valor_limiar: null }), 'atrasado 12 dias')
})

Deno.test('mensagem: urgentes primeiro, título com contagem, abre a Frota', () => {
  const m = montarMensagem([
    { id: '1', severidade: 'ATENCAO', push_severidade: null, valor_atual: 20, valor_limiar: null, veiculo: 'Carrinha 1', item: 'IPO' },
    { id: '2', severidade: 'URGENTE', push_severidade: null, valor_atual: 300, valor_limiar: 9000, veiculo: 'Carrinha 3', item: 'Óleo' },
  ])
  assertEquals(m.title, 'Frota · 2 alertas (1 urgente)')
  assertEquals(m.body, 'Carrinha 3 — Óleo: faltam 300 km\nCarrinha 1 — IPO: vence em 20 dias')
  assertEquals(m.url, '/frota')
  assertEquals(m.tag, 'frota')
  const um = montarMensagem([
    { id: '3', severidade: 'ATENCAO', push_severidade: null, valor_atual: 9, valor_limiar: null, veiculo: 'C', item: 'I' },
  ])
  assertEquals(um.title, 'Frota · Atenção')
  assertEquals(um.body, 'C — I: vence em 9 dias')
})

Deno.test('mensagem longa é cortada para caber no registo cifrado', async () => {
  const muitos = Array.from({ length: 60 }, (_, i) => ({
    id: String(i), severidade: 'ATENCAO' as const, push_severidade: null, valor_atual: i, valor_limiar: null,
    veiculo: `Carrinha ${i}`, item: 'Inspeção Periódica Obrigatória (IPO)',
  }))
  const m = montarMensagem(muitos)
  assert(m.body.length <= 300)
  assert(m.body.endsWith('…'))
  const corpo = await cifrarPayload(new TextEncoder().encode(JSON.stringify(m)), RFC.uaPublic, RFC.auth)
  assert(corpo.length < 4096)
})
