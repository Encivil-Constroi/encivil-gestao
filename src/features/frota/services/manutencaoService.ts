import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'
import {
  frotaDb,
  type HistoricoManutencaoRow, type ManutencaoRow, type VeiculoItemRow, type ChecklistRow,
  type VeiculoFrotaRow, type LinhaTempoRow, type FrotaDatabase,
} from '../db'

export type EdicaoRow = {
  id: string
  manutencao_id: string
  antes: Record<string, unknown>
  depois: Record<string, unknown>
  editado_por: string | null
  editado_em: string
}

// A tabela das correções ainda não está em db.ts (partilhado): declarada aqui
type EdicoesDb = {
  __InternalSupabase: FrotaDatabase['__InternalSupabase']
  public: {
    Tables: { veiculo_manutencao_edicoes: { Row: EdicaoRow; Insert: never; Update: never; Relationships: [] } }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
const edicoesDb = supabase as unknown as SupabaseClient<EdicoesDb>

export const LIMITE_HISTORICO = 2000

export async function listarHistorico(f: { veiculoId: string | null; desde: string | null; ate: string | null }): Promise<HistoricoManutencaoRow[]> {
  const { data, error } = await frotaDb.rpc('frota_historico_manutencoes', {
    p_veiculo_id: f.veiculoId, p_desde: f.desde || null, p_ate: f.ate || null, p_limite: LIMITE_HISTORICO,
  })
  if (error) throw error
  return data ?? []
}

export type EdicaoComAutor = EdicaoRow & { editado_por_nome: string }

export type DiaDaViatura = { manutencoes: HistoricoManutencaoRow[]; edicoes: EdicaoComAutor[] }

const mesmoInstante = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime()

// Os perfis só são legíveis por cada um: o nome de quem corrigiu vem da linha do tempo (SECURITY DEFINER)
async function autoresDasEdicoes(veiculoId: string, edicoes: EdicaoRow[]): Promise<EdicaoComAutor[]> {
  if (edicoes.length === 0) return []
  const { data, error } = await frotaDb.rpc('frota_linha_tempo', { p_veiculo_id: veiculoId, p_limite: 1000 })
  if (error) throw error
  const eventos: LinhaTempoRow[] = (data ?? []).filter(e => e.tipo === 'EDICAO')
  return edicoes.map(e => ({
    ...e,
    editado_por_nome: eventos.find(ev => ev.ref_id === e.manutencao_id && mesmoInstante(ev.quando, e.editado_em))?.utilizador ?? 'Utilizador',
  }))
}

export async function listarEdicoes(manutencaoIds: string[], veiculoId: string): Promise<EdicaoComAutor[]> {
  if (manutencaoIds.length === 0) return []
  const { data, error } = await edicoesDb.from('veiculo_manutencao_edicoes')
    .select('id, manutencao_id, antes, depois, editado_por, editado_em')
    .in('manutencao_id', manutencaoIds).order('editado_em', { ascending: false })
  if (error) throw error
  return autoresDasEdicoes(veiculoId, data ?? [])
}

// Tudo o que foi feito a uma viatura num dia, com as correções de cada intervenção
export async function carregarDia(veiculoId: string, data: string): Promise<DiaDaViatura> {
  const manutencoes = await listarHistorico({ veiculoId, desde: data, ate: data })
  const edicoes = await listarEdicoes(manutencoes.filter(m => m.editado_em).map(m => m.id), veiculoId)
  return { manutencoes, edicoes }
}

const SELECT_MANUTENCAO = 'id, veiculo_id, item_id, descricao, data, km_na_altura, custo, oficina, observacoes, atualiza_proxima, condutor_id, criado_por, criado_em'

export type ManutencaoParaEditar = { manutencao: ManutencaoRow; edicoes: EdicaoComAutor[] }

export async function carregarManutencao(id: string): Promise<ManutencaoParaEditar> {
  const { data, error } = await frotaDb.from('veiculo_manutencoes').select(SELECT_MANUTENCAO).eq('id', id).single()
  if (error) throw error
  return { manutencao: data, edicoes: await listarEdicoes([id], data.veiculo_id) }
}

export type ContextoViatura = {
  viatura: Pick<VeiculoFrotaRow, 'id' | 'nome' | 'marca' | 'modelo' | 'identificacao' | 'tipo' | 'unidade_contador'
    | 'data_ultima_revisao' | 'km_ultima_revisao'>
  kmAtual: number | null
  itens: VeiculoItemRow[]
}

// Última revisão e leitura atual: o ponto de partida do mecânico antes de gravar
export async function carregarContextoViatura(veiculoId: string): Promise<ContextoViatura> {
  const [v, km, itens] = await Promise.all([
    frotaDb.from('comb_veiculos')
      .select('id, nome, marca, modelo, identificacao, tipo, unidade_contador, data_ultima_revisao, km_ultima_revisao')
      .eq('id', veiculoId).single(),
    frotaDb.rpc('km_atual_veiculo', { p_veiculo_id: veiculoId }),
    frotaDb.from('frota_veiculo_itens')
      .select('id, veiculo_id, item_id, ativo, intervalo_km, intervalo_meses, proxima_km, proxima_data, ultima_km, ultima_data, atualizado_por, atualizado_em')
      .eq('veiculo_id', veiculoId),
  ])
  for (const r of [v, km, itens]) if (r.error) throw r.error
  return { viatura: v.data!, kmAtual: km.data ?? null, itens: itens.data ?? [] }
}

export async function editarManutencao(a: {
  id: string; itemId: string | null; descricao: string | null; data: string
  km: number | null; custo: number | null; oficina: string | null; observacoes: string | null
}): Promise<true> {
  const { error } = await frotaDb.rpc('editar_manutencao', {
    p_id: a.id, p_item_id: a.itemId, p_descricao: a.descricao, p_data: a.data,
    p_km: a.km, p_custo: a.custo, p_oficina: a.oficina, p_observacoes: a.observacoes,
  })
  if (error) throw error
  return true
}

export async function definirEstadoViatura(veiculoId: string, estado: 'LIVRE' | 'OFICINA'): Promise<true> {
  const { error } = await frotaDb.rpc('definir_estado_viatura', { p_veiculo_id: veiculoId, p_estado: estado })
  if (error) throw error
  return true
}

const SELECT_CHECKLIST = 'id, veiculo_id, data, km_na_altura, itens, estado_geral, observacoes, foto_keys, condutor_id, criado_por, criado_em'

export async function listarChecklistsRecentes(limite = 40): Promise<ChecklistRow[]> {
  const { data, error } = await frotaDb.from('veiculo_checklists').select(SELECT_CHECKLIST)
    .order('data', { ascending: false }).order('criado_em', { ascending: false }).limit(limite)
  if (error) throw error
  return data ?? []
}
