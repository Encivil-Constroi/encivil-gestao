import { obrasDb, type EquipaRow, type ObraFrotaRow, type ObraFerramentaRow, type ObraMaterialRow } from '../db'

export type AutorObra = { user_id: string; nome: string; role: string; designado: boolean }

export async function listarEquipaObra(obraId: string): Promise<EquipaRow[]> {
  const { data, error } = await obrasDb.rpc('obra_equipa_lista', { p_obra_id: obraId })
  if (error) throw error
  return data ?? []
}

export async function alocarColaborador(obraId: string, colaboradorId: string, funcao: string, desde: string): Promise<string> {
  const { data, error } = await obrasDb.rpc('obra_alocar_colaborador', {
    p_obra_id: obraId, p_colaborador_id: colaboradorId, p_funcao: funcao.trim() || null, p_desde: desde,
  })
  if (error) throw error
  return data
}

export async function removerColaborador(alocacaoId: string, ate: string): Promise<true> {
  const { error } = await obrasDb.rpc('obra_remover_colaborador', { p_alocacao_id: alocacaoId, p_ate: ate })
  if (error) throw error
  return true
}

export async function listarAutoresObra(obraId: string): Promise<AutorObra[]> {
  const { data, error } = await obrasDb.rpc('obra_autores_lista', { p_obra_id: obraId })
  if (error) throw error
  return data ?? []
}

export async function definirAutoresObra(obraId: string, userIds: string[]): Promise<true> {
  const { error } = await obrasDb.rpc('obra_definir_autores', { p_obra_id: obraId, p_user_ids: userIds })
  if (error) throw error
  return true
}

export async function listarFrotaObra(obraId: string): Promise<ObraFrotaRow[]> {
  const { data, error } = await obrasDb.rpc('obra_frota', { p_obra_id: obraId })
  if (error) throw error
  return data ?? []
}

export async function listarFerramentasObra(obraId: string): Promise<ObraFerramentaRow[]> {
  const { data, error } = await obrasDb.rpc('obra_ferramentas', { p_obra_id: obraId })
  if (error) throw error
  return data ?? []
}

export async function listarMateriaisObra(obraId: string): Promise<ObraMaterialRow[]> {
  const { data, error } = await obrasDb.rpc('obra_materiais', { p_obra_id: obraId })
  if (error) throw error
  return data ?? []
}
