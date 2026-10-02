import {
  obrasDb,
  type AutoEvidenciaRow, type AutoGlosarArgs, type AutoGlosaRow, type AutoVerificacaoItem, type AutoVerificacaoRow,
  type EvidenciaRegistarArgs, type EvidenciaResultado, type FluxoCaixaSemana, type MotivoLiberacaoRetencao,
  type OrcamentoItemGuardarArgs, type OrcamentoItemRow, type OrcamentoResumoRow, type SubDocEstadoRow,
  type SubDocumentoRow, type SubsConfigGuardar, type SubsConfigRow, type SubsPainelCeo, type TipoDocSub,
  type CriarAutoRpcRow,
} from '../db'

// ── Configuração ─────────────────────────────────────────────────────────────
export async function lerConfigSubs(): Promise<SubsConfigRow> {
  const { data, error } = await obrasDb.rpc('subs_config_ler')
  if (error) throw error
  return data
}

export async function guardarConfigSubs(cfg: SubsConfigGuardar): Promise<void> {
  const { error } = await obrasDb.rpc('subs_config_guardar', { p_cfg: cfg })
  if (error) throw error
}

// ── Orçamento (EAP) ──────────────────────────────────────────────────────────
export async function listarItensOrcamento(obraId: string): Promise<OrcamentoItemRow[]> {
  const { data, error } = await obrasDb.from('obra_orcamento_itens').select('*').eq('obra_id', obraId).order('codigo')
  if (error) throw error
  return data ?? []
}

export async function guardarItemOrcamento(args: OrcamentoItemGuardarArgs): Promise<string> {
  const { data, error } = await obrasDb.rpc('obra_orcamento_guardar_item', args)
  if (error) throw error
  return data
}

export async function apagarItemOrcamento(id: string): Promise<void> {
  const { error } = await obrasDb.rpc('obra_orcamento_apagar_item', { p_id: id })
  if (error) throw error
}

export async function resumoOrcamento(obraId: string): Promise<OrcamentoResumoRow[]> {
  const { data, error } = await obrasDb.rpc('obra_orcamento_resumo', { p_obra_id: obraId })
  if (error) throw error
  return data ?? []
}

// ── Documentos ───────────────────────────────────────────────────────────────
export type NovoDocSub = {
  subId: string
  tipo: TipoDocSub
  referencia: string | null
  emitidoEm: string | null
  validade: string | null
  path: string
  nome: string | null
}

