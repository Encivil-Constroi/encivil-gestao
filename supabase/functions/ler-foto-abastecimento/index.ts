// Edge Function: ler-foto-abastecimento
// Recebe URL de uma foto (medidor de Polo2/Carrinha ou talão de posto de rua)
// e usa Gemini 2.0 Flash para extrair litros e custo total.
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
// Alias mantido pela Google a apontar para o Flash atual (o gemini-2.0-flash foi
// descontinuado). Segredo GEMINI_MODEL permite fixar outro sem mexer no código.
const GEMINI_MODEL      = Deno.env.get('GEMINI_MODEL') || 'gemini-flash-latest'
const GEMINI_URL        = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

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

  const { data: pedido, error: pedErr } = await supabase
    .from('comb_abastecimentos_pendentes')
    .select('id')
    .eq('id', pedidoId)
    .eq('veiculo_id', veiculoId)
    .eq('estado', 'AUTORIZADO')
    .maybeSingle()
  if (pedErr) return err('Erro ao validar o pedido', 500)
  if (!pedido) return err('Pedido não autorizado', 403)

  // redirect: 'error' — o URL foi validado; não seguir para outro destino
  const imgRes = await fetch(foto_url, { redirect: 'error' }).catch(() => null)
  if (!imgRes?.ok) return err('Não foi possível descarregar a foto', 422)
  if (Number(imgRes.headers.get('content-length') ?? 0) > MAX_BYTES) return err('Foto demasiado grande', 413)

  const buffer = await imgRes.arrayBuffer()
  if (buffer.byteLength > MAX_BYTES) return err('Foto demasiado grande', 413)
  const base64   = toBase64(buffer)
  const mimeType = MIME_GEMINI[ext]

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
    const detalhe = `modelo ${GEMINI_MODEL}: ${(await geminiRes.text()).slice(0, 300)}`
    if (geminiRes.status === 429) return err('Limite Gemini atingido. Tenta novamente.', 429, detalhe)
    return err(`Erro Gemini (${geminiRes.status})`, 502, detalhe)
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
