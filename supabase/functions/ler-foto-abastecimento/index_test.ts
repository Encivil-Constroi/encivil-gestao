// deno test --no-lock --node-modules-dir=none --allow-env supabase/functions/
// (sufixo _test.ts: é apanhado pelo Deno e ignorado pelo Vitest)
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'

Deno.env.set('SUPABASE_URL', 'https://teste.supabase.co')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'chave-servico')
Deno.env.set('GOOGLE_AI_API_KEY', 'chave-google')

// Importar a função sem arrancar o servidor HTTP
const servirOriginal = Deno.serve
;(Deno as unknown as { serve: unknown }).serve = () => ({})
const { chamarGemini, TENTATIVAS, linhaTempos, lerCaminho, recusaAcesso, promptParaLeitura, interpretarResposta } = await import('./index.ts')
;(Deno as unknown as { serve: unknown }).serve = servirOriginal

type Resposta = number | 'rede'

function geminiFalsa(respostas: Resposta[]) {
  const chamadas: string[] = []
  const fetchFn = ((url: string | URL | Request) => {
    chamadas.push(String(url))
    const r = respostas.shift()
    if (r === 'rede' || r === undefined) return Promise.reject(new Error('sem rede'))
    return Promise.resolve(new Response(r === 200 ? '{"candidates":[]}' : `{"error":${r}}`, { status: r }))
  }) as typeof fetch
  const esperas: number[] = []
  const dormir = (ms: number) => { esperas.push(ms); return Promise.resolve() }
  return { fetchFn, dormir, chamadas, esperas }
}

const modelo = (url: string) => url.match(/models\/([^:]+):/)?.[1]

Deno.test('modelos por omissão: Flash-Lite (rápido) e reserva Flash', () => {
  assertEquals(TENTATIVAS.map(t => t.modelo), ['gemini-flash-lite-latest', 'gemini-flash-lite-latest', 'gemini-flash-latest'])
})

Deno.test('sucesso à primeira: uma só chamada', async () => {
  const g = geminiFalsa([200])
  const r = await chamarGemini('{}', g)
  assertEquals(r.ok, true)
  assertEquals(g.chamadas.length, 1)
  assertEquals(g.esperas, [])
  assertStringIncludes(g.chamadas[0], 'key=chave-google')
})

Deno.test('503 (sobrecarga) e depois 200: repete no mesmo modelo', async () => {
  const g = geminiFalsa([503, 200])
  const r = await chamarGemini('{}', g)
  assertEquals(r.ok, true)
  assertEquals(g.chamadas.map(modelo), ['gemini-flash-lite-latest', 'gemini-flash-lite-latest'])
  assertEquals(g.esperas, [1_000])
})

Deno.test('503 duas vezes: a 3.ª tentativa usa o modelo de reserva', async () => {
  const g = geminiFalsa([503, 503, 200])
  const r = await chamarGemini('{}', g)
  assertEquals(r.ok, true)
  assertEquals(g.chamadas.map(modelo), ['gemini-flash-lite-latest', 'gemini-flash-lite-latest', 'gemini-flash-latest'])
  if (r.ok) assertEquals(r.modelo, 'gemini-flash-latest')
})

Deno.test('tudo em sobrecarga: falha com o detalhe das 3 tentativas', async () => {
  const g = geminiFalsa([503, 503, 503])
  const r = await chamarGemini('{}', g)
  assertEquals(r.ok, false)
  if (!r.ok) {
    assertEquals(r.status, 503)
    assertEquals(r.detalhe.split(' | ').length, 3)
  }
  assertEquals(g.esperas, [1_000, 1_000])
})

Deno.test('429 (limite) também é temporário', async () => {
  const g = geminiFalsa([429, 200])
  assertEquals((await chamarGemini('{}', g)).ok, true)
})

Deno.test('erro de rede é temporário', async () => {
  const g = geminiFalsa(['rede', 200])
  assertEquals((await chamarGemini('{}', g)).ok, true)
  assertEquals(g.chamadas.length, 2)
})

Deno.test('400 (pedido inválido / chave errada): não repete', async () => {
  const g = geminiFalsa([400, 200])
  const r = await chamarGemini('{}', g)
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.status, 400)
  assertEquals(g.chamadas.length, 1)
})

Deno.test('404 (modelo inexistente): salta as repetições desse modelo e vai à reserva', async () => {
  const g = geminiFalsa([404, 200])
  const r = await chamarGemini('{}', g)
  assertEquals(r.ok, true)
  assertEquals(g.chamadas.map(modelo), ['gemini-flash-lite-latest', 'gemini-flash-latest'])
})

Deno.test('conta as tentativas feitas (sucesso e falha)', async () => {
  assertEquals((await chamarGemini('{}', geminiFalsa([200]))).tentativas, 1)
  assertEquals((await chamarGemini('{}', geminiFalsa([503, 503, 200]))).tentativas, 3)
  assertEquals((await chamarGemini('{}', geminiFalsa([503, 503, 503]))).tentativas, 3)
  assertEquals((await chamarGemini('{}', geminiFalsa([400]))).tentativas, 1)
})

Deno.test('modelo inexistente saltado não conta como tentativa', async () => {
  const r = await chamarGemini('{}', { ...geminiFalsa([404, 200]) })
  assertEquals(r.ok, true)
  assertEquals(r.tentativas, 2)
})

