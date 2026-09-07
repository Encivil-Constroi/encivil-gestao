import { supabase } from '@/integrations/supabase/client'
import type { TablesUpdate } from '@/integrations/supabase/types'
import type { Subcontractor, SubcontractItem, ContractType } from '@/app/types'

type ArtigoRow = {
  id: string
  subempreiteiro_id: string
  descricao: string
  unidade: string
  preco_unitario: number
  quantidade_prevista: number
  is_extra: boolean
}

type SubRow = {
  id: string
  obra_id: string
  nome: string
  contacto_responsavel: string | null
  tipo: ContractType
  valor_global: number | null
  percentagem_retencao: number
  condicoes: string | null
  estado: 'rascunho' | 'validado'
  created_at: string
  updated_at: string
  validado_em: string | null
  obras?: { nome: string } | null
  subempreiteiro_artigos?: ArtigoRow[]
}

function toItem(row: ArtigoRow): SubcontractItem {
  return {
    id: row.id,
    subcontractorId: row.subempreiteiro_id,
    description: row.descricao,
    unit: row.unidade,
    unitPrice: Number(row.preco_unitario),
    plannedQuantity: Number(row.quantidade_prevista),
    isExtra: row.is_extra,
  }
}

function toSubcontractor(row: SubRow): Subcontractor {
  const items = (row.subempreiteiro_artigos ?? []).map(toItem)
  const agreedValue = row.tipo === 'global'
    ? Number(row.valor_global ?? 0)
    : items.reduce((sum, i) => sum + i.unitPrice * i.plannedQuantity, 0)

  return {
    id: row.id,
    obraId: row.obra_id,
    obraName: row.obras?.nome ?? undefined,
    name: row.nome,
    contact: row.contacto_responsavel ?? undefined,
    type: row.tipo,
    globalValue: row.valor_global ?? undefined,
    conditions: row.condicoes ?? undefined,
    status: row.estado,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    validatedAt: row.validado_em ? new Date(row.validado_em) : undefined,
    items: items.sort((a, b) => Number(a.isExtra) - Number(b.isExtra)),
    agreedValue,
    retencaoPercentagem: Number(row.percentagem_retencao ?? 0),
  }
}

const SELECT = '*, obras(nome), subempreiteiro_artigos(*)'

export async function listarSubempreiteiros(obraId?: string): Promise<Subcontractor[]> {
  let query = supabase.from('subempreiteiros').select(SELECT).order('created_at', { ascending: false })
  if (obraId) query = query.eq('obra_id', obraId)
  const { data, error } = await query
  if (error) throw error
  return (data as unknown as SubRow[]).map(toSubcontractor)
}

export async function buscarSubempreiteiro(id: string): Promise<Subcontractor> {
  const { data, error } = await supabase.from('subempreiteiros').select(SELECT).eq('id', id).single()
  if (error) throw error
  return toSubcontractor(data as unknown as SubRow)
}

export type SubcontractorComExecutado = Subcontractor & { executed: number }

// Lista subempreiteiros já com o executado (soma dos autos validados de cada
// um) — numa única query extra aos autos. Com obraId filtra por obra (Ficha de
// Obra); sem obraId devolve todos (dashboard e relatório de obras).
export async function listarSubempreiteirosComExecutado(obraId?: string): Promise<SubcontractorComExecutado[]> {
  const subs = await listarSubempreiteiros(obraId)
  if (!subs.length) return []

  const ids = subs.map(s => s.id)
  const { data, error } = await supabase
    .from('autos_medicao')
    .select('subempreiteiro_id, valor_periodo, estado')
    .in('subempreiteiro_id', ids)
    .eq('estado', 'validado')
  if (error) throw error

  const exec: Record<string, number> = {}
  ;(data as { subempreiteiro_id: string; valor_periodo: number }[]).forEach(r => {
    exec[r.subempreiteiro_id] = (exec[r.subempreiteiro_id] ?? 0) + Number(r.valor_periodo)
  })

  return subs.map(s => ({ ...s, executed: exec[s.id] ?? 0 }))
}

export type ItemInput = {
  description: string
  unit: string
  unitPrice: number
  plannedQuantity: number
  isExtra?: boolean
}

export type NovoSubempreiteiro = {
  obraId: string
  name: string
  contact?: string
  type: ContractType
  globalValue?: number
  conditions?: string
  retencaoPercentagem?: number
  items?: ItemInput[]
}

export async function criarSubempreiteiro(input: NovoSubempreiteiro): Promise<Subcontractor> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data, error } = await db
    .from('subempreiteiros')
    .insert({
      obra_id: input.obraId,
      nome: input.name,
      contacto_responsavel: input.contact ?? null,
      tipo: input.type,
      valor_global: input.type === 'global' ? (input.globalValue ?? null) : null,
      condicoes: input.conditions ?? null,
      percentagem_retencao: input.retencaoPercentagem ?? 0,
    })
    .select('id')
    .single()
  if (error) throw error

  const id = (data as { id: string }).id
  if (input.type === 'unitario' && input.items?.length) {
    await substituirArtigos(id, input.items)
  }
  return buscarSubempreiteiro(id)
}

export type AtualizarSubempreiteiro = Partial<NovoSubempreiteiro>

export async function atualizarSubempreiteiro(id: string, input: AtualizarSubempreiteiro): Promise<Subcontractor> {
  const update: Record<string, unknown> = {}
  if (input.obraId !== undefined)     update.obra_id = input.obraId
  if (input.name !== undefined)       update.nome = input.name
  if (input.contact !== undefined)    update.contacto_responsavel = input.contact || null
  if (input.type !== undefined)       update.tipo = input.type
  if (input.conditions !== undefined) update.condicoes = input.conditions || null
  if (input.type !== undefined || input.globalValue !== undefined) {
    update.valor_global = input.type === 'global' ? (input.globalValue ?? null) : null
  }
  if (input.retencaoPercentagem !== undefined) {
    update.percentagem_retencao = input.retencaoPercentagem
  }

  const { error } = await supabase.from('subempreiteiros').update(update as TablesUpdate<'subempreiteiros'>).eq('id', id)
  if (error) throw error

  if (input.items !== undefined) {
    await substituirArtigos(id, input.type === 'unitario' ? input.items : [])
  }
  return buscarSubempreiteiro(id)
}

// Substitui a lista de artigos (apaga os antigos e insere os novos). Simples e
// seguro enquanto a contratação está em rascunho — que é a única altura em que
// a RLS permite escrever nestes registos.
async function substituirArtigos(subId: string, items: ItemInput[]): Promise<void> {
  const { error: delError } = await supabase
    .from('subempreiteiro_artigos')
    .delete()
    .eq('subempreiteiro_id', subId)
  if (delError) throw delError

  if (!items.length) return
  const { error: insError } = await supabase
    .from('subempreiteiro_artigos')
    .insert(items.map(i => ({
      subempreiteiro_id: subId,
      descricao: i.description,
      unidade: i.unit,
      preco_unitario: i.unitPrice,
      quantidade_prevista: i.plannedQuantity,
      is_extra: i.isExtra ?? false,
    })))
  if (insError) throw insError
}

export async function eliminarSubempreiteiro(id: string): Promise<void> {
  const { error } = await supabase.from('subempreiteiros').delete().eq('id', id)
  if (error) throw error
}

export async function validarSubempreiteiro(id: string): Promise<Subcontractor> {
  const { error } = await supabase.rpc('validar_subempreiteiro', { p_id: id })
  if (error) throw error
  return buscarSubempreiteiro(id)
}
