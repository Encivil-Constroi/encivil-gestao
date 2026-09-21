// Edge Function: ler-foto-abastecimento
// Recebe URL de uma foto (medidor de Polo2/Carrinha ou talão de posto de rua)
// e usa Gemini 2.0 Flash para extrair litros e custo total.
// Chamada pela página pública após o motorista tirar a foto.
//
// Body: { foto_url: string, tipo_fonte: 'POLO2' | 'CARRINHA' | 'POSTO_RUA' }
// Resposta: { litros: number | null, custo_total: number | null, confianca: 'alta' | 'media' | 'baixa' }

const GOOGLE_AI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY')!
const GEMINI_MODEL      = 'gemini-2.0-flash'
const GEMINI_URL        = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const JSON_H = { ...CORS, 'Content-Type': 'application/json' }

function ok(data: unknown)         { return new Response(JSON.stringify(data),          { status: 200, headers: JSON_H }) }
function err(msg: string, s = 400) { return new Response(JSON.stringify({ erro: msg }), { status: s,   headers: JSON_H }) }

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

  const body = await req.json().catch(() => null)
  if (!body?.foto_url || !body?.tipo_fonte) return err('foto_url e tipo_fonte obrigatórios')

  const { foto_url, tipo_fonte } = body as { foto_url: string; tipo_fonte: string }

  if (!['POLO2', 'CARRINHA', 'POSTO_RUA'].includes(tipo_fonte)) {
    return err('tipo_fonte inválido')
  }

  if (!GOOGLE_AI_API_KEY) return err('GOOGLE_AI_API_KEY não configurada', 500)

  // Descarregar a foto para base64
  const imgRes = await fetch(foto_url).catch(() => null)
  if (!imgRes?.ok) return err('Não foi possível descarregar a foto', 422)

  const buffer   = await imgRes.arrayBuffer()
  const base64   = toBase64(buffer)
  const ct       = imgRes.headers.get('content-type') ?? 'image/jpeg'
  const mimeType = ct.includes('png') ? 'image/png'
                 : ct.includes('webp') ? 'image/webp'
                 : 'image/jpeg'

  const geminiRes = await fetch(`${GEMINI_URL}?key=${GOOGLE_AI_API_KEY}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: base64 } },
          { text: promptParaTipo(tipo_fonte) },
        ],
      }],
      generationConfig: {
        temperature:        0.1,
        maxOutputTokens:    256,
        response_mime_type: 'application/json',
      },
    }),
  })

  if (!geminiRes.ok) {
    if (geminiRes.status === 429) return err('Limite Gemini atingido. Tenta novamente.', 429)
    return err(`Erro Gemini (${geminiRes.status})`, 502)
  }

  const geminiData = await geminiRes.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }

  const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
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
