import { supabase } from '@/integrations/supabase/client'
import { armazemDb, type ArmazemDatabase, type SubtipoMovimento } from '@/app/lib/armazemDb'
import type { MovementType, Product, ProductCategory, Unit } from '@/app/types'
import { calcStatus } from '@/app/lib/stockUtils'

type Tabelas = ArmazemDatabase['public']['Tables']
type ProdutoRow = Tabelas['produtos']['Row']
type ProdutoUpdate = Tabelas['produtos']['Update']

// Produto com os campos do armazém completo (foto e localização). Continua a ser
// um Product, por isso os ecrãs antigos que só leem Product não mudam.
export type ProdutoArmazem = Product & {
  fotoPath: string | null
  localizacao: string | null
}

function toProduct(row: ProdutoRow): ProdutoArmazem {
  return {
    id: row.id,
    code: row.codigo,
    name: row.nome,
    category: row.categoria as ProductCategory,
    unit: row.unidade as Unit,
    currentStock: row.stock_atual,
    minStock: row.stock_minimo,
    unitCost: Number(row.custo_unitario ?? 0),
    status: calcStatus(row.stock_atual, row.stock_minimo),
    notes: row.observacoes ?? undefined,
    fotoPath: row.foto_path ?? null,
    localizacao: row.localizacao ?? null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export async function listarProdutos(apenasAtivos = true): Promise<ProdutoArmazem[]> {
  let query = armazemDb.from('produtos').select('*').order('nome')
  if (apenasAtivos) query = query.eq('ativo', true)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(toProduct)
}

export async function buscarProduto(id: string): Promise<ProdutoArmazem> {
  const { data, error } = await armazemDb
    .from('produtos')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return toProduct(data)
}

// Só pré-visualização: não consome a sequência. O código real é atribuído pela
// coluna (DEFAULT com nextval) no INSERT e é imutável depois.
export async function previsualizarCodigoProduto(): Promise<string> {
  const { data, error } = await supabase.rpc('gerar_codigo_produto')
  if (error) throw error
  return data
}

export type NovoProduto = {
  // Gerado no browser quando a foto é tirada antes de o artigo existir: a
  // política do bucket exige produtos/<id>/..., por isso o INSERT usa o mesmo id
  id?: string
  name: string
  category: ProductCategory
  unit: Unit
  currentStock: number
  minStock: number
  unitCost?: number
  notes?: string
  fotoPath?: string | null
  localizacao?: string | null
}

export async function criarProduto(input: NovoProduto): Promise<ProdutoArmazem> {
  const { data, error } = await armazemDb
    .from('produtos')
    .insert({
      ...(input.id ? { id: input.id } : {}),
      nome: input.name,
      categoria: input.category,
      unidade: input.unit,
      stock_atual: input.currentStock,
      stock_minimo: input.minStock,
      custo_unitario: input.unitCost ?? 0,
      observacoes: input.notes ?? null,
      foto_path: input.fotoPath ?? null,
      localizacao: input.localizacao ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return toProduct(data)
}

// O stock nunca se altera por aqui — só por movimentos (auditados)
export type AtualizarProduto = Partial<Omit<NovoProduto, 'id' | 'currentStock'>>

export async function atualizarProduto(id: string, input: AtualizarProduto): Promise<ProdutoArmazem> {
  const update: ProdutoUpdate = {}
  if (input.name !== undefined) update.nome = input.name
  if (input.category !== undefined) update.categoria = input.category
  if (input.unit !== undefined) update.unidade = input.unit
  if (input.minStock !== undefined) update.stock_minimo = input.minStock
  if (input.unitCost !== undefined) update.custo_unitario = input.unitCost
  if (input.notes !== undefined) update.observacoes = input.notes
  if (input.fotoPath !== undefined) update.foto_path = input.fotoPath
  if (input.localizacao !== undefined) update.localizacao = input.localizacao

  const { data, error } = await armazemDb
    .from('produtos')
    .update(update)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return toProduct(data)
}

export async function listarProdutosArquivados(): Promise<ProdutoArmazem[]> {
  const { data, error } = await armazemDb
    .from('produtos')
    .select('*')
    .eq('ativo', false)
    .order('nome')
  if (error) throw error
  return (data ?? []).map(toProduct)
}

export async function desativarProduto(id: string): Promise<void> {
  const { error } = await supabase
    .from('produtos')
    .update({ ativo: false })
    .eq('id', id)
  if (error) throw error
}

export async function restaurarProduto(id: string): Promise<void> {
  const { error } = await supabase
    .from('produtos')
    .update({ ativo: true })
    .eq('id', id)
  if (error) throw error
}

export async function deletarProduto(id: string): Promise<void> {
  const { error } = await supabase
    .from('produtos')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ── Histórico de movimentos de um artigo (com o tipo detalhado) ──────────────

const SELECT_MOVIMENTO = '*, obras(nome)'

export type MovimentoArtigo = {
  id: string
  tipo: MovementType
  subtipo: SubtipoMovimento | null
  quantidade: number
  stockAntes: number
  stockDepois: number
  responsavel: string
  obraId: string | null
  obraNome: string | null
  destino: string | null
  fornecedor: string | null
  cliente: string | null
  numeroFatura: string | null
  precoUnitario: number | null
  observacoes: string | null
  data: Date
}

export async function listarMovimentosProduto(produtoId: string, limite = 50): Promise<MovimentoArtigo[]> {
  const { data, error } = await armazemDb
    .from('movimentos_stock')
    .select(SELECT_MOVIMENTO)
    .eq('produto_id', produtoId)
    .order('created_at', { ascending: false })
    .limit(limite)
  if (error) throw error
  return (data ?? []).map(r => ({
    id: r.id,
    tipo: r.tipo,
    subtipo: r.subtipo ?? null,
    quantidade: r.quantidade,
    stockAntes: r.stock_antes,
    stockDepois: r.stock_depois,
    responsavel: r.responsavel,
    obraId: r.obra_id,
    obraNome: r.obras?.nome ?? null,
    destino: r.destino_obra,
    fornecedor: r.fornecedor ?? null,
    cliente: r.cliente ?? null,
    numeroFatura: r.numero_fatura ?? null,
    precoUnitario: r.preco_unitario == null ? null : Number(r.preco_unitario),
    observacoes: r.observacoes,
    data: new Date(r.created_at),
  }))
}
