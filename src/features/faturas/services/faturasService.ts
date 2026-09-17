import { supabase } from '@/integrations/supabase/client'
import type { FaturaFornecedor, LinhaFatura, EstadoFatura, DestinoLinha } from '@/app/types'

// ── Row types ─────────────────────────────────────────────────────────────────
// Declarados manualmente até os tipos serem regenerados após migration F6.

type LinhaRow = {
  id: string
  fatura_id: string
  descricao: string
  descricao_norm: string | null
  quantidade: number | null
  unidade: string | null
  preco_unitario: number | null
  total_linha: number | null
  destino: DestinoLinha
  artigo_id: string | null
  confianca: number | null
  lancado: boolean
  movimento_id: string | null
  created_at: string
  produtos?: { nome: string } | null
}

type FaturaRow = {
  id: string
  numero_fatura: string | null
  fornecedor: string
  data_fatura: string | null
  data_recepcao: string
  total_fatura: number | null
  estado: EstadoFatura
  ficheiro_path: string | null
  obra_id: string | null
  observacoes: string | null
  extraido_em: string | null
  classificado_em: string | null
  lancado_em: string | null
  criado_por: string | null
  created_at: string
  updated_at: string
  obras?: { nome: string } | null
  linhas_fatura?: LinhaRow[]
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function toLinha(row: LinhaRow): LinhaFatura {
  return {
    id:           row.id,
    faturaId:     row.fatura_id,
    descricao:    row.descricao,
    descricaoNorm: row.descricao_norm ?? undefined,
    quantidade:   row.quantidade    ?? undefined,
    unidade:      row.unidade       ?? undefined,
    precoUnitario: row.preco_unitario != null ? Number(row.preco_unitario) : undefined,
    totalLinha:   row.total_linha   != null ? Number(row.total_linha)   : undefined,
    destino:      row.destino,
    artigoId:     row.artigo_id     ?? undefined,
    artigoNome:   row.produtos?.nome ?? undefined,
    confianca:    row.confianca     != null ? Number(row.confianca)     : undefined,
    lancado:      row.lancado,
    movimentoId:  row.movimento_id  ?? undefined,
  }
}

function toFatura(row: FaturaRow): FaturaFornecedor {
  return {
    id:             row.id,
    numeroFatura:   row.numero_fatura   ?? undefined,
    fornecedor:     row.fornecedor,
    dataFatura:     row.data_fatura     ? new Date(row.data_fatura)    : undefined,
    dataRecepcao:   new Date(row.data_recepcao),
    totalFatura:    row.total_fatura    != null ? Number(row.total_fatura) : undefined,
    estado:         row.estado,
    ficheiroPatch:  row.ficheiro_path   ?? undefined,
    obraId:         row.obra_id         ?? undefined,
    obraNome:       row.obras?.nome     ?? undefined,
    observacoes:    row.observacoes     ?? undefined,
    linhas:         (row.linhas_fatura ?? []).map(toLinha),
    extraidoEm:     row.extraido_em     ? new Date(row.extraido_em)    : undefined,
    classificadoEm: row.classificado_em ? new Date(row.classificado_em): undefined,
    lancadoEm:      row.lancado_em      ? new Date(row.lancado_em)     : undefined,
    criadoPor:      row.criado_por      ?? undefined,
    createdAt:      new Date(row.created_at),
    updatedAt:      new Date(row.updated_at),
  }
}

// ── Queries ───────────────────────────────────────────────────────────────────

const SELECT_LIST   = '*, obras(nome)'
const SELECT_DETAIL = '*, obras(nome), linhas_fatura(*, produtos(nome))'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as any

// ── Filtros ───────────────────────────────────────────────────────────────────

export type FiltrosFaturas = {
  estado?:     EstadoFatura
  obraId?:     string
  fornecedor?: string
}

// ── Service ───────────────────────────────────────────────────────────────────

export async function listarFaturas(filtros: FiltrosFaturas = {}): Promise<FaturaFornecedor[]> {
  let query = db
    .from('faturas_fornecedor')
    .select(SELECT_LIST)
    .order('created_at', { ascending: false })
  if (filtros.estado)     query = query.eq('estado', filtros.estado)
  if (filtros.obraId)     query = query.eq('obra_id', filtros.obraId)
  if (filtros.fornecedor) query = query.ilike('fornecedor', `%${filtros.fornecedor}%`)
  const { data, error } = await query
  if (error) throw error
  return (data as FaturaRow[]).map(toFatura)
}

export async function buscarFatura(id: string): Promise<FaturaFornecedor> {
  const { data, error } = await db
    .from('faturas_fornecedor')
    .select(SELECT_DETAIL)
    .eq('id', id)
    .single()
  if (error) throw error
  const fatura = toFatura(data as FaturaRow)

  // Gerar URL assinada (5 minutos) para visualização do PDF/imagem
  if (fatura.ficheiroPatch) {
    const { data: urlData } = await supabase.storage
      .from('faturas-fornecedor')
      .createSignedUrl(fatura.ficheiroPatch, 300)
    if (urlData?.signedUrl) fatura.ficheiroUrl = urlData.signedUrl
  }
  return fatura
}

export type NovaFatura = {
  fornecedor:   string
  obraId?:      string
  observacoes?: string
  file:         File
}

export async function criarFatura(input: NovaFatura): Promise<FaturaFornecedor> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  // Upload do ficheiro para storage
  const ext  = input.file.name.split('.').pop() ?? 'pdf'
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from('faturas-fornecedor')
    .upload(path, input.file, { contentType: input.file.type })
  if (uploadErr) throw uploadErr

  const { data, error } = await db
    .from('faturas_fornecedor')
    .insert({
      fornecedor:    input.fornecedor,
      obra_id:       input.obraId    ?? null,
      observacoes:   input.observacoes ?? null,
      ficheiro_path: path,
      criado_por:    user.id,
    })
    .select(SELECT_LIST)
    .single()

  if (error) {
    // Limpar ficheiro em caso de falha na BD
    await supabase.storage.from('faturas-fornecedor').remove([path])
    throw error
  }
  return toFatura(data as FaturaRow)
}

