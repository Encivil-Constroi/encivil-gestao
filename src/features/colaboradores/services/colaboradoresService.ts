import { supabase } from '@/integrations/supabase/client'
import type { Colaborador } from '@/app/types'

// Inclui o nome da obra via join para evitar N+1
const SELECT = '*, obras(id, nome)'

type ColaboradorRow = {
  id: string
  nome: string
  numero_mecan: string
  nif: string | null
  cargo: string
  obra_id: string | null
  user_id: string | null
  ativo: boolean
  notas: string | null
  created_at: string
  obras: { id: string; nome: string } | null
}

function toColaborador(row: ColaboradorRow): Colaborador {
  return {
    id: row.id,
    nome: row.nome,
    numeroMecan: row.numero_mecan,
    nif: row.nif ?? undefined,
    cargo: row.cargo,
    obraId: row.obra_id ?? undefined,
    obraNome: row.obras?.nome ?? undefined,
    userId: row.user_id ?? undefined,
    ativo: row.ativo,
    notas: row.notas ?? undefined,
    createdAt: new Date(row.created_at),
  }
}

export async function listarColaboradores(apenasAtivos = true): Promise<Colaborador[]> {
  let query = supabase.from('colaboradores').select(SELECT).order('nome')
  if (apenasAtivos) query = query.eq('ativo', true)
  const { data, error } = await query
  if (error) throw error
  return (data as ColaboradorRow[]).map(toColaborador)
}

export async function buscarColaborador(id: string): Promise<Colaborador> {
  const { data, error } = await supabase
    .from('colaboradores')
    .select(SELECT)
    .eq('id', id)
    .single()
  if (error) throw error
  return toColaborador(data as ColaboradorRow)
}

export type NovoColaborador = {
  nome: string
  numeroMecan: string
  cargo: string
  nif?: string
  obraId?: string
  notas?: string
}

export async function criarColaborador(input: NovoColaborador): Promise<Colaborador> {
  const { data, error } = await supabase
    .from('colaboradores')
    .insert({
      nome: input.nome.trim(),
      numero_mecan: input.numeroMecan.trim(),
      cargo: input.cargo.trim(),
      nif: input.nif?.trim() || null,
      obra_id: input.obraId ?? null,
      notas: input.notas?.trim() || null,
    })
    .select(SELECT)
    .single()
  if (error) throw error
  return toColaborador(data as ColaboradorRow)
}

export type AtualizarColaborador = Partial<NovoColaborador>

type ColaboradorPatch = {
  nome?: string
  numero_mecan?: string
  cargo?: string
  nif?: string | null
  obra_id?: string | null
  notas?: string | null
}

export async function atualizarColaborador(id: string, input: AtualizarColaborador): Promise<Colaborador> {
  const patch: ColaboradorPatch = {}
  if (input.nome !== undefined)       patch.nome = input.nome.trim()
  if (input.numeroMecan !== undefined) patch.numero_mecan = input.numeroMecan.trim()
  if (input.cargo !== undefined)      patch.cargo = input.cargo.trim()
  if (input.nif !== undefined)        patch.nif = input.nif.trim() || null
  if (input.obraId !== undefined)     patch.obra_id = input.obraId || null
  if (input.notas !== undefined)      patch.notas = input.notas.trim() || null

  const { data, error } = await supabase
    .from('colaboradores')
    .update(patch)
    .eq('id', id)
    .select(SELECT)
    .single()
  if (error) throw error
  return toColaborador(data as ColaboradorRow)
}

export async function arquivarColaborador(id: string): Promise<void> {
  const { error } = await supabase
    .from('colaboradores')
    .update({ ativo: false })
    .eq('id', id)
  if (error) throw error
}

export async function restaurarColaborador(id: string): Promise<void> {
  const { error } = await supabase
    .from('colaboradores')
    .update({ ativo: true })
    .eq('id', id)
  if (error) throw error
}
