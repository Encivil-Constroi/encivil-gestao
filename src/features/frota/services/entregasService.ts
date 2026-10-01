import { supabase } from '@/integrations/supabase/client'
import { frotaDb, type DadosEntrega, type EntregaRow } from '../db'

export async function listarEntregas(veiculoId?: string): Promise<EntregaRow[]> {
  const { data, error } = await frotaDb.rpc('frota_listar_entregas', { p_veiculo_id: veiculoId ?? null, p_limite: 500 })
  if (error) throw error
  return (data ?? []).map(e => ({ ...e, km: Number(e.km) }))
}

export async function listarObrasAtivas(): Promise<{ id: string; nome: string }[]> {
  const { data, error } = await supabase.from('obras').select('id, nome').eq('estado', 'ativa').order('nome')
  if (error) throw error
  return data
}

export type ArgsEntrega = DadosEntrega & {
  veiculoId: string; colaboradorId: string; obraId: string | null; data: string; km: number; observacoes: string | null
}

export async function entregarViatura(a: ArgsEntrega): Promise<string> {
  const { data, error } = await frotaDb.rpc('entregar_viatura', {
    p_veiculo_id: a.veiculoId, p_colaborador_id: a.colaboradorId, p_obra_id: a.obraId, p_data: a.data, p_km: a.km,
    p_combustivel: a.combustivel, p_adblue: a.adblue, p_oleo: a.oleo, p_refrigeracao: a.refrigeracao,
    p_pneus: a.pneus, p_limpeza: a.limpeza, p_inventario: a.inventario, p_danos: a.danos,
    p_observacoes: a.observacoes,
  })
  if (error) throw error
  return data
}

export type ArgsDevolucao = DadosEntrega & {
  veiculoId: string; data: string; km: number; observacoes: string | null; paraOficina: boolean
}

export async function devolverViatura(a: ArgsDevolucao): Promise<string> {
  const { data, error } = await frotaDb.rpc('devolver_viatura', {
    p_veiculo_id: a.veiculoId, p_data: a.data, p_km: a.km,
    p_combustivel: a.combustivel, p_adblue: a.adblue, p_oleo: a.oleo, p_refrigeracao: a.refrigeracao,
    p_pneus: a.pneus, p_limpeza: a.limpeza, p_inventario: a.inventario, p_danos: a.danos,
    p_observacoes: a.observacoes, p_para_oficina: a.paraOficina,
  })
  if (error) throw error
  return data
}
