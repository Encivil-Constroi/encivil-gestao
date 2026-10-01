import { armazemDb, type SubtipoMovimento, type MaterialObraRow } from '@/app/lib/armazemDb'
import type { MovementType } from '@/app/types'

// ── Artigos (para escolher no formulário e para a visão geral) ───────────────

export type ArtigoArmazem = {
  id: string
  nome: string
  codigo: string
  unidade: string
  stockAtual: number
  stockMinimo: number
  custoUnitario: number
  fotoPath: string | null
}

const SELECT_ARTIGO = 'id, nome, codigo, unidade, stock_atual, stock_minimo, custo_unitario, foto_path'

type ArtigoRow = {
  id: string; nome: string; codigo: string; unidade: string
  stock_atual: number; stock_minimo: number; custo_unitario: number; foto_path: string | null
}

function toArtigo(r: ArtigoRow): ArtigoArmazem {
  return {
    id: r.id, nome: r.nome, codigo: r.codigo, unidade: r.unidade,
    stockAtual: Number(r.stock_atual), stockMinimo: Number(r.stock_minimo),
    custoUnitario: Number(r.custo_unitario ?? 0), fotoPath: r.foto_path,
  }
}

export async function listarArtigosArmazem(): Promise<ArtigoArmazem[]> {
  const { data, error } = await armazemDb.from('produtos').select(SELECT_ARTIGO).eq('ativo', true).order('nome')
  if (error) throw error
  return (data as ArtigoRow[]).map(toArtigo)
}

// ── Registar movimento (RPC registar_movimento_armazem) ───────────────────────

export type RegistarMovimentoArmazemInput = {
  produtoId: string
  subtipo: SubtipoMovimento
  quantidade: number
  responsavel: string
  obraId?: string | null
  fornecedor?: string | null
  numeroFatura?: string | null
  cliente?: string | null
  precoUnitario?: number | null
  observacoes?: string | null
}

// Todos os argumentos vão sempre (null quando não se aplicam): o PostgREST
// escolhe a função pelo conjunto de nomes, e assim o contrato é verificável.
export function argsMovimentoArmazem(i: RegistarMovimentoArmazemInput) {
  return {
    p_produto_id: i.produtoId,
    p_subtipo: i.subtipo,
    p_quantidade: i.quantidade,
    p_responsavel: i.responsavel,
    p_obra_id: i.obraId ?? null,
    p_fornecedor: i.fornecedor ?? null,
    p_numero_fatura: i.numeroFatura ?? null,
    p_cliente: i.cliente ?? null,
    p_preco_unitario: i.precoUnitario ?? null,
    p_observacoes: i.observacoes ?? null,
  }
}

export async function registarMovimentoArmazem(input: RegistarMovimentoArmazemInput): Promise<void> {
  const { error } = await armazemDb.rpc('registar_movimento_armazem', argsMovimentoArmazem(input))
  if (error) throw error
}

