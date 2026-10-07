import { supabase } from '@/integrations/supabase/client'
import { colaboradoresDb } from '../db'
import type { Colaborador } from '@/app/types'

// Colunas explícitas: authenticated não tem SELECT em nif (20261008030000);
// o NIF lê-se só com obterNif(). Inclui o nome da obra via join (sem N+1).
export const SELECT_COLABORADOR =
  'id, nome, numero_mecan, cargo, obra_id, user_id, ativo, notas, telemovel, email, foto_path, setor, created_at, obras(id, nome)'

type ColaboradorRow = {
  id: string
  nome: string
  numero_mecan: string
  cargo: string
  obra_id: string | null
  user_id: string | null
  ativo: boolean
  notas: string | null
  telemovel: string | null
  email: string | null
  foto_path: string | null
  setor: string | null
  created_at: string
  obras: { id: string; nome: string } | null
}

function toColaborador(row: ColaboradorRow): Colaborador {
  return {
    id: row.id,
    nome: row.nome,
    numeroMecan: row.numero_mecan,
    cargo: row.cargo,
    obraId: row.obra_id ?? undefined,
    obraNome: row.obras?.nome ?? undefined,
    userId: row.user_id ?? undefined,
    ativo: row.ativo,
    notas: row.notas ?? undefined,
    telemovel: row.telemovel ?? undefined,
    email: row.email ?? undefined,
    fotoPath: row.foto_path ?? undefined,
    setor: row.setor ?? undefined,
    createdAt: new Date(row.created_at),
  }
}

export async function listarColaboradores(apenasAtivos = true): Promise<Colaborador[]> {
  let query = colaboradoresDb.from('colaboradores').select(SELECT_COLABORADOR).order('nome')
  if (apenasAtivos) query = query.eq('ativo', true)
  const { data, error } = await query
  if (error) throw error
  return (data as ColaboradorRow[]).map(toColaborador)
}

export async function buscarColaborador(id: string): Promise<Colaborador> {
  const { data, error } = await colaboradoresDb
    .from('colaboradores')
    .select(SELECT_COLABORADOR)
    .eq('id', id)
    .single()
  if (error) throw error
  return toColaborador(data as ColaboradorRow)
}

// Função da BD inexistente: site publicado antes da migration do NIF
const RPC_INEXISTENTE = new Set(['PGRST202', '42883'])

// NIF só para admin, gestor e o próprio (a RPC devolve null aos outros)
export async function obterNif(id: string): Promise<string | null> {
  const { data, error } = await colaboradoresDb.rpc('colaborador_nif', { p_id: id })
  if (!error) return data ?? null
  if (!RPC_INEXISTENTE.has(error.code)) throw error
  const antiga = await colaboradoresDb.from('colaboradores').select('nif').eq('id', id).single()
  if (antiga.error) throw antiga.error
  return antiga.data.nif ?? null
}

export type NovoColaborador = {
  nome: string
  // Vazio: a BD gera ENC-nnnn (trigger colaborador_numero_auto)
  numeroMecan?: string
  cargo: string
  nif?: string
  obraId?: string
  notas?: string
  telemovel?: string
  email?: string
  fotoPath?: string | null
  setor?: string
  // Conta na app: liga o pedido de abastecimento à viatura atribuída na Frota.
  // undefined = não mexer (só o admin vê e altera este campo)
  userId?: string | null
}

export async function criarColaborador(input: NovoColaborador): Promise<Colaborador> {
  const linha: ColaboradorNovo = {
    nome: input.nome.trim(),
    numero_mecan: input.numeroMecan?.trim() ?? '',
    cargo: input.cargo.trim(),
    nif: input.nif?.trim() || null,
    obra_id: input.obraId ?? null,
    notas: input.notas?.trim() || null,
    user_id: input.userId ?? null,
    telemovel: input.telemovel?.trim() || null,
    email: input.email?.trim().toLowerCase() || null,
    foto_path: input.fotoPath ?? null,
    setor: input.setor?.trim() || null,
  }
  const { data, error } = await colaboradoresDb
    .from('colaboradores')
    .insert(linha)
    .select(SELECT_COLABORADOR)
    .single()
  if (error) throw error
  return toColaborador(data as ColaboradorRow)
}

export type AtualizarColaborador = Partial<NovoColaborador>

type ColaboradorNovo = Omit<ColaboradorPatch, 'nome' | 'numero_mecan' | 'cargo'> & { nome: string; numero_mecan: string; cargo: string }

type ColaboradorPatch = {
  nome?: string
  numero_mecan?: string
  cargo?: string
  nif?: string | null
  obra_id?: string | null
  notas?: string | null
  user_id?: string | null
  telemovel?: string | null
  email?: string | null
  foto_path?: string | null
  setor?: string | null
}

export async function atualizarColaborador(id: string, input: AtualizarColaborador): Promise<Colaborador> {
  const patch: ColaboradorPatch = {}
  if (input.nome !== undefined)       patch.nome = input.nome.trim()
  if (input.numeroMecan !== undefined) patch.numero_mecan = input.numeroMecan.trim()
  if (input.cargo !== undefined)      patch.cargo = input.cargo.trim()
  if (input.nif !== undefined)        patch.nif = input.nif.trim() || null
  if (input.obraId !== undefined)     patch.obra_id = input.obraId || null
  if (input.notas !== undefined)      patch.notas = input.notas.trim() || null
  if (input.userId !== undefined)     patch.user_id = input.userId
  if (input.telemovel !== undefined)  patch.telemovel = input.telemovel.trim() || null
  if (input.email !== undefined)      patch.email = input.email.trim().toLowerCase() || null
  if (input.fotoPath !== undefined)   patch.foto_path = input.fotoPath
  if (input.setor !== undefined)      patch.setor = input.setor.trim() || null

  const { data, error } = await colaboradoresDb
    .from('colaboradores')
    .update(patch)
    .eq('id', id)
    .select(SELECT_COLABORADOR)
    .single()
  if (error) throw error
  return toColaborador(data as ColaboradorRow)
}

export async function arquivarColaborador(id: string): Promise<void> {
  const { error } = await colaboradoresDb
    .from('colaboradores')
    .update({ ativo: false })
    .eq('id', id)
  if (error) throw error
}

export async function restaurarColaborador(id: string): Promise<void> {
  const { error } = await colaboradoresDb
    .from('colaboradores')
    .update({ ativo: true })
    .eq('id', id)
  if (error) throw error
}

export type ContaApp = { id: string; nome: string; role: string }

// Só o admin lê todos os perfis (RLS profiles_select_own_or_admin)
export async function listarContasApp(): Promise<ContaApp[]> {
  const { data, error } = await supabase.from('profiles').select('id, nome, role').order('nome')
  if (error) throw error
  return data.map(p => ({ id: p.id, nome: p.nome ?? '—', role: p.role }))
}
