// Edge Function: ler-foto-abastecimento
// Recebe URL de uma foto (medidor de Polo2/Carrinha ou talão de posto de rua)
// e usa a Gemini (Flash) para extrair litros e custo total.
// Chamada pela página pública após o motorista tirar a foto.
//
// Body: { foto_url: string, tipo_fonte: 'POLO2' | 'CARRINHA' | 'POSTO_RUA' }
// Resposta: { litros: number | null, custo_total: number | null, confianca: 'alta' | 'media' | 'baixa' }
//
// Segurança: é chamada sem login (página do motorista). Só aceita fotos do bucket
// combustivel-taloes cujo nome aponte para um pedido AUTORIZADO dessa viatura —
// sem isto qualquer pessoa usava a chave da Gemini e o servidor como proxy (SSRF).

import { createClient } from 'jsr:@supabase/supabase-js@2'

const GOOGLE_AI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY')!
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// Aliases mantidos pela Google a apontar para os modelos atuais (o gemini-2.0-flash
// foi descontinuado). Segredos GEMINI_MODEL / GEMINI_MODEL_RESERVA permitem fixar outros.
const GEMINI_MODEL   = Deno.env.get('GEMINI_MODEL') || 'gemini-flash-latest'
const MODELO_RESERVA = Deno.env.get('GEMINI_MODEL_RESERVA') || 'gemini-flash-lite-latest'
const urlModelo = (m: string) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`

// Sobrecarga da Google (503 "high demand") é frequente e passageira: o motorista
// não pode cair no manual por azar. 3.ª tentativa noutro modelo (outra capacidade).
export const TENTATIVAS = [
  { modelo: GEMINI_MODEL,   esperaMs: 0 },
  { modelo: GEMINI_MODEL,   esperaMs: 1_500 },
  { modelo: MODELO_RESERVA, esperaMs: 1_500 },
]
const TRANSITORIOS = new Set([0, 429, 500, 502, 503, 504])  // 0 = sem resposta (rede)

export type ResultadoGemini =
  | { ok: true;  res: Response; modelo: string; tentativas: number }
  | { ok: false; status: number; detalhe: string; tentativas: number }

export async function chamarGemini(
  corpo: string,
  {
    fetchFn    = fetch,
    dormir     = (ms: number) => new Promise<void>(r => setTimeout(r, ms)),
    tentativas = TENTATIVAS,
    chave      = GOOGLE_AI_API_KEY,
  }: {
    fetchFn?:    typeof fetch
    dormir?:     (ms: number) => Promise<void>
    tentativas?: { modelo: string; esperaMs: number }[]
    chave?:      string
  } = {},
): Promise<ResultadoGemini> {
  let status = 0
  const detalhes: string[] = []
  const inexistentes = new Set<string>()
  let feitas = 0

  for (const t of tentativas) {
    if (inexistentes.has(t.modelo)) continue
    if (t.esperaMs) await dormir(t.esperaMs)
    feitas++

    const res = await fetchFn(`${urlModelo(t.modelo)}?key=${chave}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    corpo,
    }).catch(() => null)

    if (res?.ok) return { ok: true, res, modelo: t.modelo, tentativas: feitas }

    status = res?.status ?? 0
    detalhes.push(`${t.modelo} ${status}: ${res ? (await res.text()).slice(0, 200) : 'sem resposta'}`)

    // 404 = modelo não existe: passa ao seguinte sem o repetir
    if (status === 404) { inexistentes.add(t.modelo); continue }
    // Outros 4xx (pedido inválido, chave errada) não se resolvem a repetir
    if (!TRANSITORIOS.has(status)) break
  }
  return { ok: false, status, detalhe: detalhes.join(' | '), tentativas: feitas }
}

// Uma linha por leitura nos Logs, para medir onde vai o tempo (foto grande a
// descarregar vs. Gemini lenta vs. novas tentativas)
export function linhaTempos(t: {
  pedidoMs: number; downloadMs: number; bytes: number; geminiMs: number
  modelo: string; tentativas: number; totalMs: number
}): string {
  return `[ler-foto] tempos total=${t.totalMs}ms pedido=${t.pedidoMs}ms `
    + `download=${t.downloadMs}ms (${Math.round(t.bytes / 1024)} KB) `
    + `gemini=${t.geminiMs}ms modelo=${t.modelo} tentativas=${t.tentativas}`
}

const PREFIXO_FOTOS = `${SUPABASE_URL}/storage/v1/object/public/combustivel-taloes/`
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
// Mesmo formato da política de upload (public.foto_abastecimento_valida)
const NOME_FOTO = new RegExp(`^(${UUID})/[0-9]{4}-[0-9]{2}-[0-9]{2}_(${UUID})_[0-9]{1,16}\\.(jpg|png|webp|heic|heif)$`)
const MAX_BYTES = 10 * 1024 * 1024  // limite do bucket

const MIME_GEMINI: Record<string, string> = {
  jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// supabase.functions.invoke envia authorization/apikey/x-client-info: sem os
// declarar aqui o preflight do browser falhava e a leitura nunca chegava a correr
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const JSON_H = { ...CORS, 'Content-Type': 'application/json' }

function ok(data: unknown)         { return new Response(JSON.stringify(data),          { status: 200, headers: JSON_H }) }
// Toda a recusa fica nos Logs da função — sem isto uma falha era invisível
function err(msg: string, s = 400, detalhe = '') {
  console.error(`[ler-foto] ${s} ${msg}${detalhe ? ` — ${detalhe}` : ''}`)
  return new Response(JSON.stringify({ erro: msg }), { status: s, headers: JSON_H })
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  let binary  = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)))
  }
  return btoa(binary)
}

