import { supabase } from '@/integrations/supabase/client'
import { reduzirFoto } from '@/app/lib/reduzirFoto'
import {
  frotaDb,
  type ItemCatalogoRow, type VeiculoItemRow, type ManutencaoRow, type ChecklistRow,
  type AtribuicaoRow, type ResumoViaturaRow, type Categoria, type Natureza, type EstadoItem,
} from '../db'

// ── Catálogo ─────────────────────────────────────────────────────────────────
const SELECT_CATALOGO = 'id, chave, rotulo, categoria, natureza, intervalo_km_padrao, intervalo_meses_padrao, limiar_atencao_km, limiar_urgente_km, limiar_atencao_dias, limiar_urgente_dias, ordem, ativo, criado_por, criado_em, atualizado_em'

export async function listarCatalogo(): Promise<ItemCatalogoRow[]> {
  const { data, error } = await frotaDb
    .from('frota_itens_catalogo')
    .select(SELECT_CATALOGO)
    .order('categoria')
    .order('ordem')
    .order('rotulo')
  if (error) throw error
  return data
}

export type DadosItemCatalogo = {
  rotulo: string
  categoria: Categoria
  natureza: Natureza
  intervaloKm: number | null
  intervaloMeses: number | null
  limiarAtencaoKm: number
  limiarUrgenteKm: number
  limiarAtencaoDias: number
  limiarUrgenteDias: number
  ativo: boolean
}

// Chave estável derivada do rótulo: "Óleo do motor" → "oleo_do_motor"
export function chaveDeRotulo(rotulo: string): string {
  return rotulo
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'item'
}

function colunasItem(d: DadosItemCatalogo) {
  const manutencao = d.natureza === 'MANUTENCAO'
  return {
    rotulo: d.rotulo.trim(),
    categoria: d.categoria,
    natureza: d.natureza,
    // itens de checklist não têm prazo (a base de dados recusa-o)
    intervalo_km_padrao:    manutencao ? d.intervaloKm : null,
    intervalo_meses_padrao: manutencao ? d.intervaloMeses : null,
    limiar_atencao_km:   d.limiarAtencaoKm,
    limiar_urgente_km:   d.limiarUrgenteKm,
    limiar_atencao_dias: d.limiarAtencaoDias,
    limiar_urgente_dias: d.limiarUrgenteDias,
    ativo: d.ativo,
  }
}

export async function criarItemCatalogo(d: DadosItemCatalogo): Promise<ItemCatalogoRow> {
  const { data, error } = await frotaDb
    .from('frota_itens_catalogo')
    .insert({ ...colunasItem(d), chave: `${chaveDeRotulo(d.rotulo)}_${Date.now().toString(36)}` })
    .select(SELECT_CATALOGO)
    .single()
  if (error) throw error
  return data
}

export async function atualizarItemCatalogo(id: string, d: DadosItemCatalogo): Promise<ItemCatalogoRow> {
  const { data, error } = await frotaDb
    .from('frota_itens_catalogo')
    .update(colunasItem(d))
    .eq('id', id)
    .select(SELECT_CATALOGO)
    .single()
  if (error) throw error
  return data
}

// ── Viaturas ─────────────────────────────────────────────────────────────────
export async function listarResumoViaturas(): Promise<ResumoViaturaRow[]> {
  const { data, error } = await frotaDb.rpc('frota_resumo_viaturas')
  if (error) throw error
  return data ?? []
}

const SELECT_FVI = 'id, veiculo_id, item_id, ativo, intervalo_km, intervalo_meses, proxima_km, proxima_data, ultima_km, ultima_data, atualizado_por, atualizado_em'
const SELECT_MANUTENCAO = 'id, veiculo_id, item_id, descricao, data, km_na_altura, custo, oficina, observacoes, atualiza_proxima, condutor_id, criado_por, criado_em'
const SELECT_CHECKLIST = 'id, veiculo_id, data, km_na_altura, itens, estado_geral, observacoes, foto_keys, condutor_id, criado_por, criado_em'

