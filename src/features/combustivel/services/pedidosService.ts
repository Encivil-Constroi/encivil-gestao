import { supabase } from '@/integrations/supabase/client'
import {
  combDb,
  type AbastecimentoAnaliseRow, type ContextoRow, type EstadoPedido, type OrigemLeitura, type PedidoRow, type PrecoRow,
  type TipoCombustivel, type TipoFonte,
} from '../db'

// Projeção explícita — pump_auth_token nunca vem para o browser
const SELECT_PEDIDO = 'id, veiculo_id, veiculo_nome, funcionario_nome, data, tipo_fonte, tipo_combustivel, estado, contador, km_anterior, km_suspeito, foto_km_path, observacoes, local, solicitante_id, colaborador_id, criado_em, autorizado_em, decisao_em, motivo_recusa, contador_inicial, contador_inicial_origem, foto_contador_inicial_path, bomba_ligada_em, pump_auth_expires_at, pump_activated_at, pump_max_seconds, contador_final, contador_final_origem, foto_final_path, litros, custo_total, preco_litro, concluido_em, cancelado_em, abastecimento_id, foto_url, foto_medidor_url, litros_gemini, custo_gemini'

const numero = (v: number | string | null): number | null => (v == null ? null : Number(v))

// numeric chega como string do PostgREST em alguns casos: normalizar
function normalizar(p: PedidoRow): PedidoRow {
  return {
    ...p,
    contador: numero(p.contador), km_anterior: numero(p.km_anterior),
    contador_inicial: numero(p.contador_inicial), contador_final: numero(p.contador_final),
    litros: numero(p.litros), custo_total: numero(p.custo_total), preco_litro: numero(p.preco_litro),
    litros_gemini: numero(p.litros_gemini), custo_gemini: numero(p.custo_gemini),
  }
}

export async function fetchContexto(): Promise<ContextoRow | null> {
  const { data, error } = await combDb.rpc('meu_contexto_abastecimento')
  if (error) throw error
  const r = data?.[0]
  return r ? { ...r, km_atual: numero(r.km_atual) } : null
}

export { fetchPodeAprovar, contarAguardam } from './aprovacaoService'

export type FiltrosPedidos = {
  estados?: EstadoPedido[]
  // Só os pedidos feitos por este utilizador (a RLS já limita o motorista aos seus)
  solicitanteId?: string
  veiculoId?: string
  desde?: string   // ISO
  limite?: number
}

export async function listarPedidos(f: FiltrosPedidos = {}): Promise<PedidoRow[]> {
  let query = combDb.from('comb_abastecimentos_pendentes').select(SELECT_PEDIDO)
    .order('criado_em', { ascending: false })
    .limit(f.limite ?? 200)
  if (f.estados?.length)  query = query.in('estado', f.estados)
  if (f.solicitanteId)    query = query.eq('solicitante_id', f.solicitanteId)
  if (f.veiculoId)        query = query.eq('veiculo_id', f.veiculoId)
  if (f.desde)            query = query.gte('criado_em', f.desde)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(normalizar)
}

export async function fetchPedido(id: string): Promise<PedidoRow> {
  const { data, error } = await combDb.from('comb_abastecimentos_pendentes').select(SELECT_PEDIDO).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Pedido não encontrado')
  return normalizar(data)
}


export type NovoPedido = {
  id: string
  veiculoId: string
  tipoFonte: TipoFonte
  tipoCombustivel: TipoCombustivel
  km: number
  fotoKmPath: string
  observacoes: string | null
}

export async function criarPedido(p: NovoPedido): Promise<string> {
  const { data, error } = await combDb.rpc('criar_pedido_abastecimento', {
    p_id: p.id, p_veiculo_id: p.veiculoId, p_tipo_fonte: p.tipoFonte, p_tipo_combustivel: p.tipoCombustivel,
    p_km: p.km, p_foto_km_path: p.fotoKmPath, p_observacoes: p.observacoes,
  })
  if (error) throw error
  return data
}

export async function autorizarPedido(id: string): Promise<void> {
  const { error } = await combDb.rpc('autorizar_abastecimento', { p_id: id })
  if (error) throw error
}

export async function recusarPedido(id: string, motivo: string | null): Promise<void> {
  const { error } = await combDb.rpc('rejeitar_abastecimento', { p_id: id, p_motivo: motivo })
  if (error) throw error
}

// Registos do fluxo anterior que ficaram à espera da aprovação final
export async function aprovarRegistoAntigo(id: string): Promise<void> {
  const { error } = await combDb.rpc('aprovar_abastecimento_pendente', { p_id: id })
  if (error) throw error
}

export async function cancelarPedido(id: string): Promise<void> {
  const { error } = await combDb.rpc('cancelar_pedido_abastecimento', { p_id: id })
  if (error) throw error
}

