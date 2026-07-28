import { supabase } from '@/integrations/supabase/client'
import type { TablesUpdate } from '@/integrations/supabase/types'
import type { Measurement, MeasurementLine } from '@/app/types'

type LinhaRow = {
  id: string
  auto_id: string
  artigo_id: string | null
  descricao: string
  unidade: string
  preco_unitario: number
  quantidade: number
  is_extra: boolean
}

type AutoRow = {
  id: string
  subempreiteiro_id: string
  numero: number
  data_medicao: string
  percentagem_periodo: number | null
  valor_periodo: number
  observacoes: string | null
  estado: 'rascunho' | 'validado'
  created_at: string
  validado_em: string | null
  auto_linhas?: LinhaRow[]
}

function toLine(row: LinhaRow): MeasurementLine {
  return {
    id: row.id,
    autoId: row.auto_id,
    itemId: row.artigo_id ?? undefined,
    description: row.descricao,
    unit: row.unidade,
    unitPrice: Number(row.preco_unitario),
    quantity: Number(row.quantidade),
    isExtra: row.is_extra,
  }
}

function toMeasurement(row: AutoRow): Measurement {
  return {
    id: row.id,
    subcontractorId: row.subempreiteiro_id,
    number: row.numero,
    date: new Date(row.data_medicao),
    periodPercentage: row.percentagem_periodo ?? undefined,
    periodValue: Number(row.valor_periodo),
    notes: row.observacoes ?? undefined,
    status: row.estado,
    createdAt: new Date(row.created_at),
    validatedAt: row.validado_em ? new Date(row.validado_em) : undefined,
    lines: (row.auto_linhas ?? []).map(toLine).sort((a, b) => Number(a.isExtra) - Number(b.isExtra)),
  }
}

const SELECT = '*, auto_linhas(*)'

export async function listarAutos(subId: string): Promise<Measurement[]> {
  const { data, error } = await supabase
    .from('autos_medicao')
    .select(SELECT)
    .eq('subempreiteiro_id', subId)
    .order('numero', { ascending: true })
  if (error) throw error
  return (data as AutoRow[]).map(toMeasurement)
}

export async function buscarAuto(id: string): Promise<Measurement> {
  const { data, error } = await supabase.from('autos_medicao').select(SELECT).eq('id', id).single()
  if (error) throw error
  return toMeasurement(data as AutoRow)
}

export type LinhaInput = {
  itemId?: string
  description: string
  unit: string
  unitPrice: number
  quantity: number
  isExtra?: boolean
}

export type NovoAuto = {
  subcontractorId: string
  date: string
  periodPercentage?: number
  periodValue: number
  notes?: string
  lines?: LinhaInput[]
}

export async function criarAuto(input: NovoAuto): Promise<Measurement> {
  const { data, error } = await supabase.rpc('criar_auto_rpc', {
    p_sub_id:      input.subcontractorId,
    p_data:        input.date,
    p_percentagem: input.periodPercentage ?? null,
    p_valor:       input.periodValue,
    p_notas:       input.notes ?? null,
  })
  if (error) throw error
  const { id } = (data as { id: string; numero: number }[])[0]
  if (input.lines?.length) await substituirLinhas(id, input.lines)
  return buscarAuto(id)
}

export type AtualizarAuto = Partial<Omit<NovoAuto, 'subcontractorId'>>

export async function atualizarAuto(id: string, input: AtualizarAuto): Promise<Measurement> {
  const update: Record<string, unknown> = {}
  if (input.date !== undefined)             update.data_medicao = input.date
  if (input.periodPercentage !== undefined) update.percentagem_periodo = input.periodPercentage ?? null
  if (input.periodValue !== undefined)      update.valor_periodo = input.periodValue
  if (input.notes !== undefined)            update.observacoes = input.notes || null

  const { error } = await supabase.from('autos_medicao').update(update as TablesUpdate<'autos_medicao'>).eq('id', id)
  if (error) throw error

  if (input.lines !== undefined) await substituirLinhas(id, input.lines)
  return buscarAuto(id)
}

async function substituirLinhas(autoId: string, lines: LinhaInput[]): Promise<void> {
  const { error: delError } = await supabase.from('auto_linhas').delete().eq('auto_id', autoId)
  if (delError) throw delError
  if (!lines.length) return
  const { error: insError } = await supabase.from('auto_linhas').insert(lines.map(l => ({
    auto_id: autoId,
    artigo_id: l.itemId ?? null,
    descricao: l.description,
    unidade: l.unit,
    preco_unitario: l.unitPrice,
    quantidade: l.quantity,
    is_extra: l.isExtra ?? false,
  })))
  if (insError) throw insError
}

export async function eliminarAuto(id: string): Promise<void> {
  const { error } = await supabase.from('autos_medicao').delete().eq('id', id)
  if (error) throw error
}

export async function validarAuto(id: string): Promise<Measurement> {
  const { error } = await supabase.rpc('validar_auto', { p_id: id })
  if (error) throw error
  return buscarAuto(id)
}
