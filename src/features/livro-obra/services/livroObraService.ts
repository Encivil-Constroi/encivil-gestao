import { supabase } from '@/integrations/supabase/client'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type CategoriaRegisto = 'OCORRENCIA' | 'VISITA' | 'CONDICOES_METEO' | 'PESSOAL' | 'EQUIPAMENTO'

export const CATEGORIAS: { value: CategoriaRegisto; label: string }[] = [
  { value: 'OCORRENCIA',      label: 'Ocorrência'         },
  { value: 'VISITA',          label: 'Visita'             },
  { value: 'CONDICOES_METEO', label: 'Condições Meteo'   },
  { value: 'PESSOAL',         label: 'Pessoal'            },
  { value: 'EQUIPAMENTO',     label: 'Equipamento'        },
]

export type RegistoObra = {
  id:        string
  obraId:    string
  data:      string
  categoria: CategoriaRegisto
  descricao: string
  fotoKeys:  string[]
  autorId:   string
  createdAt: string
}

export type CriarRegistoInput = {
  obraId:    string
  data:      string
  categoria: CategoriaRegisto
  descricao: string
  fotoKeys?: string[]
}

// ── DB cast (tabela não está nos tipos gerados) ───────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as any

const SELECT = 'id, obra_id, data, categoria, descricao, foto_keys, autor_id, created_at'

// ── Mappers ───────────────────────────────────────────────────────────────────

type Row = {
  id: string; obra_id: string; data: string; categoria: string
  descricao: string; foto_keys: string[]; autor_id: string; created_at: string
}

function toEntity(row: Row): RegistoObra {
  return {
    id:        row.id,
    obraId:    row.obra_id,
    data:      row.data,
    categoria: row.categoria as CategoriaRegisto,
    descricao: row.descricao,
    fotoKeys:  row.foto_keys ?? [],
    autorId:   row.autor_id,
    createdAt: row.created_at,
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

export async function listarRegistos(
  obraId:     string,
  categoria?: CategoriaRegisto,
): Promise<RegistoObra[]> {
  // Aplicar filtros antes de ordenar para que a query final seja awaitable
  let query = db
    .from('registos_obra')
    .select(SELECT)
    .eq('obra_id', obraId)

  if (categoria) query = query.eq('categoria', categoria)

  const { data, error } = await query
    .order('data', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as Row[]).map(toEntity)
}

export async function criarRegisto(
  autorId: string,
  input:   CriarRegistoInput,
): Promise<RegistoObra> {
  const { data, error } = await db
    .from('registos_obra')
    .insert({
      obra_id:   input.obraId,
      data:      input.data,
      categoria: input.categoria,
      descricao: input.descricao,
      foto_keys: input.fotoKeys ?? [],
      autor_id:  autorId,
    })
    .select(SELECT)
    .single()

  if (error) throw error
  return toEntity(data as Row)
}

export async function editarRegisto(
  id:    string,
  input: Partial<CriarRegistoInput>,
): Promise<RegistoObra> {
  const patch: Record<string, unknown> = {}
  if (input.data      != null) patch.data      = input.data
  if (input.categoria != null) patch.categoria  = input.categoria
  if (input.descricao != null) patch.descricao  = input.descricao
  if (input.fotoKeys  != null) patch.foto_keys  = input.fotoKeys

  const { data, error } = await db
    .from('registos_obra')
    .update(patch)
    .eq('id', id)
    .select(SELECT)
    .single()

  if (error) throw error
  return toEntity(data as Row)
}