export async function registarContadorInicial(id: string, leitura: number, fotoPath: string, origem: OrigemLeitura): Promise<void> {
  const { error } = await combDb.rpc('registar_contador_inicial', {
    p_id: id, p_leitura: leitura, p_foto_path: fotoPath, p_origem: origem,
  })
  if (error) throw error
}

export async function ligarBomba(id: string): Promise<void> {
  const { error } = await combDb.rpc('ligar_bomba', { p_id: id })
  if (error) throw error
}

export type Conclusao = {
  leituraFinal: number | null   // Polo 2
  litros: number | null         // posto de rua / carrinha
  custo: number | null          // posto de rua (talão)
  fotoPath: string
  origem: OrigemLeitura
}

export async function concluirPedido(id: string, c: Conclusao): Promise<string> {
  const { data, error } = await combDb.rpc('concluir_pedido_abastecimento', {
    p_id: id, p_leitura_final: c.leituraFinal, p_litros: c.litros, p_custo: c.custo,
    p_foto_path: c.fotoPath, p_origem: c.origem,
  })
  if (error) throw error
  return data
}

export async function listarPrecos(): Promise<PrecoRow[]> {
  const { data, error } = await combDb.from('comb_precos').select('tipo_combustivel, preco_litro, atualizado_em')
  if (error) throw error
  return (data ?? []).map(p => ({ ...p, preco_litro: Number(p.preco_litro) }))
}

export async function definirPreco(tipo: TipoCombustivel, preco: number): Promise<void> {
  const { error } = await combDb.rpc('definir_preco_combustivel', { p_tipo: tipo, p_preco: preco })
  if (error) throw error
}

export async function listarAprovadores(): Promise<string[]> {
  const { data, error } = await combDb.from('comb_aprovadores').select('user_id')
  if (error) throw error
  return (data ?? []).map(a => a.user_id)
}

export async function definirAprovador(userId: string, aprova: boolean): Promise<void> {
  const { error } = await combDb.rpc('definir_aprovador_combustivel', { p_user_id: userId, p_aprova: aprova })
  if (error) throw error
}

export type Utilizador = { id: string; nome: string; role: string }

// Só o admin lê todos os perfis (RLS profiles_select_own_or_admin)
export async function listarUtilizadores(): Promise<Utilizador[]> {
  const { data, error } = await supabase.from('profiles').select('id, nome, role').order('nome')
  if (error) throw error
  return data.map(p => ({ id: p.id, nome: p.nome ?? '—', role: p.role }))
}

export type ViaturaEscolha = { id: string; nome: string; codigo: string; identificacao: string | null; tipo_combustivel: string | null }

export async function listarViaturasAtivas(): Promise<ViaturaEscolha[]> {
  const { data, error } = await combDb.from('comb_veiculos')
    .select('id, nome, codigo, identificacao, tipo_combustivel')
    .eq('ativo', true)
    .order('nome')
  if (error) throw error
  return data ?? []
}

// Relatório: só as colunas que a análise usa, num intervalo de datas
const SELECT_ANALISE = 'id, veiculo_id, data, litros, custo_total, contador, responsavel, tipo_fonte, tipo_combustivel, solicitante_id, colaborador_id, pedido_id, comb_veiculos(nome, codigo, unidade_contador)'

export async function listarParaAnalise(inicio: string, fim: string): Promise<AbastecimentoAnaliseRow[]> {
  const { data, error } = await combDb.from('comb_abastecimentos').select(SELECT_ANALISE)
    .gte('data', inicio).lte('data', fim)
    .order('data')
    .limit(10_000)
  if (error) throw error
  return (data ?? []).map(r => ({
    ...r, litros: Number(r.litros), custo_total: Number(r.custo_total), contador: r.contador == null ? null : Number(r.contador),
  }))
}

// Abastecimentos de uma viatura desde uma data (painel pessoal de quem a conduz)
export async function listarAbastecimentosVeiculo(veiculoId: string, desde: string): Promise<AbastecimentoAnaliseRow[]> {
  const { data, error } = await combDb.from('comb_abastecimentos').select(SELECT_ANALISE)
    .eq('veiculo_id', veiculoId)
    .gte('data', desde)
    .order('data')
    .limit(500)
  if (error) throw error
  return (data ?? []).map(r => ({
    ...r, litros: Number(r.litros), custo_total: Number(r.custo_total), contador: r.contador == null ? null : Number(r.contador),
  }))
}

export async function cancelarAutorizacaoBomba(id: string): Promise<void> {
  const { error } = await combDb.rpc('cancelar_autorizacao_bomba', { p_id: id })
  if (error) throw error
}