export type ExtrairFaturaResult = {
  linhas:             number
  auto_classificadas: number
  fornecedor:         string
  numero_fatura:      string | null
  total_fatura:       number | null
}

export async function extrairFatura(id: string): Promise<ExtrairFaturaResult> {
  const { data: sessionData } = await supabase.auth.getSession()
  const jwt = sessionData.session?.access_token
  if (!jwt) throw new Error('Não autenticado')

  const supabaseUrl = (import.meta as unknown as { env: Record<string, string> }).env.VITE_SUPABASE_URL

  const res = await fetch(`${supabaseUrl}/functions/v1/extrair-fatura`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${jwt}`,
    },
    body: JSON.stringify({ fatura_id: id }),
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(
      (body as { erro?: string }).erro ?? `Erro ${res.status} ao extrair fatura`
    )
  }
  return body as ExtrairFaturaResult
}

export type ClassificarLinhaInput = {
  id:         string
  destino:    DestinoLinha
  artigo_id?: string
  confianca:  number
}

export async function classificarFatura(
  id:     string,
  linhas: ClassificarLinhaInput[]
): Promise<void> {
  const { error } = await db.rpc('classificar_e_aprender', {
    p_fatura_id: id,
    p_linhas:    linhas,
  })
  if (error) throw error
}

export async function lancarFatura(id: string, responsavel: string): Promise<void> {
  const { error } = await db.rpc('lancar_fatura', {
    p_fatura_id:   id,
    p_responsavel: responsavel,
  })
  if (error) throw error
}

export async function eliminarFatura(id: string): Promise<void> {
  // Só faturas no estado RECEBIDA podem ser eliminadas (forçado pela RLS)
  const { data } = await db
    .from('faturas_fornecedor')
    .select('ficheiro_path')
    .eq('id', id)
    .single()

  const { error } = await db.from('faturas_fornecedor').delete().eq('id', id)
  if (error) throw error

  // Limpar ficheiro do storage após eliminar o registo
  const path = (data as { ficheiro_path: string | null } | null)?.ficheiro_path
  if (path) await supabase.storage.from('faturas-fornecedor').remove([path])
}