Deno.test('linha de tempos nos Logs', () => {
  assertEquals(
    linhaTempos({ pedidoMs: 40, downloadMs: 900, bytes: 3_145_728, geminiMs: 7_200, modelo: 'gemini-flash-lite-latest', tentativas: 2, totalMs: 8_150 }),
    '[ler-foto] tempos total=8150ms pedido=40ms download=900ms (3072 KB) gemini=7200ms modelo=gemini-flash-lite-latest tentativas=2',
  )
})

const V = '11111111-1111-1111-1111-111111111111'
const P = '22222222-2222-2222-2222-222222222222'
const EU = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const OUTRO = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

Deno.test('caminho da foto: só o formato do bucket, sem .. nem URL', () => {
  assertEquals(lerCaminho(`${V}/2026-09-30_${P}_1727600000000.jpg`), { veiculoId: V, pedidoId: P, mime: 'image/jpeg' })
  assertEquals(lerCaminho(`${V}/2026-09-30_${P}_1.heic`)?.mime, 'image/heic')
  for (const mau of [
    `https://x.supabase.co/storage/v1/object/public/combustivel-taloes/${V}/2026-09-30_${P}_1.jpg`,
    `${V}/../2026-09-30_${P}_1.jpg`, `${V}/2026-09-30_${P}_1.html`, `${V}/2026-09-30_${P}_1.jpg?x=1`,
    'qualquer.jpg', 42, null, undefined,
  ]) assertEquals(lerCaminho(mau), null, String(mau))
})

Deno.test('acesso: foto dos km antes de o pedido existir, ou do próprio pedido', () => {
  assertEquals(recusaAcesso(null, EU, 'KM', V), null)
  assertEquals(recusaAcesso({ solicitante_id: EU, veiculo_id: V, estado: 'AGUARDA_AUTORIZACAO' }, EU, 'KM', V), null)
  assertEquals(recusaAcesso({ solicitante_id: OUTRO, veiculo_id: V, estado: 'AGUARDA_AUTORIZACAO' }, EU, 'KM', V), 'Pedido de outra pessoa')
  assertEquals(recusaAcesso({ solicitante_id: EU, veiculo_id: OUTRO, estado: 'AGUARDA_AUTORIZACAO' }, EU, 'KM', V), 'Pedido de outra pessoa')
})

Deno.test('acesso: contador, medidor e talão só no próprio pedido autorizado', () => {
  for (const l of ['CONTADOR', 'MEDIDOR', 'TALAO'] as const) {
    assertEquals(recusaAcesso({ solicitante_id: EU, veiculo_id: V, estado: 'AUTORIZADO' }, EU, l, V), null)
    assertEquals(recusaAcesso(null, EU, l, V), 'Pedido não encontrado')
    assertEquals(recusaAcesso({ solicitante_id: OUTRO, veiculo_id: V, estado: 'AUTORIZADO' }, EU, l, V), 'Pedido não encontrado')
    assertEquals(recusaAcesso({ solicitante_id: EU, veiculo_id: OUTRO, estado: 'AUTORIZADO' }, EU, l, V), 'Pedido não encontrado')
    assertEquals(recusaAcesso({ solicitante_id: null, veiculo_id: V, estado: 'AUTORIZADO' }, EU, l, V), 'Pedido não encontrado')
    for (const estado of ['AGUARDA_AUTORIZACAO', 'CONCLUIDO', 'REJEITADO', 'CANCELADO']) {
      assertEquals(recusaAcesso({ solicitante_id: EU, veiculo_id: V, estado }, EU, l, V), 'Pedido não autorizado')
    }
  }
})

Deno.test('prompt certo para cada leitura', () => {
  assertStringIncludes(promptParaLeitura('KM'), 'odómetro')
  assertStringIncludes(promptParaLeitura('CONTADOR'), 'totalizador')
  assertStringIncludes(promptParaLeitura('MEDIDOR'), 'carrinha')
  assertStringIncludes(promptParaLeitura('TALAO'), 'euros')
})

Deno.test('resposta da Gemini: valor, custo só no talão, km inteiro, confiança baixa sem valor', () => {
  assertEquals(interpretarResposta('{"valor": 12345.4, "custo_total": 9, "confianca": "alta"}', 'KM'),
    { valor: 12345, custo_total: null, confianca: 'alta' })
  assertEquals(interpretarResposta('```json\n{"valor": 1042.75, "confianca": "media"}\n```', 'CONTADOR'),
    { valor: 1042.75, custo_total: null, confianca: 'media' })
  assertEquals(interpretarResposta('Aqui está: {"litros": 40.5, "custo_total": 72.9, "confianca": "alta"} fim', 'TALAO'),
    { valor: 40.5, custo_total: 72.9, confianca: 'alta' })
  assertEquals(interpretarResposta('{"valor": "1 042,5", "confianca": "alta"}', 'CONTADOR')?.valor, 1042.5)
  assertEquals(interpretarResposta('{"valor": null, "confianca": "alta"}', 'MEDIDOR'),
    { valor: null, custo_total: null, confianca: 'baixa' })
  assertEquals(interpretarResposta('{"valor": -3, "confianca": "alta"}', 'MEDIDOR')?.valor, null)
  assertEquals(interpretarResposta('{"valor": 5, "confianca": "certeza"}', 'MEDIDOR')?.confianca, 'baixa')
  assertEquals(interpretarResposta('sem json', 'KM'), null)
})