export type AlertaItem = { entidade_id: string; severidade: 'ATENCAO' | 'URGENTE'; estado: string }

export type FichaViatura = {
  viatura: { id: string; codigo: string; nome: string; identificacao: string | null; tipo: string; unidadeContador: string }
  kmAtual: number | null
  itens: VeiculoItemRow[]
  alertas: AlertaItem[]
  manutencoes: ManutencaoRow[]
  checklists: ChecklistRow[]
  atribuicoes: AtribuicaoRow[]
  colaboradores: Map<string, string>
}

// Tudo o que a ficha mostra, em pedidos paralelos (um por tabela, nunca por linha)
export async function carregarFicha(veiculoId: string): Promise<FichaViatura> {
  const [v, km, itens, manut, check, atrib] = await Promise.all([
    supabase.from('comb_veiculos').select('id, codigo, nome, identificacao, tipo, unidade_contador').eq('id', veiculoId).single(),
    frotaDb.rpc('km_atual_veiculo', { p_veiculo_id: veiculoId }),
    frotaDb.from('frota_veiculo_itens').select(SELECT_FVI).eq('veiculo_id', veiculoId),
    frotaDb.from('veiculo_manutencoes').select(SELECT_MANUTENCAO).eq('veiculo_id', veiculoId)
      .order('data', { ascending: false }).order('criado_em', { ascending: false }).limit(100),
    frotaDb.from('veiculo_checklists').select(SELECT_CHECKLIST).eq('veiculo_id', veiculoId)
      .order('data', { ascending: false }).order('criado_em', { ascending: false }).limit(30),
    frotaDb.from('veiculo_atribuicoes').select('id, veiculo_id, colaborador_id, desde, ate, criado_por, criado_em')
      .eq('veiculo_id', veiculoId).order('desde', { ascending: false }),
  ])
  for (const r of [v, km, itens, manut, check, atrib]) if (r.error) throw r.error

  const fviIds = (itens.data ?? []).map(i => i.id)
  const alertas = fviIds.length
    ? await supabase.from('alertas').select('entidade_id, severidade, estado')
        .in('entidade_id', fviIds).in('estado', ['ATIVO', 'RECONHECIDO'])
    : { data: [], error: null }
  if (alertas.error) throw alertas.error

  const idsColab = [...new Set([
    ...(atrib.data ?? []).map(a => a.colaborador_id),
    ...(manut.data ?? []).map(m => m.condutor_id),
    ...(check.data ?? []).map(c => c.condutor_id),
  ].filter((x): x is string => !!x))]
  const colab = idsColab.length
    ? await supabase.from('colaboradores').select('id, nome').in('id', idsColab)
    : { data: [], error: null }
  if (colab.error) throw colab.error

  const vv = v.data!
  return {
    viatura: {
      id: vv.id, codigo: vv.codigo, nome: vv.nome, identificacao: vv.identificacao,
      tipo: vv.tipo, unidadeContador: vv.unidade_contador,
    },
    kmAtual: km.data ?? null,
    itens: itens.data ?? [],
    alertas: (alertas.data ?? []) as AlertaItem[],
    manutencoes: manut.data ?? [],
    checklists: check.data ?? [],
    atribuicoes: atrib.data ?? [],
    colaboradores: new Map((colab.data ?? []).map(c => [c.id, c.nome])),
  }
}

export async function listarColaboradoresAtivos(): Promise<{ id: string; nome: string }[]> {
  const { data, error } = await supabase.from('colaboradores').select('id, nome').eq('ativo', true).order('nome')
  if (error) throw error
  return data
}

// ── Escritas (todas por RPC: permissões e regras vivem no Postgres) ─────────
export async function configurarItem(a: {
  veiculoId: string; itemId: string; ativo: boolean
  intervaloKm: number | null; intervaloMeses: number | null
  proximaKm: number | null; proximaData: string | null
}): Promise<string> {
  const { data, error } = await frotaDb.rpc('configurar_item_veiculo', {
    p_veiculo_id: a.veiculoId, p_item_id: a.itemId, p_ativo: a.ativo,
    p_intervalo_km: a.intervaloKm, p_intervalo_meses: a.intervaloMeses,
    p_proxima_km: a.proximaKm, p_proxima_data: a.proximaData,
  })
  if (error) throw error
  return data
}

