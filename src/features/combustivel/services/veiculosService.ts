import { supabase } from '@/integrations/supabase/client'
import type { TablesUpdate } from '@/integrations/supabase/types'
import type { Vehicle, VehicleType, FuelType, CounterUnit } from '@/app/types'

type VeiculoRow = {
  id: string
  codigo: string
  nome: string
  tipo: VehicleType
  identificacao: string | null
  tipo_combustivel: FuelType
  unidade_contador: CounterUnit
  ativo: boolean
  observacoes: string | null
  created_at: string
  updated_at: string
  // manutenção preventiva (F1)
  proxima_revisao_km: number | null
  proxima_revisao_data: string | null
  intervalo_revisao_km: number | null
  intervalo_revisao_meses: number | null
  data_fim_seguro: string | null
  data_proxima_ipo: string | null
}

function toVehicle(row: VeiculoRow): Vehicle {
  return {
    id: row.id,
    code: row.codigo,
    name: row.nome,
    type: row.tipo,
    identification: row.identificacao ?? undefined,
    fuelType: row.tipo_combustivel,
    counterUnit: row.unidade_contador,
    active: row.ativo,
    notes: row.observacoes ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    proximaRevisaoKm: row.proxima_revisao_km ?? undefined,
    proximaRevisaoData: row.proxima_revisao_data ? new Date(row.proxima_revisao_data) : undefined,
    intervaloRevisaoKm: row.intervalo_revisao_km ?? undefined,
    intervaloRevisaoMeses: row.intervalo_revisao_meses ?? undefined,
    dataFimSeguro: row.data_fim_seguro ? new Date(row.data_fim_seguro) : undefined,
    dataProximaIpo: row.data_proxima_ipo ? new Date(row.data_proxima_ipo) : undefined,
  }
}

export async function listarVeiculos(apenasAtivos = true): Promise<Vehicle[]> {
  let query = supabase.from('comb_veiculos').select('*').order('nome')
  if (apenasAtivos) query = query.eq('ativo', true)
  const { data, error } = await query
  if (error) throw error
  return (data as VeiculoRow[]).map(toVehicle)
}

export async function buscarVeiculo(id: string): Promise<Vehicle> {
  const { data, error } = await supabase.from('comb_veiculos').select('*').eq('id', id).single()
  if (error) throw error
  return toVehicle(data as VeiculoRow)
}

export type ManutencaoVeiculo = {
  proximaRevisaoKm?: number
  proximaRevisaoData?: string   // ISO date string
  intervaloRevisaoKm?: number
  intervaloRevisaoMeses?: number
  dataFimSeguro?: string        // ISO date string
  dataProximaIpo?: string       // ISO date string
}

export type NovoVeiculo = {
  name: string
  type: VehicleType
  identification?: string
  fuelType: FuelType
  counterUnit: CounterUnit
  notes?: string
} & ManutencaoVeiculo

export async function criarVeiculo(input: NovoVeiculo): Promise<Vehicle> {
  const { data, error } = await supabase
    .from('comb_veiculos')
    .insert({
      nome: input.name,
      tipo: input.type,
      identificacao: input.identification ?? null,
      tipo_combustivel: input.fuelType,
      unidade_contador: input.counterUnit,
      observacoes: input.notes ?? null,
      proxima_revisao_km: input.proximaRevisaoKm ?? null,
      proxima_revisao_data: input.proximaRevisaoData ?? null,
      intervalo_revisao_km: input.intervaloRevisaoKm ?? null,
      intervalo_revisao_meses: input.intervaloRevisaoMeses ?? null,
      data_fim_seguro: input.dataFimSeguro ?? null,
      data_proxima_ipo: input.dataProximaIpo ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return toVehicle(data as VeiculoRow)
}

export type AtualizarVeiculo = Partial<NovoVeiculo> & { active?: boolean }

export async function atualizarVeiculo(id: string, input: AtualizarVeiculo): Promise<Vehicle> {
  const update: Record<string, unknown> = {}
  if (input.name !== undefined)           update.nome = input.name
  if (input.type !== undefined)           update.tipo = input.type
  if (input.identification !== undefined) update.identificacao = input.identification || null
  if (input.fuelType !== undefined)       update.tipo_combustivel = input.fuelType
  if (input.counterUnit !== undefined)    update.unidade_contador = input.counterUnit
  if (input.notes !== undefined)          update.observacoes = input.notes || null
  if (input.active !== undefined)         update.ativo = input.active
  // manutenção
  if ('proximaRevisaoKm'     in input)    update.proxima_revisao_km      = input.proximaRevisaoKm ?? null
  if ('proximaRevisaoData'   in input)    update.proxima_revisao_data    = input.proximaRevisaoData ?? null
  if ('intervaloRevisaoKm'   in input)    update.intervalo_revisao_km    = input.intervaloRevisaoKm ?? null
  if ('intervaloRevisaoMeses' in input)   update.intervalo_revisao_meses = input.intervaloRevisaoMeses ?? null
  if ('dataFimSeguro'        in input)    update.data_fim_seguro         = input.dataFimSeguro ?? null
  if ('dataProximaIpo'       in input)    update.data_proxima_ipo        = input.dataProximaIpo ?? null

  const { data, error } = await supabase.from('comb_veiculos').update(update as TablesUpdate<'comb_veiculos'>).eq('id', id).select().single()
  if (error) throw error
  return toVehicle(data as VeiculoRow)
}

export async function gerarCodigoVeiculoPreview(): Promise<string> {
  const { data, error } = await supabase.rpc('gerar_codigo_veiculo')
  if (error) throw error
  return data as string
}
