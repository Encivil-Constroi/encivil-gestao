// Edge Function: extrair-fatura
// Extrai dados de uma fatura de fornecedor (PDF ou imagem) via Claude Vision.
// Aplica automaticamente regras de classificação aprendidas anteriormente.
//
// Segredos necessários:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY — injectados automaticamente
//   ANTHROPIC_API_KEY — configurar via: supabase secrets set ANTHROPIC_API_KEY=...

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY           = Deno.env.get('SUPABASE_ANON_KEY')!
const ANTHROPIC_API_KEY  = Deno.env.get('ANTHROPIC_API_KEY')!

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const JSON_HEADERS = { ...CORS_HEADERS, 'Content-Type': 'application/json' }

function ok(data: unknown)             { return new Response(JSON.stringify(data),               { status: 200, headers: JSON_HEADERS }) }
function err(msg: string, s = 400)     { return new Response(JSON.stringify({ erro: msg }),       { status: s,   headers: JSON_HEADERS }) }

// Normaliza a descrição para usar no sistema de aprendizagem.
// Remove acentos, pontuação, espaços duplos e converte para minúsculas.
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
  descricao: string
  descricao_norm: string
  quantidade: number | null
  unidade: string | null
  preco_unitario: number | null
  total_linha: number | null
  destino: 'ARMAZEM' | 'OBRA' | 'SERVICO' | 'DESCONHECIDO'
  artigo_id: string | null
  confianca: number | null
  fatura_id: string
}

