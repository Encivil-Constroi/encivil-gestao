// deno test --no-lock --node-modules-dir=none --allow-env supabase/functions/
import { assertEquals, assert } from 'jsr:@std/assert@1'

Deno.env.set('SUPABASE_URL', 'https://teste.supabase.co')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'chave-servico')

const servirOriginal = Deno.serve
;(Deno as unknown as { serve: unknown }).serve = () => ({})
const { cifrarPayload, b64urlParaBytes, bytesParaB64url, mensagemNovo, mensagemDecisao } = await import('./index.ts')
type Pedido = Parameters<typeof mensagemNovo>[0]
;(Deno as unknown as { serve: unknown }).serve = servirOriginal

// RFC 8291, secção 5 e anexo A
const RFC = {
  texto:     'When I grow up, I want to be a watermelon',
  auth:      'BTBZMqHH6r4Tts7J_aSIgg',
  uaPublic:  'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  asPublic:  'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  salt:      'DGv6ra1nlYgDCS1FRnbzlw',
  corpo:     'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
             'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
             'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

Deno.test('cifragem reproduz exatamente o exemplo da RFC 8291', async () => {
  const p = b64urlParaBytes(RFC.asPublic)
  const corpo = await cifrarPayload(new TextEncoder().encode(RFC.texto), RFC.uaPublic, RFC.auth, {
    salt: b64urlParaBytes(RFC.salt),
    asPrivateJwk: {
      kty: 'EC', crv: 'P-256', ext: true, d: RFC.asPrivate,
      x: bytesParaB64url(p.slice(1, 33)), y: bytesParaB64url(p.slice(33, 65)),
    },
  })
  assertEquals(bytesParaB64url(corpo), RFC.corpo)
})

const base: Pedido = {
  id: '11111111-2222-3333-4444-555555555555', estado: 'AGUARDA_AUTORIZACAO',
  funcionario_nome: 'Rui Silva', veiculo_nome: 'Carrinha 3', tipo_fonte: 'POLO2', tipo_combustivel: 'gasoleo',
  contador: 123456, km_suspeito: false, motivo_recusa: null, solicitante_id: 'u1',
}

Deno.test('pedido novo: quem, viatura, km, combustível e onde; abre a aprovação desse pedido', () => {
  const m = mensagemNovo(base, 1)
  assertEquals(m.title, '⛽ Pedido de abastecimento')
  assertEquals(m.body, `👷 Rui Silva\n🚐 Carrinha 3 · ${(123456).toLocaleString('pt-PT')} km\n⛽ Gasóleo · Bomba Polo 2`)
  assertEquals(m.url, `/abastecer/pedidos?pedido=${base.id}`)
  assertEquals(m.tag, `abast-${base.id}`)
  assertEquals(m.contagem, 1)
})

Deno.test('pedido novo: contagem no título e aviso de km suspeito', () => {
  const m = mensagemNovo({ ...base, km_suspeito: true, tipo_combustivel: 'gasolina', tipo_fonte: 'POSTO_RUA', contador: null }, 3)
  assertEquals(m.title, '⛽ Pedido de abastecimento (3 à espera)')
  assertEquals(m.body, '👷 Rui Silva\n🚐 Carrinha 3\n⛽ Gasolina · Posto de rua\n⚠️ Km fora do normal — confirme a foto')
  assertEquals(m.contagem, 3)
})

Deno.test('decisão: autorizado diz o passo seguinte de cada fonte e abre o pedido', () => {
  const polo = mensagemDecisao({ ...base, estado: 'AUTORIZADO' })!
  assertEquals(polo.title, '✅ Abastecimento autorizado')
  assert(polo.body.includes('LIGAR BOMBA'))
  assertEquals(polo.url, `/abastecer/pedido/${base.id}`)
  assert(mensagemDecisao({ ...base, estado: 'AUTORIZADO', tipo_fonte: 'POSTO_RUA' })!.body.includes('talão'))
  assert(mensagemDecisao({ ...base, estado: 'AUTORIZADO', tipo_fonte: 'CARRINHA' })!.body.includes('medidor'))
})

Deno.test('decisão: recusado leva o motivo (cortado) ou manda falar com o responsável', () => {
  const r = mensagemDecisao({ ...base, estado: 'REJEITADO', motivo_recusa: '  Já abasteceu hoje  ' })!
  assertEquals(r.title, '❌ Pedido de abastecimento recusado')
  assertEquals(r.body, '🚐 Carrinha 3\nMotivo: Já abasteceu hoje')
  const sem = mensagemDecisao({ ...base, estado: 'REJEITADO' })!
  assertEquals(sem.body, '🚐 Carrinha 3\nFale com o responsável.')
  const longo = mensagemDecisao({ ...base, estado: 'REJEITADO', motivo_recusa: 'x'.repeat(1000) })!
  assert(longo.body.length < 260)
})

Deno.test('decisão: outros estados não notificam', () => {
  for (const estado of ['AGUARDA_AUTORIZACAO', 'CONCLUIDO', 'CANCELADO']) {
    assertEquals(mensagemDecisao({ ...base, estado }), null)
  }
})

Deno.test('a maior mensagem possível cabe num registo cifrado', async () => {
  const m = mensagemNovo({
    ...base, km_suspeito: true, funcionario_nome: 'N'.repeat(120), veiculo_nome: 'V'.repeat(120),
  }, 99)
  const corpo = await cifrarPayload(new TextEncoder().encode(JSON.stringify(m)), RFC.uaPublic, RFC.auth)
  assert(corpo.length < 4096)
})
