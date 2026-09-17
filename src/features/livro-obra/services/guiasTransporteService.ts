import { supabase } from '@/integrations/supabase/client'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type EstadoGuia = 'EMITIDA' | 'ENTREGUE' | 'ANULADA'

export type LinhaGuia = {
  descricao:  string
  quantidade: number
  unidade:    string
}

export type GuiaTransporte = {
  id:          string
  numero:      string
  obraId:      string | null
  viaturaId:   string | null
  motoristaId: string | null
  origem:      string | null
  destino:     string | null
  dataCarga:   string | null
  estado:      EstadoGuia
  linhas:      LinhaGuia[]
  createdAt:   string
}

export type CriarGuiaInput = {
  obraId?:     string
  motoristaId?: string
  origem?:     string
  destino?:    string
  dataCarga:   string
  linhas:      LinhaGuia[]
}

// ── DB cast (tabela não está nos tipos gerados) ───────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as any

const SELECT = 'id, numero, obra_id, viatura_id, motorista_id, origem, destino, data_carga, estado, linhas, created_at'

// ── Mappers ───────────────────────────────────────────────────────────────────

type Row = {
  id: string; numero: string; obra_id: string | null; viatura_id: string | null
  motorista_id: string | null; origem: string | null; destino: string | null
  data_carga: string | null; estado: string; linhas: LinhaGuia[]; created_at: string
}

function toEntity(row: Row): GuiaTransporte {
  return {
    id:          row.id,
    numero:      row.numero,
    obraId:      row.obra_id,
    viaturaId:   row.viatura_id,
    motoristaId: row.motorista_id,
    origem:      row.origem,
    destino:     row.destino,
    dataCarga:   row.data_carga,
    estado:      row.estado as EstadoGuia,
    linhas:      (row.linhas as LinhaGuia[]) ?? [],
    createdAt:   row.created_at,
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

export async function listarGuias(obraId: string): Promise<GuiaTransporte[]> {
  const { data, error } = await db
    .from('guias_transporte')
    .select(SELECT)
    .eq('obra_id', obraId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as Row[]).map(toEntity)
}

export async function criarGuia(input: CriarGuiaInput): Promise<string> {
  const { data, error } = await db.rpc('criar_guia_transporte', {
    p_obra_id:    input.obraId    ?? null,
    p_motorista:  input.motoristaId ?? null,
    p_origem:     input.origem    ?? null,
    p_destino:    input.destino   ?? null,
    p_data_carga: input.dataCarga,
    p_linhas:     input.linhas,
  })

  if (error) throw error
  return data as string
}

export async function actualizarEstadoGuia(id: string, estado: EstadoGuia): Promise<void> {
  const { error } = await db
    .from('guias_transporte')
    .update({ estado })
    .eq('id', id)

  if (error) throw error
}