// Converte ArrayBuffer para base64 em chunks para evitar stack overflow em ficheiros grandes
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
  if (roleErr || !['gestor','admin'].includes(papel as string)) {
    return err('Acesso negado — apenas gestores podem extrair faturas', 403)
  }

  // ── Parsear body ────────────────────────────────────────────────────────────
  const body = await req.json().catch(() => null)
  if (!body?.fatura_id || typeof body.fatura_id !== 'string') {
    return err('fatura_id obrigatório')
  }
  const { fatura_id } = body as { fatura_id: string }

  // ── Cliente com service role (contorna RLS para operações internas) ─────────
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── Buscar fatura ───────────────────────────────────────────────────────────
  const { data: fatura, error: faturaErr } = await admin
    .from('faturas_fornecedor')
    .select('id, fornecedor, ficheiro_path, estado')
    .eq('id', fatura_id)
    .single()

  if (faturaErr || !fatura) return err('Fatura não encontrada', 404)
  if (!['RECEBIDA', 'EXTRAIDA'].includes(fatura.estado)) {
    return err(`Fatura já está no estado ${fatura.estado} — não pode ser re-extraída`, 409)
  }
  if (!fatura.ficheiro_path) return err('Fatura não tem ficheiro associado', 422)

  // ── Verificar se já tem linhas (re-extracção: limpar as anteriores) ─────────
  await admin.from('linhas_fatura').delete().eq('fatura_id', fatura_id)

  // ── Descarregar ficheiro do storage ─────────────────────────────────────────
  const { data: fileData, error: dlErr } = await admin.storage
    .from('faturas-fornecedor')
    .download(fatura.ficheiro_path)

  if (dlErr || !fileData) {
    return err(`Erro ao descarregar ficheiro: ${dlErr?.message ?? 'desconhecido'}`, 500)
  }

  const buffer = await fileData.arrayBuffer()
  const base64 = toBase64(buffer)

  // Determinar tipo de media
  const ext = fatura.ficheiro_path.split('.').pop()?.toLowerCase() ?? 'pdf'
  const isPdf = ext === 'pdf'
  const mediaType = isPdf
    ? 'application/pdf'
    : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'

  // ── Chamar Claude Vision ────────────────────────────────────────────────────
  if (!ANTHROPIC_API_KEY) {
    return err('ANTHROPIC_API_KEY não configurada no servidor', 500)
  }

  const contentBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64 } }
    : { type: 'image',    source: { type: 'base64', media_type: mediaType, data: base64 } }

  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{
        role:    'user',
        content: [
          contentBlock,
          {
            type: 'text',
            text: `Analisa esta fatura de fornecedor e extrai TODOS os dados estruturados.

Retorna APENAS JSON válido com esta estrutura exata (sem texto antes ou depois):
{
  "numero_fatura": "string ou null",
  "fornecedor": "nome completo do fornecedor",
  "data_fatura": "YYYY-MM-DD ou null",
  "total_fatura": número ou null,
  "linhas": [
    {
      "descricao": "descrição completa do item/serviço",
      "quantidade": número ou null,
      "unidade": "un/kg/m/m2/m3/l/cx/saco ou null",
      "preco_unitario": número ou null,
      "total_linha": número ou null
    }
  ]
}

Regras importantes:
- Inclui TODAS as linhas de artigos/serviços (mesmo as de descontos, transportes, IVA)
- Preserva as descrições exatas como aparecem na fatura
- Para quantidades e preços, usa ponto como separador decimal
- Se algum campo não existir na fatura, usa null`,
          },
        ],
      }],
    }),
  })

  if (!claudeRes.ok) {
    const body = await claudeRes.text()
    return err(`Erro na API Claude (${claudeRes.status}): ${body.slice(0, 200)}`, 502)
  }

  const claudeData = await claudeRes.json() as {
    content: Array<{ type: string; text?: string }>
  }

  const rawText = claudeData.content.find(b => b.type === 'text')?.text ?? ''

  // Extrair JSON da resposta (Claude pode incluir texto extra em casos edge)
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return err('Claude não devolveu JSON válido. Resposta: ' + rawText.slice(0, 300), 502)
  }

  let extracted: {
    numero_fatura: string | null
    fornecedor: string
    data_fatura: string | null
    total_fatura: number | null
    linhas: Array<{
      descricao: string
      quantidade: number | null
      unidade: string | null
      preco_unitario: number | null
      total_linha: number | null
    }>
  }

  try {
    extracted = JSON.parse(jsonMatch[0])
  } catch {
    return err('Erro ao parsear JSON do Claude: ' + jsonMatch[0].slice(0, 300), 502)
  }

  if (!Array.isArray(extracted.linhas) || extracted.linhas.length === 0) {
    return err('Nenhuma linha encontrada na fatura', 422)
  }

  // ── Aplicar regras de classificação aprendidas ──────────────────────────────
  const fornecedorFinal = extracted.fornecedor || fatura.fornecedor
  const descrNorms = extracted.linhas.map(l => normalizar(l.descricao))

  const { data: regras } = await admin
    .from('regras_classificacao')
    .select('descricao_norm, destino, artigo_id, confianca')
    .eq('fornecedor', fornecedorFinal)
    .in('descricao_norm', descrNorms)

  const regraMap = new Map(
    (regras ?? []).map((r: { descricao_norm: string; destino: string; artigo_id: string | null; confianca: number }) =>
      [r.descricao_norm, r]
    )
  )

  const linhasParaInserir: LinhaExtraida[] = extracted.linhas.map(l => {
    const norm = normalizar(l.descricao)
    const regra = regraMap.get(norm)
    return {
      fatura_id:     fatura_id,
      descricao:     l.descricao,
      descricao_norm: norm,
      quantidade:    l.quantidade,
      unidade:       l.unidade,
      preco_unitario: l.preco_unitario,
      total_linha:   l.total_linha,
      destino:       (regra?.destino as 'ARMAZEM' | 'OBRA' | 'SERVICO' | 'DESCONHECIDO') ?? 'DESCONHECIDO',
      artigo_id:     regra?.artigo_id ?? null,
      confianca:     regra?.confianca ?? null,
    }
  })

  // ── Persistir linhas e actualizar estado da fatura ──────────────────────────
  const { error: insertErr } = await admin
    .from('linhas_fatura')
    .insert(linhasParaInserir)

  if (insertErr) {
    return err(`Erro ao guardar linhas: ${insertErr.message}`, 500)
  }

  const { error: updateErr } = await admin
    .from('faturas_fornecedor')
    .update({
      estado:        'EXTRAIDA',
      numero_fatura: extracted.numero_fatura,
      total_fatura:  extracted.total_fatura,
      data_fatura:   extracted.data_fatura,
      fornecedor:    fornecedorFinal,
      extraido_em:   new Date().toISOString(),
      updated_at:    new Date().toISOString(),
    })
    .eq('id', fatura_id)

  if (updateErr) {
    return err(`Erro ao actualizar fatura: ${updateErr.message}`, 500)
  }

  const autoClassificadas = linhasParaInserir.filter(l => (l.confianca ?? 0) >= 0.8).length

  return ok({
    ok:                true,
    linhas:            linhasParaInserir.length,
    auto_classificadas: autoClassificadas,
    fornecedor:        fornecedorFinal,
    numero_fatura:     extracted.numero_fatura,
    total_fatura:      extracted.total_fatura,
  })
})
