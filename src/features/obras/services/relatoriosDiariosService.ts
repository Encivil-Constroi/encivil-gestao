import { obrasDb, type EquipaRow, type RelatorioListaRow, type RelatorioRow, type SubResumoRow } from '../db'
import type { DadosRelatorio } from '../lib/relatorioDiario'

export type FiltrosRelatorios = {
  obraId?: string | null
  desde?: string | null
  ate?: string | null
  estado?: 'rascunho' | 'submetido' | null
  soOcorrencias?: boolean
  autorId?: string | null
}

export type RelatorioDetalhe = RelatorioRow & {
  obra_nome: string
  autor_nome: string | null
  submetido_por_nome: string | null
  reaberto_por_nome: string | null
  equipa: { id: string; nome: string }[]
  subempreiteiros: { id: string; nome: string }[]
}

export async function listarRelatoriosDiarios(f: FiltrosRelatorios = {}): Promise<RelatorioListaRow[]> {
  const { data, error } = await obrasDb.rpc('obra_relatorios_lista', {
    p_obra_id: f.obraId || null, p_desde: f.desde || null, p_ate: f.ate || null,
    p_estado: f.estado || null, p_so_ocorrencias: f.soOcorrencias || false, p_limite: 1000,
  })
  if (error) throw error
  return f.autorId ? (data ?? []).filter(r => r.autor_id === f.autorId) : data ?? []
}

export async function obterRelatorioDiario(id: string): Promise<RelatorioDetalhe> {
  const { data, error } = await obrasDb.rpc('obra_relatorio_detalhe', { p_id: id })
  if (error) throw error
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Relatório não encontrado.')
  return data as RelatorioDetalhe
}

export async function guardarRelatorioDiario(id: string | null, obraId: string, d: DadosRelatorio): Promise<string> {
  const { data, error } = await obrasDb.rpc('obra_guardar_relatorio', {
    p_id: id, p_obra_id: obraId, p_data: d.data, p_clima: d.clima,
    p_temperatura_c: d.temperatura_c, p_clima_descricao: d.clima_descricao,
    p_equipa_ids: d.equipa_ids, p_equipa_outros: d.equipa_outros,
    p_subempreiteiros_ids: d.subempreiteiros_ids, p_trabalhos: d.trabalhos,
    p_houve_ocorrencias: d.houve_ocorrencias, p_ocorrencias: d.houve_ocorrencias ? d.ocorrencias : null,
    p_observacoes: d.observacoes, p_fotos: d.fotos,
  })
  if (error) throw error
  return data
}

export async function submeterRelatorioDiario(id: string): Promise<true> {
  const { error } = await obrasDb.rpc('obra_submeter_relatorio', { p_id: id })
  if (error) throw error
  return true
}

export async function reabrirRelatorioDiario(id: string, motivo: string): Promise<true> {
  const { error } = await obrasDb.rpc('obra_reabrir_relatorio', { p_id: id, p_motivo: motivo })
  if (error) throw error
  return true
}

export async function listarEquipaParaRelatorio(obraId: string): Promise<EquipaRow[]> {
  const { data, error } = await obrasDb.rpc('obra_equipa_lista', { p_obra_id: obraId })
  if (error) throw error
  return (data ?? []).filter(e => e.ativo)
}

export async function listarSubempreitadasParaRelatorio(obraId: string): Promise<SubResumoRow[]> {
  const { data, error } = await obrasDb.rpc('subs_resumo', { p_obra_id: obraId })
  if (error) throw error
  return data ?? []
}

export async function autorDesignadoParaRelatorio(obraId: string, userId: string): Promise<boolean> {
  const { data, error } = await obrasDb.from('obra_autores').select('user_id').eq('obra_id', obraId).eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data != null
}
