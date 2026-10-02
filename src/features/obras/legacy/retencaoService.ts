import { supabase } from '@/integrations/supabase/client'
import type { LiberacaoRetencao } from '@/app/types'
import { libertarRetencao } from '../services/subsControloService'

const db = supabase

type LiberacaoRow = {
  id: string
  subempreiteiro_id: string
  obra_id: string | null
  valor: number
  data_liberacao: string
  motivo: LiberacaoRetencao['motivo']
  observacoes: string | null
  registado_por: string | null
  created_at: string
}

function toLiberacao(row: LiberacaoRow): LiberacaoRetencao {
  return {
    id:               row.id,
    subcontractorId:  row.subempreiteiro_id,
    obraId:           row.obra_id ?? undefined,
    valor:            Number(row.valor),
    dataLiberacao:    row.data_liberacao,
    motivo:           row.motivo,
    observacoes:      row.observacoes ?? undefined,
    registadoPor:     row.registado_por ?? undefined,
    createdAt:        new Date(row.created_at),
  }
}

export async function listarLiberacoes(subId: string): Promise<LiberacaoRetencao[]> {
  const { data, error } = await db
    .from('liberacoes_retencao')
    .select('*')
    .eq('subempreiteiro_id', subId)
    .order('data_liberacao', { ascending: false })
  if (error) throw error
  return (data as LiberacaoRow[]).map(toLiberacao)
}

// A RPC deduz a obra do subempreiteiro e regista a data no servidor; os campos
// obraId e dataLiberacao mantêm-se só por compatibilidade com os chamadores.
export type NovaLiberacao = {
  subcontractorId: string
  obraId?: string
  valor: number
  dataLiberacao?: string
  motivo: LiberacaoRetencao['motivo']
  observacoes?: string
}

export async function criarLiberacao(input: NovaLiberacao): Promise<LiberacaoRetencao> {
  const id = await libertarRetencao({
    subId:  input.subcontractorId,
    valor:  input.valor,
    motivo: input.motivo,
    obs:    input.observacoes ?? null,
  })
  const { data, error } = await db.from('liberacoes_retencao').select('*').eq('id', id).single()
  if (error) throw error
  return toLiberacao(data as LiberacaoRow)
}

export async function eliminarLiberacao(id: string): Promise<void> {
  const { error } = await db.from('liberacoes_retencao').delete().eq('id', id)
  if (error) throw error
}