export async function listarFornecedoresUsados(): Promise<string[]> {
  const { data, error } = await armazemDb.from('movimentos_stock')
    .select('fornecedor')
    .not('fornecedor', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  const vistos = new Map<string, string>()
  for (const r of data as { fornecedor: string | null }[]) {
    const f = r.fornecedor?.trim()
    if (f && !vistos.has(f.toLowerCase())) vistos.set(f.toLowerCase(), f)
  }
  return [...vistos.values()]
}

// ── Histórico ────────────────────────────────────────────────────────────────

export type MovimentoArmazem = {
  id: string
  produtoId: string
  produtoNome: string
  produtoCodigo: string
  unidade: string
  fotoPath: string | null
  tipo: MovementType
  subtipo: SubtipoMovimento | null
  quantidade: number
  stockAntes: number
  stockDepois: number
  responsavel: string
  destino: string | null
  obraId: string | null
  obraNome: string | null
  fornecedor: string | null
  cliente: string | null
  numeroFatura: string | null
  precoUnitario: number | null
  observacoes: string | null
  data: Date
}

const SELECT_MOV = 'id, produto_id, tipo, subtipo, quantidade, stock_antes, stock_depois, responsavel, destino_obra, obra_id, ' +
  'fornecedor, cliente, numero_fatura, preco_unitario, observacoes, created_at, ' +
  'produtos(nome, codigo, unidade, foto_path), obras(nome)'

type MovRow = {
  id: string; produto_id: string; tipo: MovementType; subtipo: SubtipoMovimento | null
  quantidade: number; stock_antes: number; stock_depois: number; responsavel: string
  destino_obra: string | null; obra_id: string | null; fornecedor: string | null; cliente: string | null
  numero_fatura: string | null; preco_unitario: number | null; observacoes: string | null; created_at: string
  produtos: { nome: string; codigo: string; unidade: string; foto_path: string | null } | null
  obras: { nome: string } | null
}

function toMovimento(r: MovRow): MovimentoArmazem {
  return {
    id: r.id, produtoId: r.produto_id,
    produtoNome: r.produtos?.nome ?? '', produtoCodigo: r.produtos?.codigo ?? '',
    unidade: r.produtos?.unidade ?? '', fotoPath: r.produtos?.foto_path ?? null,
    tipo: r.tipo, subtipo: r.subtipo,
    quantidade: Number(r.quantidade), stockAntes: Number(r.stock_antes), stockDepois: Number(r.stock_depois),
    responsavel: r.responsavel, destino: r.destino_obra, obraId: r.obra_id, obraNome: r.obras?.nome ?? null,
    fornecedor: r.fornecedor, cliente: r.cliente, numeroFatura: r.numero_fatura,
    precoUnitario: r.preco_unitario == null ? null : Number(r.preco_unitario),
    observacoes: r.observacoes, data: new Date(r.created_at),
  }
}

export type FiltrosMovArmazem = {
  desde?: string        // ISO
  ate?: string          // ISO (exclusivo)
  tipo?: MovementType
  subtipo?: SubtipoMovimento
  obraId?: string
  produtoId?: string
  pesquisa?: string
}

export const POR_PAGINA = 50
const MAX_EXPORTAR = 5000

// Vírgulas e parênteses partem a sintaxe do .or() do PostgREST
function limparPesquisa(t: string): string {
  return t.replace(/[,()*%\\]/g, ' ').trim()
}

function consultaMovimentos(f: FiltrosMovArmazem, comTotal: boolean) {
  let q = armazemDb.from('movimentos_stock')
    .select(SELECT_MOV, comTotal ? { count: 'exact' } : undefined)
    .order('created_at', { ascending: false })
  if (f.desde)     q = q.gte('created_at', f.desde)
  if (f.ate)       q = q.lt('created_at', f.ate)
  if (f.tipo)      q = q.eq('tipo', f.tipo)
  if (f.subtipo)   q = q.eq('subtipo', f.subtipo)
  if (f.obraId)    q = q.eq('obra_id', f.obraId)
  if (f.produtoId) q = q.eq('produto_id', f.produtoId)
  const termo = f.pesquisa ? limparPesquisa(f.pesquisa) : ''
  if (termo) {
    q = q.or(['fornecedor', 'cliente', 'numero_fatura', 'responsavel', 'destino_obra', 'observacoes']
      .map(c => `${c}.ilike.*${termo}*`).join(','))
  }
  return q
}

export async function listarMovimentosArmazem(
  f: FiltrosMovArmazem = {}, pagina = 0, porPagina = POR_PAGINA,
): Promise<{ movimentos: MovimentoArmazem[]; total: number }> {
  const de = pagina * porPagina
  const { data, error, count } = await consultaMovimentos(f, true).range(de, de + porPagina - 1)
  if (error) throw error
  return { movimentos: (data as unknown as MovRow[]).map(toMovimento), total: count ?? 0 }
}

export async function exportarMovimentosArmazem(f: FiltrosMovArmazem = {}): Promise<MovimentoArmazem[]> {
  const { data, error } = await consultaMovimentos(f, false).limit(MAX_EXPORTAR)
  if (error) throw error
  return (data as unknown as MovRow[]).map(toMovimento)
}

// ── O que está em cada obra ──────────────────────────────────────────────────

export type MaterialObra = {
  obraId: string; obraNome: string; obraEstado: string
  produtoId: string; produtoNome: string; produtoCodigo: string; unidade: string; fotoPath: string | null
  enviado: number; devolvido: number; liquido: number; valor: number; ultimoMovimento: Date
}

export async function listarMateriaisPorObra(): Promise<MaterialObra[]> {
  const { data, error } = await armazemDb.rpc('armazem_materiais_por_obra', { p_obra_id: null })
  if (error) throw error
  return ((data ?? []) as MaterialObraRow[]).map(r => ({
    obraId: r.obra_id, obraNome: r.obra_nome, obraEstado: r.obra_estado,
    produtoId: r.produto_id, produtoNome: r.produto_nome, produtoCodigo: r.produto_codigo,
    unidade: r.unidade, fotoPath: r.foto_path,
    enviado: Number(r.enviado), devolvido: Number(r.devolvido), liquido: Number(r.liquido),
    valor: Number(r.valor ?? 0), ultimoMovimento: new Date(r.ultimo_movimento),
  }))
}

export type EmprestimoAtivo = {
  id: string
  ferramentaId: string
  ferramentaNome: string
  ferramentaCodigo: string
  fotoPath: string | null
  funcionario: string
  desde: Date
  previstaDevolucao: string | null   // YYYY-MM-DD
  obraId: string | null
  destino: string | null
}

const SELECT_EMP = 'id, ferramenta_id, funcionario_nome, data_emprestimo, data_prevista_devolucao, obra_id, destino_obra, ' +
  'ferramentas(nome, codigo, foto_path)'

type EmpRow = {
  id: string; ferramenta_id: string; funcionario_nome: string; data_emprestimo: string
  data_prevista_devolucao: string | null; obra_id: string | null; destino_obra: string | null
  ferramentas: { nome: string; codigo: string; foto_path: string | null } | null
}

export async function listarEmprestimosAtivos(): Promise<EmprestimoAtivo[]> {
  const { data, error } = await armazemDb.from('emprestimos_ferramentas')
    .select(SELECT_EMP).eq('estado', 'ativo').order('data_emprestimo', { ascending: true })
  if (error) throw error
  return (data as unknown as EmpRow[]).map(r => ({
    id: r.id, ferramentaId: r.ferramenta_id,
    ferramentaNome: r.ferramentas?.nome ?? '', ferramentaCodigo: r.ferramentas?.codigo ?? '',
    fotoPath: r.ferramentas?.foto_path ?? null, funcionario: r.funcionario_nome,
    desde: new Date(r.data_emprestimo), previstaDevolucao: r.data_prevista_devolucao,
    obraId: r.obra_id, destino: r.destino_obra,
  }))
}

export type GarantiaFerramenta = { id: string; nome: string; codigo: string; garantiaAte: string; fotoPath: string | null }

export async function listarGarantiasFerramentas(): Promise<GarantiaFerramenta[]> {
  const { data, error } = await armazemDb.from('ferramentas')
    .select('id, nome, codigo, garantia_ate, foto_path')
    .eq('ativo', true).not('garantia_ate', 'is', null)
    .order('garantia_ate', { ascending: true })
  if (error) throw error
  return (data as { id: string; nome: string; codigo: string; garantia_ate: string | null; foto_path: string | null }[])
    .flatMap(r => r.garantia_ate ? [{ id: r.id, nome: r.nome, codigo: r.codigo, garantiaAte: r.garantia_ate, fotoPath: r.foto_path }] : [])
}