export async function registarManutencao(a: {
  veiculoId: string; itemId: string | null; descricao: string | null; data: string
  km: number | null; custo: number | null; oficina: string | null; observacoes: string | null
  atualizaProxima: boolean; proximaData: string | null
}): Promise<string> {
  const { data, error } = await frotaDb.rpc('registar_manutencao', {
    p_veiculo_id: a.veiculoId, p_item_id: a.itemId, p_descricao: a.descricao, p_data: a.data,
    p_km: a.km, p_custo: a.custo, p_oficina: a.oficina, p_observacoes: a.observacoes,
    p_atualiza: a.atualizaProxima, p_proxima_data: a.proximaData,
  })
  if (error) throw error
  return data
}

const BUCKET_FOTOS = 'frota-checklists'
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' }

// Caminho aceite pela política de upload (public.foto_frota_valida)
export function caminhoFotoChecklist(veiculoId: string, tipoMime: string, id = crypto.randomUUID()): string {
  return `${veiculoId}/${id}.${EXT[tipoMime] ?? 'jpg'}`
}

export function urlFotoChecklist(caminho: string): string {
  return supabase.storage.from(BUCKET_FOTOS).getPublicUrl(caminho).data.publicUrl
}

export async function registarChecklist(a: {
  veiculoId: string; data: string; km: number | null
  itens: { itemId: string; estado: EstadoItem; observacao: string }[]
  observacoes: string | null; fotos: File[]
}): Promise<string> {
  const caminhos: string[] = []
  for (const foto of a.fotos) {
    const envio = await reduzirFoto(foto)
    const tipo = EXT[envio.type] ? envio.type : 'image/jpeg'
    const caminho = caminhoFotoChecklist(a.veiculoId, tipo)
    const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(caminho, envio, { contentType: tipo, upsert: false })
    if (error) throw error
    caminhos.push(caminho)
  }

  const { data, error } = await frotaDb.rpc('registar_checklist', {
    p_veiculo_id: a.veiculoId, p_data: a.data, p_km: a.km,
    p_itens: a.itens.map(i => ({ item_id: i.itemId, estado: i.estado, observacao: i.observacao.trim() || null })),
    p_observacoes: a.observacoes, p_foto_keys: caminhos,
  })
  if (error) throw error
  return data
}

export async function atribuirCondutor(veiculoId: string, colaboradorId: string | null, desde: string): Promise<string | null> {
  const { data, error } = await frotaDb.rpc('atribuir_condutor', {
    p_veiculo_id: veiculoId, p_colaborador_id: colaboradorId, p_desde: desde,
  })
  if (error) throw error
  return data
}

export async function avaliarFrota(): Promise<number> {
  const { data, error } = await frotaDb.rpc('avaliar_frota', {})
  if (error) throw error
  return data
}

// ── Destinatários das notificações (só admin) ────────────────────────────────
export async function listarDestinatarios(): Promise<string[]> {
  const { data, error } = await frotaDb.from('frota_alerta_destinatarios').select('user_id')
  if (error) throw error
  return data.map(d => d.user_id)
}

export async function listarUtilizadores(): Promise<{ id: string; nome: string; role: string }[]> {
  const { data, error } = await supabase.from('profiles').select('id, nome, role').order('nome')
  if (error) throw error
  return data.map(p => ({ id: p.id, nome: p.nome ?? '—', role: p.role }))
}

export async function adicionarDestinatario(userId: string): Promise<true> {
  const { error } = await frotaDb.from('frota_alerta_destinatarios').insert({ user_id: userId })
  if (error) throw error
  return true
}

export async function removerDestinatario(userId: string): Promise<true> {
  const { error } = await frotaDb.from('frota_alerta_destinatarios').delete().eq('user_id', userId)
  if (error) throw error
  return true
}
