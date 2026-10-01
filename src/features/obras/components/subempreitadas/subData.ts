import { obrasDb, type ClimaObra, type FotoObra, type Gravidade, type SubOcorrenciaRow, type SubPainel, type SubResumoRow, type TipoOcorrencia } from '../../db'

export function validarEvidencias(dados: { progresso: number | null; atraso: number }): string | null {
  if (dados.progresso !== null && (!Number.isFinite(dados.progresso) || dados.progresso < 0 || dados.progresso > 100)) return 'O progresso físico deve estar entre 0 e 100%.'
  if (!Number.isInteger(dados.atraso) || dados.atraso < 0) return 'Os dias de atraso devem ser um inteiro não negativo.'
  return null
}

export function validarOcorrencia(descricao: string, data: string, hoje: string, atraso: number): string | null {
  if (!descricao.trim()) return 'Indique a descrição da ocorrência.'
  if (!data || data > hoje) return 'A data da ocorrência não pode ser futura.'
  if (!Number.isInteger(atraso) || atraso < 0) return 'Os dias de atraso devem ser um inteiro não negativo.'
  return null
}

export async function listarResumoSubs(obraId: string | null): Promise<SubResumoRow[]> {
  const { data, error } = await obrasDb.rpc('subs_resumo', { p_obra_id: obraId })
  if (error) throw error
  return data ?? []
}

export async function buscarPainelSub(id: string): Promise<SubPainel> {
  const { data, error } = await obrasDb.rpc('sub_painel', { p_id: id })
  if (error) throw error
  return data
}

export async function listarOcorrencias(subId: string): Promise<SubOcorrenciaRow[]> {
  const { data, error } = await obrasDb.from('sub_ocorrencias').select('*').eq('subempreiteiro_id', subId).order('data', { ascending: false })
  if (error) throw error
  return data ?? []
}

export type FichaSub = { nif: string | null; telefone: string | null; email: string | null; especialidade: string | null; data_inicio: string | null; data_fim_prevista: string | null; contrato_path: string | null; contrato_nome: string | null }
export async function buscarFichaSub(id: string): Promise<FichaSub> {
  const { data, error } = await obrasDb.from('subempreiteiros').select('nif,telefone,email,especialidade,data_inicio,data_fim_prevista,contrato_path,contrato_nome').eq('id', id).single()
  if (error) throw error
  return data
}

export async function guardarFichaSub(id: string, ficha: Omit<FichaSub, 'contrato_path' | 'contrato_nome'>): Promise<void> {
  const { error } = await obrasDb.rpc('sub_atualizar_ficha', { p_id: id, p_nif: ficha.nif, p_telefone: ficha.telefone, p_email: ficha.email, p_especialidade: ficha.especialidade, p_data_inicio: ficha.data_inicio, p_data_fim_prevista: ficha.data_fim_prevista })
  if (error) throw error
}
export async function anexarContrato(id: string, path: string, nome: string): Promise<void> {
  const { error } = await obrasDb.rpc('sub_anexar_contrato', { p_id: id, p_path: path, p_nome: nome })
  if (error) throw error
}
export async function removerContrato(id: string): Promise<void> { const { error } = await obrasDb.rpc('sub_remover_contrato', { p_id: id }); if (error) throw error }

export type NovaOcorrencia = { subId: string; tipo: TipoOcorrencia; gravidade: Gravidade; data: string; descricao: string; atraso: number; fotos: FotoObra[] }
export async function registarOcorrencia(o: NovaOcorrencia): Promise<void> {
  const { error } = await obrasDb.rpc('sub_registar_ocorrencia', { p_subempreiteiro_id: o.subId, p_tipo: o.tipo, p_gravidade: o.gravidade, p_data: o.data, p_descricao: o.descricao, p_dias_atraso: o.atraso, p_fotos: o.fotos })
  if (error) throw error
}
export async function resolverOcorrencia(id: string, resolucao: string): Promise<void> { const { error } = await obrasDb.rpc('sub_resolver_ocorrencia', { p_id: id, p_resolucao: resolucao }); if (error) throw error }

export type Evidencias = { fotos: FotoObra[]; anotacoes: string | null; problemas: string | null; atraso_dias: number; clima: ClimaObra | null; clima_descricao: string | null; progresso_fisico_pct: number | null }
export async function buscarEvidencias(autoId: string): Promise<Evidencias> {
  const { data, error } = await obrasDb.from('autos_medicao').select('fotos,anotacoes,problemas,atraso_dias,clima,clima_descricao,progresso_fisico_pct').eq('id', autoId).single()
  if (error) throw error
  return data
}
export async function guardarEvidencias(autoId: string, e: Evidencias): Promise<void> {
  const { error } = await obrasDb.rpc('auto_guardar_evidencias', { p_auto_id: autoId, p_fotos: e.fotos, p_anotacoes: e.anotacoes, p_problemas: e.problemas, p_atraso_dias: e.atraso_dias, p_clima: e.clima, p_clima_descricao: e.clima_descricao, p_progresso_fisico_pct: e.progresso_fisico_pct })
  if (error) throw error
}
