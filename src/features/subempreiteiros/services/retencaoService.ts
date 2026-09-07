import { supabase } from '@/integrations/supabase/client'
import type { LiberacaoRetencao } from '@/app/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

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

export type NovaLiberacao = {
  subcontractorId: string
  obraId?: string
  valor: number
  dataLiberacao: string
  motivo: LiberacaoRetencao['motivo']
  observacoes?: string
}

export async function criarLiberacao(input: NovaLiberacao): Promise<LiberacaoRetencao> {
  const { data, error } = await db
    .from('liberacoes_retencao')
    .insert({
      subempreiteiro_id: input.subcontractorId,
      obra_id:           input.obraId ?? null,
      valor:             input.valor,
      data_liberacao:    input.dataLiberacao,
      motivo:            input.motivo,
      observacoes:       input.observacoes ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  return toLiberacao(data as LiberacaoRow)
}

export async function eliminarLiberacao(id: string): Promise<void> {
  const { error } = await db.from('liberacoes_retencao').delete().eq('id', id)
  if (error) throw error
}
