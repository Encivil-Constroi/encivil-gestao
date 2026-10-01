import { supabase } from '@/integrations/supabase/client'
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
  // bomba POLO2
  pump_max_seconds: number
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
    pumpMaxSeconds: row.pump_max_seconds ?? 180,
  }
}

export async function listarVeiculos(apenasAtivos = true): Promise<Vehicle[]> {
  let query = supabase.from('comb_veiculos').select('*').order('nome')
  if (apenasAtivos) query = query.eq('ativo', true)
  const { data, error } = await query
  if (error) throw error
  // pump_max_seconds não está nos tipos gerados (coluna nova, sem acesso ao CLI)
  return (data as unknown as VeiculoRow[]).map(toVehicle)
}
