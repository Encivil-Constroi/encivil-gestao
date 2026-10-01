import { armazemDb, type ArmazemDatabase } from '@/app/lib/armazemDb'
import type { Tool, ToolCategory, ToolStatus } from '@/app/types'

type FerramentaRow = ArmazemDatabase['public']['Tables']['ferramentas']['Row']
type FerramentaUpdate = ArmazemDatabase['public']['Tables']['ferramentas']['Update']

// Ferramenta do armazém: Tool + identificação (foto, marca/modelo) e garantia.
// Datas de compra/garantia ficam em 'YYYY-MM-DD' (coluna date — sem fuso).
export type Ferramenta = Tool & {
  fotoPath?: string
  marca?: string
  modelo?: string
  nova: boolean
  dataCompra?: string
  garantiaAte?: string
}

function toFerramenta(row: FerramentaRow): Ferramenta {
  return {
    id: row.id,
    code: row.codigo,
    name: row.nome,
    category: row.categoria as ToolCategory,
    serialNumber: row.numero_serie ?? undefined,
    estimatedValue: row.valor_estimado ?? undefined,
    status: row.estado as ToolStatus,
    notes: row.observacoes ?? undefined,
    active: row.ativo,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    fotoPath: row.foto_path ?? undefined,
    marca: row.marca ?? undefined,
    modelo: row.modelo ?? undefined,
    nova: row.nova ?? false,
    dataCompra: row.data_compra ?? undefined,
    garantiaAte: row.garantia_ate ?? undefined,
  }
}

// O índice único do n.º de série devolve 23505; a mensagem genérica não diz qual campo
function erroFerramenta(error: { code?: string; message: string }): Error | typeof error {
  if (error.code === '23505') return new Error('Já existe outra ferramenta com este n.º de série.')
  return error
}

export async function listarFerramentas(apenasAtivas = true): Promise<Ferramenta[]> {
  let query = armazemDb.from('ferramentas').select('*').order('nome')
  if (apenasAtivas) query = query.eq('ativo', true)
  const { data, error } = await query
  if (error) throw error
  return data.map(toFerramenta)
}

export async function buscarFerramenta(id: string): Promise<Ferramenta> {
  const { data, error } = await armazemDb.from('ferramentas').select('*').eq('id', id).single()
  if (error) throw error
  return toFerramenta(data)
}

export async function listarFerramentasArquivadas(): Promise<Ferramenta[]> {
  const { data, error } = await armazemDb.from('ferramentas').select('*').eq('ativo', false).order('nome')
  if (error) throw error
  return data.map(toFerramenta)
}

// 'code' nunca aparece aqui — é gerado pela coluna (DEFAULT nextval) e imutável.
// 'id' é opcional: o formulário gera-o no browser para a foto poder ser enviada antes do INSERT.
export type NovaFerramenta = {
  id?: string
  name: string
  category: ToolCategory
  serialNumber?: string
  estimatedValue?: number
  notes?: string
  fotoPath?: string | null
  marca?: string
  modelo?: string
  nova?: boolean
  dataCompra?: string | null
  garantiaAte?: string | null
}

export async function criarFerramenta(input: NovaFerramenta): Promise<Ferramenta> {
  const { data, error } = await armazemDb
    .from('ferramentas')
    .insert({
      ...(input.id ? { id: input.id } : {}),
      nome: input.name,
      categoria: input.category,
      numero_serie: input.serialNumber?.trim() || null,
      valor_estimado: input.estimatedValue ?? null,
      observacoes: input.notes ?? null,
      foto_path: input.fotoPath ?? null,
      marca: input.marca?.trim() || null,
      modelo: input.modelo?.trim() || null,
      nova: input.nova ?? false,
      data_compra: input.dataCompra ?? null,
      garantia_ate: input.garantiaAte ?? null,
    })
    .select('*')
    .single()
  if (error) throw erroFerramenta(error)
  return toFerramenta(data)
}

export type AtualizarFerramenta = Partial<Omit<NovaFerramenta, 'id'>>

export async function atualizarFerramenta(id: string, input: AtualizarFerramenta): Promise<Ferramenta> {
  const update: FerramentaUpdate = {}
  if (input.name !== undefined) update.nome = input.name
  if (input.category !== undefined) update.categoria = input.category
  if (input.serialNumber !== undefined) update.numero_serie = input.serialNumber.trim() || null
  if (input.estimatedValue !== undefined) update.valor_estimado = input.estimatedValue ?? null
  if (input.notes !== undefined) update.observacoes = input.notes
  if (input.fotoPath !== undefined) update.foto_path = input.fotoPath
  if (input.marca !== undefined) update.marca = input.marca.trim() || null
  if (input.modelo !== undefined) update.modelo = input.modelo.trim() || null
  if (input.nova !== undefined) update.nova = input.nova
  if (input.dataCompra !== undefined) update.data_compra = input.dataCompra
  if (input.garantiaAte !== undefined) update.garantia_ate = input.garantiaAte

  const { data, error } = await armazemDb
    .from('ferramentas')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw erroFerramenta(error)
  return toFerramenta(data)
}

// Escapa os curingas do ILIKE: o n.º de série compara-se literalmente (sem maiúsculas)
function literalIlike(s: string): string {
  return s.replace(/[\\%_]/g, c => `\\${c}`)
}

export type FerramentaComSerie = Pick<Ferramenta, 'id' | 'code' | 'name'>

export async function procurarNumeroSerie(serie: string, excluirId?: string): Promise<FerramentaComSerie | null> {
  const s = serie.trim()
  if (!s) return null
  let q = armazemDb.from('ferramentas').select('id, codigo, nome').ilike('numero_serie', literalIlike(s)).limit(1)
  if (excluirId) q = q.neq('id', excluirId)
  const { data, error } = await q
  if (error) throw error
  const r = data[0]
  return r ? { id: r.id, code: r.codigo, name: r.nome } : null
}

export async function arquivarFerramenta(id: string): Promise<void> {
  const { error } = await armazemDb.from('ferramentas').update({ ativo: false }).eq('id', id)
  if (error) throw error
}

export async function restaurarFerramenta(id: string): Promise<void> {
  const { error } = await armazemDb.from('ferramentas').update({ ativo: true }).eq('id', id)
  if (error) throw error
}

export async function gerarCodigoFerramentaPreview(): Promise<string> {
  const { data, error } = await armazemDb.rpc('gerar_codigo_ferramenta')
  if (error) throw error
  return data as string
}