export async function listarDocsSub(subId: string): Promise<SubDocumentoRow[]> {
  const { data, error } = await obrasDb.from('sub_documentos').select('*').eq('subempreiteiro_id', subId).order('criado_em', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function registarDocSub(d: NovoDocSub): Promise<string> {
  const { data, error } = await obrasDb.rpc('sub_doc_registar', {
    p_sub_id: d.subId, p_tipo: d.tipo, p_referencia: d.referencia, p_emitido_em: d.emitidoEm,
    p_validade: d.validade, p_path: d.path, p_nome: d.nome,
  })
  if (error) throw error
  return data
}

export async function removerDocSub(id: string): Promise<void> {
  const { error } = await obrasDb.rpc('sub_doc_remover', { p_id: id })
  if (error) throw error
}

export async function estadoDocsSub(subId: string): Promise<SubDocEstadoRow[]> {
  const { data, error } = await obrasDb.rpc('sub_docs_estado', { p_sub_id: subId })
  if (error) throw error
  return data ?? []
}

// ── Evidências ───────────────────────────────────────────────────────────────
export async function registarEvidencia(args: EvidenciaRegistarArgs): Promise<EvidenciaResultado> {
  const { data, error } = await obrasDb.rpc('auto_registar_evidencia', args)
  if (error) throw error
  return data
}

export async function apagarEvidencia(id: string): Promise<void> {
  const { error } = await obrasDb.rpc('auto_apagar_evidencia', { p_id: id })
  if (error) throw error
}

export async function listarEvidenciasAuto(autoId: string): Promise<AutoEvidenciaRow[]> {
  const { data, error } = await obrasDb.rpc('auto_evidencias_lista', { p_auto_id: autoId })
  if (error) throw error
  return data ?? []
}

// ── Fluxo do auto ────────────────────────────────────────────────────────────
export async function submeterAuto(autoId: string): Promise<void> {
  const { error } = await obrasDb.rpc('auto_submeter', { p_auto_id: autoId })
  if (error) throw error
}

export async function iniciarVerificacao(autoId: string): Promise<void> {
  const { error } = await obrasDb.rpc('auto_iniciar_verificacao', { p_auto_id: autoId })
  if (error) throw error
}

export async function listarVerificacoes(autoId: string): Promise<AutoVerificacaoRow[]> {
  const { data, error } = await obrasDb.from('auto_verificacoes').select('*').eq('auto_id', autoId).order('ordem')
  if (error) throw error
  return data ?? []
}

export async function registarVerificacao(autoId: string, itens: AutoVerificacaoItem[]): Promise<void> {
  const { error } = await obrasDb.rpc('auto_registar_verificacao', { p_auto_id: autoId, p_itens: itens })
  if (error) throw error
}

export async function verificarAuto(autoId: string, excecaoMotivo?: string | null): Promise<void> {
  const { error } = await obrasDb.rpc('auto_verificar', { p_auto_id: autoId, p_excecao_motivo: excecaoMotivo ?? null })
  if (error) throw error
}

export async function listarGlosasAuto(autoId: string): Promise<AutoGlosaRow[]> {
  const { data, error } = await obrasDb.from('auto_glosas').select('*').eq('auto_id', autoId).order('criado_em')
  if (error) throw error
  return data ?? []
}

export async function glosarAuto(args: AutoGlosarArgs): Promise<string> {
  const { data, error } = await obrasDb.rpc('auto_glosar', args)
  if (error) throw error
  return data
}

export async function levantarGlosa(glosaId: string, motivo: string): Promise<void> {
  const { error } = await obrasDb.rpc('auto_levantar_glosa', { p_glosa_id: glosaId, p_motivo: motivo })
  if (error) throw error
}

export async function devolverAuto(autoId: string, motivo: string): Promise<void> {
  const { error } = await obrasDb.rpc('auto_devolver', { p_auto_id: autoId, p_motivo: motivo })
  if (error) throw error
}

export async function aprovarAuto(autoId: string, excecaoDocsMotivo?: string | null): Promise<void> {
  const { error } = await obrasDb.rpc('auto_aprovar', { p_auto_id: autoId, p_excecao_docs_motivo: excecaoDocsMotivo ?? null })
  if (error) throw error
}

export async function validarAutoLegado(autoId: string): Promise<void> {
  const { error } = await obrasDb.rpc('validar_auto', { p_id: autoId })
  if (error) throw error
}

export type FaturaAuto = { autoId: string; numero: string; data: string; valor: number; path: string; nome: string | null }

export async function registarFaturaAuto(f: FaturaAuto): Promise<void> {
  const { error } = await obrasDb.rpc('auto_registar_fatura', {
    p_auto_id: f.autoId, p_numero: f.numero, p_data: f.data, p_valor: f.valor, p_path: f.path, p_nome: f.nome,
  })
  if (error) throw error
}

export async function pagarAuto(autoId: string, referencia?: string | null, excecaoMotivo?: string | null): Promise<void> {
  const { error } = await obrasDb.rpc('marcar_auto_pago', {
    p_auto_id: autoId, p_referencia: referencia ?? null, p_excecao_motivo: excecaoMotivo ?? null,
  })
  if (error) throw error
}

export async function marcarAutoEmAtrasoRpc(autoId: string): Promise<void> {
  const { error } = await obrasDb.rpc('marcar_auto_em_atraso', { p_auto_id: autoId })
  if (error) throw error
}

export type NovoAutoRpc = { subId: string; data: string; percentagem: number; valor: number; notas?: string | null }

export async function criarAutoRpc(a: NovoAutoRpc): Promise<CriarAutoRpcRow> {
  const { data, error } = await obrasDb.rpc('criar_auto_rpc', {
    p_sub_id: a.subId, p_data: a.data, p_percentagem: a.percentagem, p_valor: a.valor, p_notas: a.notas ?? null,
  })
  if (error) throw error
  const linha = data?.[0]
  if (!linha) throw new Error('Não foi possível criar o auto.')
  return linha
}

export type LibertacaoRetencao = { subId: string; valor: number; motivo: MotivoLiberacaoRetencao; obs: string | null }

export async function libertarRetencao(l: LibertacaoRetencao): Promise<string> {
  const { data, error } = await obrasDb.rpc('sub_libertar_retencao', {
    p_sub_id: l.subId, p_valor: l.valor, p_motivo: l.motivo, p_obs: l.obs,
  })
  if (error) throw error
  return data
}

// ── Painel do CEO ────────────────────────────────────────────────────────────
export async function buscarPainelCeo(obraId: string | null): Promise<SubsPainelCeo> {
  const { data, error } = await obrasDb.rpc('subs_painel_ceo', { p_obra_id: obraId })
  if (error) throw error
  return data
}

export async function listarFluxoCaixa(obraId: string | null, semanas = 12): Promise<FluxoCaixaSemana[]> {
  const { data, error } = await obrasDb.rpc('subs_fluxo_caixa', { p_obra_id: obraId, p_semanas: semanas })
  if (error) throw error
  return data ?? []
}