function promptParaTipo(tipo: string): string {
  if (tipo === 'POLO2' || tipo === 'CARRINHA') {
    return [
      'Esta é uma foto do contador/medidor de um depósito de combustível.',
      'Extrai a quantidade de litros dispensada/abastecida.',
      'Retorna JSON exacto:',
      '{ "litros": número com 1-3 casas decimais ou null, "custo_total": null, "confianca": "alta" | "media" | "baixa" }',
      'Confiança "alta": número claramente visível.',
      'Confiança "media": número parcialmente visível ou difícil de ler.',
      'Confiança "baixa": imagem pouco clara.',
      'Se não conseguires ler os litros, coloca litros: null e confianca: "baixa".',
    ].join('\n')
  }
  // POSTO_RUA — talão de combustível
  return [
    'Este é um talão/recibo de abastecimento num posto de combustível.',
    'Extrai os litros abastecidos e o custo total em euros.',
    'Retorna JSON exacto:',
    '{ "litros": número com 1-3 casas decimais ou null, "custo_total": número com 2 casas decimais ou null, "confianca": "alta" | "media" | "baixa" }',
    'Confiança "alta": todos os valores claramente visíveis.',
    'Confiança "media": valores parcialmente visíveis.',
    'Confiança "baixa": imagem pouco clara ou valores ilegíveis.',
    'Se não conseguires ler algum valor, coloca null nesse campo.',
  ].join('\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return err('Método não permitido', 405)
  const t0 = performance.now()
  const ms = (desde: number) => Math.round(performance.now() - desde)

  const body = await req.json().catch(() => null)
  if (!body?.foto_url || !body?.tipo_fonte) return err('foto_url e tipo_fonte obrigatórios')

  const { foto_url, tipo_fonte } = body as { foto_url: string; tipo_fonte: string }

  if (!['POLO2', 'CARRINHA', 'POSTO_RUA'].includes(tipo_fonte)) {
    return err('tipo_fonte inválido')
  }

  if (!GOOGLE_AI_API_KEY) return err('GOOGLE_AI_API_KEY não configurada', 500)

  if (typeof foto_url !== 'string' || !foto_url.startsWith(PREFIXO_FOTOS)) {
    return err('foto_url inválida', 400)
  }
  const nome = NOME_FOTO.exec(foto_url.slice(PREFIXO_FOTOS.length))
  if (!nome) return err('foto_url inválida', 400)
  const [, veiculoId, pedidoId, ext] = nome

  const tPedido = performance.now()
  const { data: pedido, error: pedErr } = await supabase
    .from('comb_abastecimentos_pendentes')
    .select('id')
    .eq('id', pedidoId)
    .eq('veiculo_id', veiculoId)
    .eq('estado', 'AUTORIZADO')
    .maybeSingle()
  if (pedErr) return err('Erro ao validar o pedido', 500)
  if (!pedido) return err('Pedido não autorizado', 403)
  const pedidoMs = ms(tPedido)

  // redirect: 'error' — o URL foi validado; não seguir para outro destino
  const tDownload = performance.now()
  const imgRes = await fetch(foto_url, { redirect: 'error' }).catch(() => null)
  if (!imgRes?.ok) return err('Não foi possível descarregar a foto', 422)
  if (Number(imgRes.headers.get('content-length') ?? 0) > MAX_BYTES) return err('Foto demasiado grande', 413)

  const buffer = await imgRes.arrayBuffer()
  if (buffer.byteLength > MAX_BYTES) return err('Foto demasiado grande', 413)
  const downloadMs = ms(tDownload)
  const base64   = toBase64(buffer)
  const mimeType = MIME_GEMINI[ext]

  const tGemini = performance.now()
  const gemini = await chamarGemini(JSON.stringify({
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: base64 } },
        { text: promptParaTipo(tipo_fonte) },
      ],
    }],
    generationConfig: {
      temperature:        0.1,
      // Os modelos Flash atuais "pensam" e esse raciocínio conta para este limite:
      // com 256 a resposta chegava vazia/cortada. O JSON final é pequeno.
      maxOutputTokens:    4096,
      response_mime_type: 'application/json',
    },
  }))

  const geminiMs = ms(tGemini)

  if (!gemini.ok) {
    console.log(linhaTempos({
      pedidoMs, downloadMs, bytes: buffer.byteLength, geminiMs,
      modelo: 'falhou', tentativas: gemini.tentativas, totalMs: ms(t0),
    }))
    if (gemini.status === 429) return err('Limite Gemini atingido. Tenta novamente.', 429, gemini.detalhe)
    return err(`Erro Gemini (${gemini.status})`, 502, gemini.detalhe)
  }

  console.log(linhaTempos({
    pedidoMs, downloadMs, bytes: buffer.byteLength, geminiMs,
    modelo: gemini.modelo, tentativas: gemini.tentativas, totalMs: ms(t0),
  }))

  const geminiData = await gemini.res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>
  }

  // Só as partes de texto da resposta (não as de raciocínio, se o modelo as devolver)
  const rawText = (geminiData.candidates?.[0]?.content?.parts ?? [])
    .filter(p => !p.thought && typeof p.text === 'string')
    .map(p => p.text)
    .join('')
  const jsonStr = rawText.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim()

  let result: { litros: number | null; custo_total: number | null; confianca: string }
  try {
    result = JSON.parse(jsonStr)
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/)
    if (!match) return err('Gemini não devolveu JSON válido', 502)
    try { result = JSON.parse(match[0]) }
    catch { return err('Erro ao parsear resposta Gemini', 502) }
  }

  return ok({
    litros:      result.litros      ?? null,
    custo_total: result.custo_total ?? null,
    confianca:   result.confianca   ?? 'baixa',
  })
})
