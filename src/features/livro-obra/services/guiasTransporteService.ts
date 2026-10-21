import { livroObraDb, type GuiaTransporteRow } from '../db'

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

const SELECT = 'id, numero, obra_id, viatura_id, motorista_id, origem, destino, data_carga, estado, linhas, created_at'

// ── Mappers ───────────────────────────────────────────────────────────────────

function toEntity(row: GuiaTransporteRow): GuiaTransporte {
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
    linhas:      row.linhas ?? [],
    createdAt:   row.created_at,
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

export async function listarGuias(obraId: string): Promise<GuiaTransporte[]> {
  const { data, error } = await livroObraDb
    .from('guias_transporte')
    .select(SELECT)
    .eq('obra_id', obraId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map(toEntity)
}

export async function criarGuia(input: CriarGuiaInput): Promise<string> {
  const { data, error } = await livroObraDb.rpc('criar_guia_transporte', {
    p_obra_id:    input.obraId    ?? null,
    p_motorista:  input.motoristaId ?? null,
    p_origem:     input.origem    ?? null,
    p_destino:    input.destino   ?? null,
    p_data_carga: input.dataCarga,
    p_linhas:     input.linhas,
  })

  if (error) throw error
  return data
}

export async function actualizarEstadoGuia(id: string, estado: EstadoGuia): Promise<void> {
  const { error } = await livroObraDb
    .from('guias_transporte')
    .update({ estado })
    .eq('id', id)

  if (error) throw error
}
