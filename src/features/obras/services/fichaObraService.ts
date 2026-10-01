import { obrasDb, type AfericaoRow, type EventoRow, type FaseRow, type FotoObra, type FotoTodasRow, type RelatorioListaRow } from '../db'

const FASE_SELECT = 'id,obra_id,nome,peso,progresso,data_inicio,data_fim_prevista,estado,ordem,notas,atualizado_por,atualizado_em'
const AFERICAO_SELECT = 'id,obra_id,data,progresso_pct,resumo,problemas,atrasos_dias,atraso_motivo,clima,clima_descricao,fotos,autor_id,criado_em'
const FOTO_SELECT = 'obra_id,path,legenda,data,origem,ref_id,autor_id'

export async function listarFases(obraId: string): Promise<FaseRow[]> {
  const { data, error } = await obrasDb.from('obra_fases').select(FASE_SELECT).eq('obra_id', obraId).order('ordem')
  if (error) throw error
  return data ?? []
}

export async function listarAfericoes(obraId: string): Promise<AfericaoRow[]> {
  const { data, error } = await obrasDb.from('obra_afericoes').select(AFERICAO_SELECT).eq('obra_id', obraId).order('data', { ascending: false }).order('criado_em', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function listarFotos(obraId: string): Promise<FotoTodasRow[]> {
  const { data, error } = await obrasDb.from('obra_fotos_todas').select(FOTO_SELECT).eq('obra_id', obraId).order('data', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function listarEventos(obraId: string, limite = 50): Promise<EventoRow[]> {
  const { data, error } = await obrasDb.rpc('obra_eventos_lista', { p_obra_id: obraId, p_limite: limite })
  if (error) throw error
  return data ?? []
}

export async function listarUltimosRelatorios(obraId: string): Promise<RelatorioListaRow[]> {
  const { data, error } = await obrasDb.rpc('obra_relatorios_lista', {
    p_obra_id: obraId, p_desde: null, p_ate: null, p_estado: 'submetido', p_so_ocorrencias: false, p_limite: 3,
  })
  if (error) throw error
  return data ?? []
}

export async function autorDesignado(obraId: string, userId: string): Promise<boolean> {
  const { data, error } = await obrasDb.from('obra_autores').select('user_id').eq('obra_id', obraId).eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data !== null
}

export type GuardarFaseArgs = {
  p_id: string | null; p_obra_id: string; p_nome: string; p_peso: number; p_progresso: number
  p_data_inicio: string | null; p_data_fim_prevista: string | null; p_notas: string | null
}

export async function guardarFase(args: GuardarFaseArgs): Promise<string> {
  const { data, error } = await obrasDb.rpc('obra_guardar_fase', args)
  if (error) throw error
  return data
}

export async function apagarFase(id: string): Promise<void> {
  const { error } = await obrasDb.rpc('obra_apagar_fase', { p_id: id })
  if (error) throw error
}

export type RegistarAfericaoArgs = {
  p_obra_id: string; p_data: string; p_progresso_pct: number | null; p_resumo: string
  p_problemas: string | null; p_atrasos_dias: number; p_atraso_motivo: string | null
  p_clima: AfericaoRow['clima']; p_clima_descricao: string | null; p_fotos: FotoObra[]
}

export async function registarAfericao(args: RegistarAfericaoArgs): Promise<string> {
  const { data, error } = await obrasDb.rpc('obra_registar_afericao', args)
  if (error) throw error
  return data
}

export async function adicionarFotos(obraId: string, fotos: FotoObra[]): Promise<number> {
  const { data, error } = await obrasDb.rpc('obra_adicionar_fotos', { p_obra_id: obraId, p_fotos: fotos })
  if (error) throw error
  return data
}
