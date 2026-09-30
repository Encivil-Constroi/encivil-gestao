// Edge Function: ler-foto-abastecimento
// Lê uma foto do abastecimento com a Gemini e devolve o número para o
// motorista confirmar (se falhar, a app pede o valor à mão).
//
// Body: { foto_path: string, leitura: 'KM' | 'CONTADOR' | 'MEDIDOR' | 'TALAO' }
//   KM       — conta-quilómetros da viatura (antes de pedir)
//   CONTADOR — contador da bomba Polo 2 (litros acumulados; início e fim)
//   MEDIDOR  — medidor da carrinha (litros abastecidos)
//   TALAO    — talão do posto (litros e valor)
// Resposta: { valor: number | null, custo_total: number | null, confianca: 'alta' | 'media' | 'baixa' }
//
// Segurança (abastecimento v2, 20260930010000): só com sessão. A foto tem de
// ser do bucket combustivel-taloes, no formato <viatura>/<dia>_<pedido>_<n>.<ext>,
// e o pedido tem de ser do próprio utilizador — AUTORIZADO, ou ainda por criar
// no caso da foto dos km. A foto é lida pelo storage (nunca por um URL vindo
// do browser), portanto não há como usar a função como proxy.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const GOOGLE_AI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY')!
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// Flash-Lite primeiro: ler um número numa foto não precisa de mais, e o Flash
// completo "pensa" e anda sobrecarregado (medido: 21 s em 3 tentativas).
// Segredos GEMINI_MODEL / GEMINI_MODEL_RESERVA permitem fixar outros.
const GEMINI_MODEL   = Deno.env.get('GEMINI_MODEL') || 'gemini-flash-lite-latest'
const MODELO_RESERVA = Deno.env.get('GEMINI_MODEL_RESERVA') || 'gemini-flash-latest'
const urlModelo = (m: string) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`

// Sobrecarga da Google (503 "high demand") é frequente e passageira: o motorista
// não pode cair no manual por azar. 3.ª tentativa noutro modelo (outra capacidade).
export const TENTATIVAS = [
  { modelo: GEMINI_MODEL,   esperaMs: 0 },
  { modelo: GEMINI_MODEL,   esperaMs: 1_000 },
  { modelo: MODELO_RESERVA, esperaMs: 1_000 },
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

export type Leitura = 'KM' | 'CONTADOR' | 'MEDIDOR' | 'TALAO'
export const LEITURAS: readonly Leitura[] = ['KM', 'CONTADOR', 'MEDIDOR', 'TALAO']

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
// Mesmo formato da política de upload (public.foto_combustivel_valida)
const NOME_FOTO = new RegExp(`^(${UUID})/[0-9]{4}-[0-9]{2}-[0-9]{2}_(${UUID})_[0-9]{1,16}\\.(jpg|png|webp|heic|heif)$`)
const MAX_BYTES = 10 * 1024 * 1024  // limite do bucket

const MIME_GEMINI: Record<string, string> = {
  jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
}

export function lerCaminho(path: unknown): { veiculoId: string; pedidoId: string; mime: string } | null {
  if (typeof path !== 'string') return null
  const m = NOME_FOTO.exec(path)
  return m ? { veiculoId: m[1], pedidoId: m[2], mime: MIME_GEMINI[m[3]] } : null
}

type PedidoFoto = { solicitante_id: string | null; veiculo_id: string; estado: string } | null

// null = pode ler; texto = motivo da recusa
export function recusaAcesso(pedido: PedidoFoto, userId: string, leitura: Leitura, veiculoId: string): string | null {
  if (leitura === 'KM') {
    // A foto dos km tira-se antes de o pedido existir
    if (!pedido) return null
    return pedido.solicitante_id === userId && pedido.veiculo_id === veiculoId ? null : 'Pedido de outra pessoa'
  }
  if (!pedido || pedido.solicitante_id !== userId || pedido.veiculo_id !== veiculoId) return 'Pedido não encontrado'
  if (pedido.estado !== 'AUTORIZADO') return 'Pedido não autorizado'
  return null
}

export function promptParaLeitura(leitura: Leitura): string {
  const fim = [
    'Confiança "alta": número claramente visível; "media": parcialmente visível ou difícil de ler; "baixa": imagem pouco clara.',
    'Se não conseguires ler, coloca null e confianca "baixa". Nunca inventes dígitos.',
  ]
  switch (leitura) {
    case 'KM':
      return [
        'Foto do painel de uma viatura. Lê o conta-quilómetros TOTAL (odómetro), não o parcial (trip).',
        'Retorna JSON exacto: { "valor": número inteiro de km ou null, "custo_total": null, "confianca": "alta" | "media" | "baixa" }',
        ...fim,
      ].join('\n')
    case 'CONTADOR':
      return [
        'Foto do contador de uma bomba de combustível (totalizador de litros acumulados).',
        'Lê o número total mostrado no contador, com as casas decimais se forem visíveis.',
        'Retorna JSON exacto: { "valor": número ou null, "custo_total": null, "confianca": "alta" | "media" | "baixa" }',
        ...fim,
      ].join('\n')
    case 'MEDIDOR':
      return [
        'Foto do medidor de um depósito de combustível numa carrinha.',
        'Lê a quantidade de litros dispensada/abastecida.',
        'Retorna JSON exacto: { "valor": litros com 1-3 casas decimais ou null, "custo_total": null, "confianca": "alta" | "media" | "baixa" }',
        ...fim,
      ].join('\n')
    case 'TALAO':
      return [
        'Talão/recibo de abastecimento num posto de combustível.',
        'Lê os litros abastecidos e o valor total pago em euros.',
        'Retorna JSON exacto: { "valor": litros com 1-3 casas decimais ou null, "custo_total": euros com 2 casas decimais ou null, "confianca": "alta" | "media" | "baixa" }',
        ...fim,
      ].join('\n')
  }
}

const numeroOuNull = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(/\s/g, '').replace(',', '.')) : v
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null
}

// Texto da Gemini → resposta; tolera ```json e texto à volta do objeto
export function interpretarResposta(rawText: string, leitura: Leitura):
  { valor: number | null; custo_total: number | null; confianca: 'alta' | 'media' | 'baixa' } | null {
  const limpo = rawText.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim()
  let r: Record<string, unknown> | null = null
  try { r = JSON.parse(limpo) } catch {
    const m = rawText.match(/\{[\s\S]*\}/)
    if (m) { try { r = JSON.parse(m[0]) } catch { r = null } }
  }
  if (!r || typeof r !== 'object') return null
  // Modelos por vezes respondem com "litros" (formato antigo) em vez de "valor"
  let valor = numeroOuNull(r.valor ?? r.litros)
  if (leitura === 'KM' && valor != null) valor = Math.round(valor)
  const custo = leitura === 'TALAO' ? numeroOuNull(r.custo_total) : null
  const conf = r.confianca === 'alta' || r.confianca === 'media' ? r.confianca : 'baixa'
  return { valor, custo_total: custo, confianca: valor == null ? 'baixa' : conf }
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return err('Método não permitido', 405)
  const t0 = performance.now()
  const ms = (desde: number) => Math.round(performance.now() - desde)

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!token) return err('Sessão obrigatória', 401)
  const { data: sessao, error: sessErr } = await supabase.auth.getUser(token)
  if (sessErr || !sessao?.user) return err('Sessão inválida', 401)
  const userId = sessao.user.id

  const body = await req.json().catch(() => null) as { foto_path?: unknown; leitura?: unknown } | null
  const leitura = body?.leitura as Leitura
  if (!LEITURAS.includes(leitura)) return err('leitura inválida')
  const foto = lerCaminho(body?.foto_path)
  if (!foto) return err('foto_path inválido')

  if (!GOOGLE_AI_API_KEY) return err('GOOGLE_AI_API_KEY não configurada', 500)

  const tPedido = performance.now()
  const { data: pedido, error: pedErr } = await supabase
    .from('comb_abastecimentos_pendentes')
    .select('solicitante_id, veiculo_id, estado')
    .eq('id', foto.pedidoId)
    .maybeSingle()
  if (pedErr) return err('Erro ao validar o pedido', 500, pedErr.message)
  const recusa = recusaAcesso(pedido as PedidoFoto, userId, leitura, foto.veiculoId)
  if (recusa) return err(recusa, 403)
  const pedidoMs = ms(tPedido)

  const tDownload = performance.now()
  const { data: blob, error: dlErr } = await supabase.storage.from('combustivel-taloes').download(body!.foto_path as string)
  if (dlErr || !blob) return err('Não foi possível descarregar a foto', 422, dlErr?.message)
  if (blob.size > MAX_BYTES) return err('Foto demasiado grande', 413)
  const buffer = await blob.arrayBuffer()
  const downloadMs = ms(tDownload)

  const tGemini = performance.now()
  const gemini = await chamarGemini(JSON.stringify({
    contents: [{
      parts: [
        { inline_data: { mime_type: foto.mime, data: toBase64(buffer) } },
        { text: promptParaLeitura(leitura) },
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

  console.log(linhaTempos({
    pedidoMs, downloadMs, bytes: buffer.byteLength, geminiMs,
    modelo: gemini.ok ? gemini.modelo : 'falhou', tentativas: gemini.tentativas, totalMs: ms(t0),
  }))

  if (!gemini.ok) {
    if (gemini.status === 429) return err('Limite Gemini atingido. Tenta novamente.', 429, gemini.detalhe)
    return err(`Erro Gemini (${gemini.status})`, 502, gemini.detalhe)
  }

  const geminiData = await gemini.res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>
  }
  // Só as partes de texto da resposta (não as de raciocínio, se o modelo as devolver)
  const rawText = (geminiData.candidates?.[0]?.content?.parts ?? [])
    .filter(p => !p.thought && typeof p.text === 'string')
    .map(p => p.text)
    .join('')

  const resultado = interpretarResposta(rawText, leitura)
  if (!resultado) return err('Gemini não devolveu JSON válido', 502, rawText.slice(0, 200))
  return ok(resultado)
})
