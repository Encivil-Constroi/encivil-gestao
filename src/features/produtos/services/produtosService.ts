import { supabase } from '@/integrations/supabase/client'
import type { TablesUpdate } from '@/integrations/supabase/types'
import type { Product, ProductCategory, Unit } from '@/app/types'
import { calcStatus } from '@/app/lib/stockUtils'

type ProdutoRow = {
  id: string
  codigo: string
  nome: string
  categoria: string
  unidade: string
  stock_atual: number
  stock_minimo: number
  custo_unitario: number
  ativo: boolean
  observacoes: string | null
  created_at: string
  updated_at: string
}

function toProduct(row: ProdutoRow): Product {
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
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export async function listarProdutos(apenasAtivos = true): Promise<Product[]> {
  let query = supabase.from('produtos').select('*').order('nome')
  if (apenasAtivos) query = query.eq('ativo', true)
  const { data, error } = await query
  if (error) throw error
  return (data as ProdutoRow[]).map(toProduct)
}

export async function buscarProduto(id: string): Promise<Product> {
  const { data, error } = await supabase
    .from('produtos')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return toProduct(data as ProdutoRow)
}

// 'code' nunca aparece aqui — código é gerado automaticamente pela coluna
// (DEFAULT com nextval) no momento do INSERT, e é imutável após criação.
export type NovoProduto = {
  name: string
  category: ProductCategory
  unit: Unit
  currentStock: number
  minStock: number
  unitCost?: number
  notes?: string
}

export async function criarProduto(input: NovoProduto): Promise<Product> {
  const { data, error } = await supabase
    .from('produtos')
    .insert({
      nome: input.name,
      categoria: input.category,
      unidade: input.unit,
      stock_atual: input.currentStock,
      stock_minimo: input.minStock,
      custo_unitario: input.unitCost ?? 0,
      observacoes: input.notes ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return toProduct(data as ProdutoRow)
}

export type AtualizarProduto = Partial<NovoProduto>

export async function atualizarProduto(id: string, input: AtualizarProduto): Promise<Product> {
  const update: Record<string, unknown> = {}
  if (input.name !== undefined) update.nome = input.name
  if (input.category !== undefined) update.categoria = input.category
  if (input.unit !== undefined) update.unidade = input.unit
  if (input.minStock !== undefined) update.stock_minimo = input.minStock
  if (input.unitCost !== undefined) update.custo_unitario = input.unitCost
  if (input.notes !== undefined) update.observacoes = input.notes

  const { data, error } = await supabase
    .from('produtos')
    .update(update as TablesUpdate<'produtos'>)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return toProduct(data as ProdutoRow)
}

export async function listarProdutosArquivados(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('produtos')
    .select('*')
    .eq('ativo', false)
    .order('nome')
  if (error) throw error
  return (data as ProdutoRow[]).map(toProduct)
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
