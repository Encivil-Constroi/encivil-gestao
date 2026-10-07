import { supabase } from '@/integrations/supabase/client'
import type { TablesUpdate } from '@/integrations/supabase/types'
import type { Obra, ObraStatus } from '@/app/types'
import { obrasDb, type EstadoObra, type ObraResumoRow } from '../db'

type GeoPoint = { type: 'Point'; coordinates: [number, number] }  // [lon, lat]

type ObraRow = {
  id: string
  nome: string
  cliente: string | null
  localizacao: string | null
  estado: ObraStatus
  orcamento: number | null
  observacoes: string | null
  ativo: boolean
  created_at: string
  updated_at: string
  // F5 — Geofence
  geofence_tipo: string | null
  geofence_centro: GeoPoint | null
  geofence_raio_m: number | null
  geofence_poligono: unknown | null
}

function toObra(row: ObraRow): Obra {
  return {
    id: row.id,
    name: row.nome,
    client: row.cliente ?? undefined,
    location: row.localizacao ?? undefined,
    status: row.estado,
    budget: row.orcamento ?? undefined,
    notes: row.observacoes ?? undefined,
    active: row.ativo,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    geofenceTipo: (row.geofence_tipo as Obra['geofenceTipo']) ?? undefined,
    geofenceCentroLat: row.geofence_centro?.coordinates[1] ?? undefined,
    geofenceCentroLon: row.geofence_centro?.coordinates[0] ?? undefined,
    geofenceRaioM: row.geofence_raio_m ?? undefined,
  }
}

export async function listarObras(apenasAtivas = true): Promise<Obra[]> {
  let query = supabase.from('obras').select('*').order('nome')
  if (apenasAtivas) query = query.eq('ativo', true)
  const { data, error } = await query
  if (error) throw error
  return (data as unknown as ObraRow[]).map(toObra)
}

export async function buscarObra(id: string): Promise<Obra> {
  const { data, error } = await supabase.from('obras').select('*').eq('id', id).single()
  if (error) throw error
  return toObra(data as unknown as ObraRow)
}

export type NovaObra = {
  name: string
  client?: string
  location?: string
  status?: ObraStatus
  budget?: number
  notes?: string
  // F5 — Geofence
  geofenceTipo?: 'RAIO' | 'POLIGONO' | null
  geofenceCentroLat?: number
  geofenceCentroLon?: number
  geofenceRaioM?: number
}

export async function criarObra(input: NovaObra): Promise<Obra> {
  const { data, error } = await supabase
    .from('obras')
    .insert({
      nome: input.name,
      cliente: input.client ?? null,
      localizacao: input.location ?? null,
      estado: input.status ?? 'ativa',
      orcamento: input.budget ?? null,
      observacoes: input.notes ?? null,
      ...geofencePayload(input),
    })
    .select()
    .single()
  if (error) throw error
  return toObra(data as unknown as ObraRow)
}

export type AtualizarObra = Partial<NovaObra> & { active?: boolean }

export async function atualizarObra(id: string, input: AtualizarObra): Promise<Obra> {
  const update: Record<string, unknown> = {}
  if (input.name !== undefined)     update.nome = input.name
  if (input.client !== undefined)   update.cliente = input.client || null
  if (input.location !== undefined) update.localizacao = input.location || null
  if (input.status !== undefined)   update.estado = input.status
  if (input.budget !== undefined)   update.orcamento = input.budget ?? null
  if (input.notes !== undefined)    update.observacoes = input.notes || null
  if (input.active !== undefined)   update.ativo = input.active

  // Geofence: atualizar se qualquer campo geofence foi passado
  if (input.geofenceTipo !== undefined) {
    Object.assign(update, geofencePayload(input))
  }

  const { data, error } = await supabase
    .from('obras')
    .update(update as TablesUpdate<'obras'>)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return toObra(data as unknown as ObraRow)
}

// Constrói os campos geofence para INSERT/UPDATE.
// Usa EWKT (SRID=4326;POINT(lon lat)) que PostgREST/PostGIS aceita para colunas geography.
function geofencePayload(input: Pick<NovaObra, 'geofenceTipo' | 'geofenceCentroLat' | 'geofenceCentroLon' | 'geofenceRaioM'>): Record<string, unknown> {
  if (!input.geofenceTipo) return { geofence_tipo: null, geofence_centro: null, geofence_raio_m: null }

  const hasCenter = input.geofenceCentroLat != null && input.geofenceCentroLon != null
  return {
    geofence_tipo: input.geofenceTipo,
    geofence_centro: hasCenter
      ? `SRID=4326;POINT(${input.geofenceCentroLon} ${input.geofenceCentroLat})`
      : null,
    geofence_raio_m: input.geofenceRaioM ?? null,
  }
}

// ── Módulo Obras completo (migration 20261003000000) ─────────────────────────

export async function listarPainel(): Promise<ObraResumoRow[]> {
  const { data, error } = await obrasDb.rpc('obras_painel')
  if (error) throw error
  return data ?? []
}

export async function buscarVisao(id: string): Promise<ObraResumoRow> {
  const { data, error } = await obrasDb.rpc('obra_visao', { p_obra_id: id })
  if (error) throw error
  // PostgREST devolve o composto não-SETOF como objeto; versões antigas podem devolver uma lista.
  const linha: ObraResumoRow | undefined | null = Array.isArray(data) ? data[0] : data
  if (!linha?.obra_id) throw new Error('Obra não encontrada')
  return linha
}

export type ObraInput = {
  id: string | null
  nome: string
  cliente: string
  morada: string
  localizacao: string
  latitude: number | null
  longitude: number | null
  estado: EstadoObra
  dataInicio: string
  dataPrevistaFim: string
  orcamento: number | null
  responsavelId: string
  engenheiroId: string
  tipoObra: string
  descricao: string
  observacoes: string
}

const ouNulo = (s: string): string | null => (s.trim() === '' ? null : s.trim())

export async function guardarObra(i: ObraInput): Promise<string> {
  const { data, error } = await obrasDb.rpc('obra_guardar', {
    p_id: i.id,
    p_nome: i.nome.trim(),
    p_cliente: ouNulo(i.cliente),
    p_morada: ouNulo(i.morada),
    p_localizacao: ouNulo(i.localizacao),
    p_latitude: i.latitude,
    p_longitude: i.longitude,
    p_estado: i.estado,
    p_data_inicio: ouNulo(i.dataInicio),
    p_data_prevista_fim: ouNulo(i.dataPrevistaFim),
    p_orcamento: i.orcamento,
    p_responsavel_id: ouNulo(i.responsavelId),
    p_engenheiro_id: ouNulo(i.engenheiroId),
    p_tipo_obra: ouNulo(i.tipoObra),
    p_descricao: ouNulo(i.descricao),
    p_observacoes: ouNulo(i.observacoes),
  })
  if (error) throw error
  return data as string
}

export type ColaboradorOpcao = { id: string; nome: string }

export async function listarColaboradoresAtivos(): Promise<ColaboradorOpcao[]> {
  const { data, error } = await supabase.from('colaboradores').select('id, nome').eq('ativo', true).order('nome')
  if (error) throw error
  return data ?? []
}
