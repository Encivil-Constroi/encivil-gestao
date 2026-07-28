import { supabase } from '@/integrations/supabase/client'
import type { TablesUpdate } from '@/integrations/supabase/types'
import type { FuelEntry, CounterUnit } from '@/app/types'

type AbastecimentoRow = {
  id: string
  veiculo_id: string
  obra_id: string | null
  data: string
  litros: number
  custo_total: number
  contador: number | null
  local: string | null
  responsavel: string
  observacoes: string | null
  created_at: string
  comb_veiculos: { nome: string; codigo: string; unidade_contador: CounterUnit } | null
  obras: { nome: string } | null
}

function toFuelEntry(row: AbastecimentoRow): FuelEntry {
  const liters = Number(row.litros)
  const totalCost = Number(row.custo_total)
  return {
    id: row.id,
    vehicleId: row.veiculo_id,
    vehicleName: row.comb_veiculos?.nome ?? undefined,
    vehicleCode: row.comb_veiculos?.codigo ?? undefined,
    counterUnit: row.comb_veiculos?.unidade_contador ?? undefined,
    obraId: row.obra_id ?? undefined,
    obraName: row.obras?.nome ?? undefined,
    date: new Date(row.data),
    liters,
    totalCost,
    counter: row.contador ?? undefined,
    location: row.local ?? undefined,
    responsible: row.responsavel,
    notes: row.observacoes ?? undefined,
    createdAt: new Date(row.created_at),
    pricePerLiter: liters > 0 ? totalCost / liters : 0,
  }
}

const SELECT = '*, comb_veiculos(nome, codigo, unidade_contador), obras(nome)'

export type FiltrosAbastecimentos = {
  veiculoId?: string
  obraId?: string
  dataInicio?: string   // YYYY-MM-DD
  dataFim?: string      // YYYY-MM-DD
}

export async function listarAbastecimentos(filtros: FiltrosAbastecimentos = {}): Promise<FuelEntry[]> {
  let query = supabase.from('comb_abastecimentos').select(SELECT).order('data', { ascending: false })
  if (filtros.veiculoId)   query = query.eq('veiculo_id', filtros.veiculoId)
  if (filtros.obraId)      query = query.eq('obra_id', filtros.obraId)
  if (filtros.dataInicio)  query = query.gte('data', filtros.dataInicio)
  if (filtros.dataFim)     query = query.lte('data', filtros.dataFim)
  const { data, error } = await query
  if (error) throw error
  return (data as AbastecimentoRow[]).map(toFuelEntry)
}

export async function buscarAbastecimento(id: string): Promise<FuelEntry> {
  const { data, error } = await supabase.from('comb_abastecimentos').select(SELECT).eq('id', id).single()
  if (error) throw error
  return toFuelEntry(data as AbastecimentoRow)
}

export type NovoAbastecimento = {
  vehicleId: string
  obraId?: string
  date: string
  liters: number
  totalCost: number
  counter?: number
  location?: string
  responsible: string
  notes?: string
}

export async function criarAbastecimento(input: NovoAbastecimento): Promise<FuelEntry> {
  const { data, error } = await supabase
    .from('comb_abastecimentos')
    .insert({
      veiculo_id: input.vehicleId,
      obra_id: input.obraId ?? null,
      data: input.date,
      litros: input.liters,
      custo_total: input.totalCost,
      contador: input.counter ?? null,
      local: input.location ?? null,
      responsavel: input.responsible,
      observacoes: input.notes ?? null,
    })
    .select(SELECT)
    .single()
  if (error) throw error
  return toFuelEntry(data as AbastecimentoRow)
}

export type AtualizarAbastecimento = Partial<NovoAbastecimento>

export async function atualizarAbastecimento(id: string, input: AtualizarAbastecimento): Promise<FuelEntry> {
  const update: Record<string, unknown> = {}
  if (input.vehicleId !== undefined)   update.veiculo_id = input.vehicleId
  if (input.obraId !== undefined)      update.obra_id = input.obraId || null
  if (input.date !== undefined)        update.data = input.date
  if (input.liters !== undefined)      update.litros = input.liters
  if (input.totalCost !== undefined)   update.custo_total = input.totalCost
  if (input.counter !== undefined)     update.contador = input.counter ?? null
  if (input.location !== undefined)    update.local = input.location || null
  if (input.responsible !== undefined) update.responsavel = input.responsible
  if (input.notes !== undefined)       update.observacoes = input.notes || null

  const { data, error } = await supabase
    .from('comb_abastecimentos')
    .update(update as TablesUpdate<'comb_abastecimentos'>)
    .eq('id', id)
    .select(SELECT)
    .single()
  if (error) throw error
  return toFuelEntry(data as AbastecimentoRow)
}

export async function eliminarAbastecimento(id: string): Promise<void> {
  const { error } = await supabase.from('comb_abastecimentos').delete().eq('id', id)
  if (error) throw error
}
