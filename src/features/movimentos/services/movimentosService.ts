import { supabase } from '@/integrations/supabase/client'
import type { Movement, MovementType, Unit } from '@/app/types'

type MovimentoRow = {
  id: string
  produto_id: string
  tipo: MovementType
  quantidade: number
  stock_antes: number
  stock_depois: number
  responsavel: string
  destino_obra: string | null
  obra_id: string | null
  observacoes: string | null
  created_at: string
  created_by: string
  produtos: { nome: string; unidade: string } | null
}

function toMovement(row: MovimentoRow): Movement {
  return {
    id: row.id,
    productId: row.produto_id,
    productName: row.produtos?.nome ?? '',
    type: row.tipo,
    quantity: row.quantidade,
    unit: (row.produtos?.unidade ?? '') as Unit,
    responsible: row.responsavel,
    destination: row.destino_obra ?? undefined,
    obraId: row.obra_id ?? undefined,
    notes: row.observacoes ?? undefined,
    date: new Date(row.created_at),
    previousStock: row.stock_antes,
    newStock: row.stock_depois,
  }
}

export type FiltrosMovimentos = {
  produtoId?: string
  tipo?: MovementType
  dataInicio?: Date
  dataFim?: Date
  destino?: string
  obraId?: string
  limit?: number
  offset?: number
}

export const PAGE_SIZE = 50

export async function listarMovimentos(filtros: FiltrosMovimentos = {}): Promise<Movement[]> {
  let query = supabase
    .from('movimentos_stock')
    .select('*, produtos(nome, unidade)')
    .order('created_at', { ascending: false })

  if (filtros.produtoId)  query = query.eq('produto_id', filtros.produtoId)
  if (filtros.tipo)       query = query.eq('tipo', filtros.tipo)
  if (filtros.dataInicio) query = query.gte('created_at', filtros.dataInicio.toISOString())
  if (filtros.dataFim) {
    const fim = new Date(filtros.dataFim)
    fim.setDate(fim.getDate() + 1)
    query = query.lt('created_at', fim.toISOString())
  }
  if (filtros.destino)    query = query.ilike('destino_obra', `%${filtros.destino}%`)
  if (filtros.obraId)     query = query.eq('obra_id', filtros.obraId)
  if (filtros.limit)  query = query.limit(filtros.limit)
  if (filtros.offset) query = query.range(filtros.offset, filtros.offset + (filtros.limit ?? 20) - 1)

  const { data, error } = await query
  if (error) throw error
  return (data as MovimentoRow[]).map(toMovement)
}

export async function listarMovimentosPaginados(
  filtros: FiltrosMovimentos = {},
  page = 0,
): Promise<{ data: Movement[]; count: number }> {
  const from = page * PAGE_SIZE
  const to   = from + PAGE_SIZE - 1

  let query = supabase
    .from('movimentos_stock')
    .select('*, produtos(nome, unidade)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (filtros.produtoId)  query = query.eq('produto_id', filtros.produtoId)
  if (filtros.tipo)       query = query.eq('tipo', filtros.tipo)
  if (filtros.dataInicio) query = query.gte('created_at', filtros.dataInicio.toISOString())
  if (filtros.dataFim) {
    const fim = new Date(filtros.dataFim)
    fim.setDate(fim.getDate() + 1)
    query = query.lt('created_at', fim.toISOString())
  }
  if (filtros.destino)    query = query.ilike('destino_obra', `%${filtros.destino}%`)
  if (filtros.obraId)     query = query.eq('obra_id', filtros.obraId)

  const { data, error, count } = await query
  if (error) throw error
  return {
    data:  (data as MovimentoRow[]).map(toMovement),
    count: count ?? 0,
  }
}

export async function exportarMovimentos(filtros: FiltrosMovimentos = {}): Promise<Movement[]> {
  return listarMovimentos({ ...filtros, limit: undefined, offset: undefined })
}

export type RegistarMovimentoInput = {
  produtoId: string
  tipo: MovementType
  quantidade: number
  responsavel: string
  destinoObra?: string
  obraId?: string
  observacoes?: string
}

export async function registarMovimento(input: RegistarMovimentoInput): Promise<void> {
  const { error } = await supabase.rpc('registar_movimento', {
    p_produto_id: input.produtoId,
    p_tipo: input.tipo,
    p_quantidade: input.quantidade,
    p_responsavel: input.responsavel,
    p_destino_obra: input.destinoObra,
    p_observacoes: input.observacoes,
    p_obra_id: input.obraId,
  })
  if (error) throw error
}
