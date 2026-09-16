import { supabase } from '@/integrations/supabase/client'
import type { Falta, TipoFalta, EstadoFalta, FaltaPeriodo } from '@/app/types'
import type { Database } from '@/integrations/supabase/types'

export type { EstadoFalta, FaltaPeriodo }

type FaltaRow     = Database['public']['Tables']['faltas']['Row']
type TipoRow      = Database['public']['Tables']['tipos_falta']['Row']

const SELECT_FALTA = '*, tipos_falta(designacao), colaboradores(nome)'
const SELECT_TIPO  = '*'

function toFalta(r: FaltaRow & {
  tipos_falta?: { designacao: string } | null
  colaboradores?: { nome: string } | null
}): Falta {
  return {
    id: r.id,
    colaboradorId: r.colaborador_id,
    colaboradorNome: r.colaboradores?.nome,
    dataInicio: r.data_inicio,
    dataFim: r.data_fim,
    periodo: r.periodo as FaltaPeriodo | undefined,
    tipoFaltaId: r.tipo_falta_id ?? undefined,
    tipoFaltaDesignacao: r.tipos_falta?.designacao,
    estado: r.estado as EstadoFalta,
    justificacaoTexto: r.justificacao_texto ?? undefined,
    // comprovativo_key não exposto no tipo Falta (dado de saúde RGPD) — omitido intencionalmente
    dadoSaude: r.dado_saude,
    previsivel: r.previsivel,
    comunicadaEm: new Date(r.comunicada_em),
    prazoProvaAte: r.prazo_prova_ate ?? undefined,
    decididaPor: r.decidida_por ?? undefined,
    decididaEm: r.decidida_em ? new Date(r.decidida_em) : undefined,
  }
}

function toTipo(r: TipoRow): TipoFalta {
  return {
    id: r.id,
    designacao: r.designacao,
    justificada: r.justificada ?? null,
    descontavel: r.descontavel ?? false,
    ativo: true,  // todos os seeds estão ativos; não existe coluna na tabela
  }
}

export async function listarTiposFalta(): Promise<TipoFalta[]> {
  const { data, error } = await supabase
    .from('tipos_falta').select(SELECT_TIPO).order('designacao')
  if (error) throw error
  return (data as TipoRow[]).map(toTipo)
}

export async function listarFaltas(colaboradorId?: string): Promise<Falta[]> {
  let q = supabase.from('faltas').select(SELECT_FALTA).order('data_inicio', { ascending: false })
  if (colaboradorId) q = q.eq('colaborador_id', colaboradorId)
  const { data, error } = await q
  if (error) throw error
  return (data as (FaltaRow & { tipos_falta: { designacao: string } | null; colaboradores: { nome: string } | null })[])
    .map(toFalta)
}

export async function buscarFalta(id: string): Promise<Falta> {
  const { data, error } = await supabase
    .from('faltas').select(SELECT_FALTA).eq('id', id).single()
  if (error) throw error
  return toFalta(data as FaltaRow & { tipos_falta: { designacao: string } | null; colaboradores: { nome: string } | null })
}

export type NovaFalta = {
  colaboradorId: string
  dataInicio: string
  dataFim: string
  periodo?: Falta['periodo']
  tipoFaltaId?: string
  justificacaoTexto?: string
  dadoSaude?: boolean
  previsivel?: boolean
}

export async function criarFalta(input: NovaFalta): Promise<Falta> {
  const { data, error } = await supabase
    .from('faltas')
    .insert({
      colaborador_id:    input.colaboradorId,
      data_inicio:       input.dataInicio,
      data_fim:          input.dataFim,
      periodo:           input.periodo ?? null,
      tipo_falta_id:     input.tipoFaltaId ?? null,
      justificacao_texto: input.justificacaoTexto ?? null,
      dado_saude:        input.dadoSaude ?? false,
      previsivel:        input.previsivel ?? false,
    })
    .select(SELECT_FALTA)
    .single()
  if (error) throw error
  return toFalta(data as FaltaRow & { tipos_falta: { designacao: string } | null; colaboradores: { nome: string } | null })
}

export async function atualizarEstadoFalta(id: string, estado: EstadoFalta, decididaPor?: string): Promise<void> {
  const { error } = await supabase
    .from('faltas')
    .update({
      estado,
      decidida_por: decididaPor ?? null,
      decidida_em:  decididaPor ? new Date().toISOString() : null,
    })
    .eq('id', id)
  if (error) throw error
}
