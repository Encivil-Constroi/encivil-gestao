// Edge Function: extrair-fatura
// Extrai dados de uma fatura de fornecedor (PDF ou imagem) via Google Gemini 2.0 Flash.
// Aplica automaticamente regras de classificação aprendidas anteriormente.
//
// Segredos necessários:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY — injectados automaticamente
//   GOOGLE_AI_API_KEY — obter grátis em https://aistudio.google.com/apikey
//                       configurar via: supabase secrets set GOOGLE_AI_API_KEY=AIza...

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY          = Deno.env.get('SUPABASE_ANON_KEY')!
const GOOGLE_AI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY')!

// Modelo gratuito: gemini-2.0-flash — 15 RPM, 1 M tokens/dia sem custo
const GEMINI_MODEL = 'gemini-2.0-flash'
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const JSON_HEADERS = { ...CORS_HEADERS, 'Content-Type': 'application/json' }

function ok(data: unknown)         { return new Response(JSON.stringify(data),             { status: 200, headers: JSON_HEADERS }) }
function err(msg: string, s = 400) { return new Response(JSON.stringify({ erro: msg }),    { status: s,   headers: JSON_HEADERS }) }

// Normaliza a descrição para o sistema de aprendizagem:
// minúsculas, sem acentos, sem pontuação, sem espaços duplos.
function normalizar(desc: string): string {
  return desc
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

type LinhaExtraida = {
  fatura_id:     string
  descricao:     string
  descricao_norm: string
  quantidade:    number | null
  unidade:       string | null
  preco_unitario: number | null
  total_linha:   number | null
  destino:       'ARMAZEM' | 'OBRA' | 'SERVICO' | 'DESCONHECIDO'
  artigo_id:     string | null
  confianca:     number | null
}

type FaturaExtraida = {
  numero_fatura: string | null
  fornecedor:    string
  data_fatura:   string | null
  total_fatura:  number | null
  linhas: Array<{
    descricao:     string
    quantidade:    number | null
    unidade:       string | null
    preco_unitario: number | null
    total_linha:   number | null
  }>
}

// Converte ArrayBuffer para base64 em chunks (evita stack overflow em ficheiros grandes)
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)))
  }
  return btoa(binary)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST')    return err('Método não permitido', 405)

  // ── Verificar autenticação ──────────────────────────────────────────────────
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!jwt) return err('Não autenticado', 401)

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: papel, error: roleErr } = await userClient.rpc('auth_role')
  if (roleErr || !['gestor', 'admin'].includes(papel as string)) {
    return err('Acesso negado — apenas gestores podem extrair faturas', 403)
  }

  // ── Parsear body ────────────────────────────────────────────────────────────
  const body = await req.json().catch(() => null)
  if (!body?.fatura_id || typeof body.fatura_id !== 'string') {
    return err('fatura_id obrigatório')
  }
  const { fatura_id } = body as { fatura_id: string }

  // ── Cliente service role (contorna RLS para operações internas) ─────────────
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── Buscar fatura ───────────────────────────────────────────────────────────
  const { data: fatura, error: faturaErr } = await admin
    .from('faturas_fornecedor')
    .select('id, fornecedor, ficheiro_path, estado')
    .eq('id', fatura_id)
    .single()

  if (faturaErr || !fatura)                         return err('Fatura não encontrada', 404)
  if (!['RECEBIDA', 'EXTRAIDA'].includes(fatura.estado)) {
    return err(`Fatura já está em estado ${fatura.estado} — não pode ser re-extraída`, 409)
  }
  if (!fatura.ficheiro_path) return err('Fatura sem ficheiro associado', 422)

  // Limpar linhas anteriores em caso de re-extracção
  await admin.from('linhas_fatura').delete().eq('fatura_id', fatura_id)

  // ── Descarregar ficheiro do storage ─────────────────────────────────────────
  const { data: fileData, error: dlErr } = await admin.storage
    .from('faturas-fornecedor')
    .download(fatura.ficheiro_path)

  if (dlErr || !fileData) {
    return err(`Erro ao descarregar ficheiro: ${dlErr?.message ?? 'desconhecido'}`, 500)
  }

  const buffer    = await fileData.arrayBuffer()
  const base64    = toBase64(buffer)
  const ext       = fatura.ficheiro_path.split('.').pop()?.toLowerCase() ?? 'pdf'
  const mimeType  = ext === 'pdf'  ? 'application/pdf'
                  : ext === 'png'  ? 'image/png'
                  : ext === 'webp' ? 'image/webp'
                  : 'image/jpeg'

  // ── Chamar Gemini 2.0 Flash ─────────────────────────────────────────────────
  if (!GOOGLE_AI_API_KEY) {
    return err('GOOGLE_AI_API_KEY não configurada. Ver: supabase secrets set GOOGLE_AI_API_KEY=...', 500)
  }

  const geminiRes = await fetch(`${GEMINI_URL}?key=${GOOGLE_AI_API_KEY}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          {
            // Gemini aceita PDFs e imagens com inline_data
            inline_data: { mime_type: mimeType, data: base64 },
          },
          {
            text: [
              'Analisa esta fatura de fornecedor e extrai TODOS os dados.',
              'Retorna JSON com esta estrutura exata:',
              '{',
              '  "numero_fatura": "string ou null",',
              '  "fornecedor": "nome completo do fornecedor",',
              '  "data_fatura": "YYYY-MM-DD ou null",',
              '  "total_fatura": número ou null,',
              '  "linhas": [',
              '    {',
              '      "descricao": "descrição completa do item/serviço",',
              '      "quantidade": número ou null,',
              '      "unidade": "un/kg/m/m2/m3/l/cx/saco ou null",',
              '      "preco_unitario": número ou null,',
              '      "total_linha": número ou null',
              '    }',
              '  ]',
              '}',
              '',
              'Regras:',
              '- Inclui TODAS as linhas (artigos, serviços, descontos, transporte, IVA)',
              '- Preserva as descrições exatas como aparecem no documento',
              '- Quantidades e preços com ponto como separador decimal',
              '- Campos inexistentes devem ser null',
            ].join('\n'),
          },
        ],
      }],
      generationConfig: {
        temperature:      0.1,       // resposta determinística
        maxOutputTokens:  4096,
        response_mime_type: 'application/json',  // garante JSON válido na saída
      },
    }),
  })

  if (!geminiRes.ok) {
    const errBody = await geminiRes.text()
    // Tratar limite de taxa graciosamente
    if (geminiRes.status === 429) {
      return err('Limite de pedidos Gemini atingido (15/min). Tenta novamente em 1 minuto.', 429)
    }
    return err(`Erro na API Gemini (${geminiRes.status}): ${errBody.slice(0, 300)}`, 502)
  }

  const geminiData = await geminiRes.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    error?: { message?: string }
  }

  if (geminiData.error) {
    return err(`Gemini devolveu erro: ${geminiData.error.message ?? 'desconhecido'}`, 502)
  }

  const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  if (!rawText) {
    return err('Gemini não devolveu conteúdo. Verifica se o ficheiro está legível.', 502)
  }

  // Com response_mime_type=application/json, o texto já é JSON válido.
  // Por segurança extra, tentamos extrair um bloco JSON caso venha com markdown.
  const jsonStr = rawText.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim()

  let extracted: FaturaExtraida
  try {
    extracted = JSON.parse(jsonStr)
  } catch {
    // Fallback: tentar extrair { ... } do texto
    const match = rawText.match(/\{[\s\S]*\}/)
    if (!match) return err('Gemini não devolveu JSON válido. Resposta: ' + rawText.slice(0, 300), 502)
    try {
      extracted = JSON.parse(match[0])
    } catch {
      return err('Erro ao parsear JSON da Gemini.', 502)
    }
  }

  if (!Array.isArray(extracted.linhas) || extracted.linhas.length === 0) {
    return err('Nenhuma linha encontrada na fatura. Verifica se o documento é uma fatura válida.', 422)
  }

  // ── Aplicar regras de classificação aprendidas ──────────────────────────────
  const fornecedorFinal = (extracted.fornecedor || fatura.fornecedor).trim()
  const descrNorms      = extracted.linhas.map(l => normalizar(l.descricao))

  const { data: regras } = await admin
    .from('regras_classificacao')
    .select('descricao_norm, destino, artigo_id, confianca')
    .eq('fornecedor', fornecedorFinal)
    .in('descricao_norm', descrNorms)

  const regraMap = new Map(
    (regras ?? []).map((r: {
      descricao_norm: string
      destino: string
      artigo_id: string | null
      confianca: number
    }) => [r.descricao_norm, r])
  )

  const linhasParaInserir: LinhaExtraida[] = extracted.linhas.map(l => {
    const norm  = normalizar(l.descricao)
    const regra = regraMap.get(norm)
    return {
      fatura_id,
      descricao:      l.descricao,
      descricao_norm: norm,
      quantidade:     l.quantidade,
      unidade:        l.unidade,
      preco_unitario: l.preco_unitario,
      total_linha:    l.total_linha,
      destino:        (regra?.destino as LinhaExtraida['destino']) ?? 'DESCONHECIDO',
      artigo_id:      regra?.artigo_id ?? null,
      confianca:      regra?.confianca ?? null,
    }
  })

  // ── Persistir linhas + actualizar fatura ────────────────────────────────────
  const { error: insertErr } = await admin.from('linhas_fatura').insert(linhasParaInserir)
  if (insertErr) return err(`Erro ao guardar linhas: ${insertErr.message}`, 500)

  const { error: updateErr } = await admin
    .from('faturas_fornecedor')
    .update({
      estado:        'EXTRAIDA',
      numero_fatura: extracted.numero_fatura ?? null,
      total_fatura:  extracted.total_fatura  ?? null,
      data_fatura:   extracted.data_fatura   ?? null,
      fornecedor:    fornecedorFinal,
      extraido_em:   new Date().toISOString(),
      updated_at:    new Date().toISOString(),
    })
    .eq('id', fatura_id)

  if (updateErr) return err(`Erro ao actualizar fatura: ${updateErr.message}`, 500)

  const autoClassificadas = linhasParaInserir.filter(l => (l.confianca ?? 0) >= 0.8).length

  return ok({
    ok:                 true,
    linhas:             linhasParaInserir.length,
    auto_classificadas: autoClassificadas,
    fornecedor:         fornecedorFinal,
    numero_fatura:      extracted.numero_fatura,
    total_fatura:       extracted.total_fatura,
  })
})
