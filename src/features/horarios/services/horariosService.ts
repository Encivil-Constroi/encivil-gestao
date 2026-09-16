import { supabase } from '@/integrations/supabase/client'
import type { Horario, HorarioColaborador } from '@/app/types'
import type { Database } from '@/integrations/supabase/types'

export type { Horario }

type HorarioRow   = Database['public']['Tables']['horarios']['Row']
type HcoRow       = Database['public']['Tables']['horario_colaborador']['Row']

const SELECT_HORARIO = '*'
const SELECT_HCOLAB  = '*, horarios(designacao)'

function toHorario(r: HorarioRow): Horario {
  return {
    id: r.id,
    designacao: r.designacao,
    periodoDiarioH: r.periodo_diario_h,
    periodoSemanalH: r.periodo_semanal_h,
    intervaloMin: r.intervalo_min ?? undefined,
    intervaloInicio: r.intervalo_inicio ?? undefined,
    intervaloFim: r.intervalo_fim ?? undefined,
    diasSemana: r.dias_semana,
    horaEntrada: r.hora_entrada,
    horaSaida: r.hora_saida,
    toleranciaEntradaMin: r.tolerancia_entrada_min ?? 5,
    ativo: r.ativo,
    validoDe: r.valido_de ?? undefined,
    validoAte: r.valido_ate ?? undefined,
    createdAt: new Date(),  // horarios table has no created_at; use current time as fallback
  }
}

function toHorarioColaborador(r: HcoRow & { horarios?: { designacao: string } | null }): HorarioColaborador {
  return {
    colaboradorId: r.colaborador_id,
    horarioId: r.horario_id,
    horarioDesignacao: r.horarios?.designacao,
    validoDe: r.valido_de,
    validoAte: r.valido_ate ?? undefined,
  }
}

export async function listarHorarios(apenasAtivos = true): Promise<Horario[]> {
  let q = supabase.from('horarios').select(SELECT_HORARIO).order('designacao')
  if (apenasAtivos) q = q.eq('ativo', true)
  const { data, error } = await q
  if (error) throw error
  return (data as HorarioRow[]).map(toHorario)
}

export async function buscarHorario(id: string): Promise<Horario> {
  const { data, error } = await supabase
    .from('horarios').select(SELECT_HORARIO).eq('id', id).single()
  if (error) throw error
  return toHorario(data as HorarioRow)
}

export async function criarHorario(input: Omit<Horario, 'id'>): Promise<Horario> {
  const { data, error } = await supabase
    .from('horarios')
    .insert({
      designacao:             input.designacao,
      periodo_diario_h:       input.periodoDiarioH,
      periodo_semanal_h:      input.periodoSemanalH,
      intervalo_min:          input.intervaloMin ?? null,
      intervalo_inicio:       input.intervaloInicio ?? null,
      intervalo_fim:          input.intervaloFim ?? null,
      dias_semana:            input.diasSemana,
      hora_entrada:           input.horaEntrada,
      hora_saida:             input.horaSaida,
      tolerancia_entrada_min: input.toleranciaEntradaMin,
      ativo:                  input.ativo,
      valido_de:              input.validoDe ?? null,
      valido_ate:             input.validoAte ?? null,
    })
    .select(SELECT_HORARIO)
    .single()
  if (error) throw error
  return toHorario(data as HorarioRow)
}

export async function atualizarHorario(id: string, input: Partial<Omit<Horario, 'id'>>): Promise<Horario> {
  const { data, error } = await supabase
    .from('horarios')
    .update({
      ...(input.designacao            !== undefined && { designacao:             input.designacao }),
      ...(input.periodoDiarioH        !== undefined && { periodo_diario_h:       input.periodoDiarioH }),
      ...(input.periodoSemanalH       !== undefined && { periodo_semanal_h:      input.periodoSemanalH }),
      ...(input.intervaloMin          !== undefined && { intervalo_min:          input.intervaloMin }),
      ...(input.intervaloInicio       !== undefined && { intervalo_inicio:       input.intervaloInicio }),
      ...(input.intervaloFim          !== undefined && { intervalo_fim:          input.intervaloFim }),
      ...(input.diasSemana            !== undefined && { dias_semana:            input.diasSemana }),
      ...(input.horaEntrada           !== undefined && { hora_entrada:           input.horaEntrada }),
      ...(input.horaSaida             !== undefined && { hora_saida:             input.horaSaida }),
      ...(input.toleranciaEntradaMin  !== undefined && { tolerancia_entrada_min: input.toleranciaEntradaMin }),
      ...(input.ativo                 !== undefined && { ativo:                  input.ativo }),
      ...(input.validoDe              !== undefined && { valido_de:              input.validoDe }),
      ...(input.validoAte             !== undefined && { valido_ate:             input.validoAte }),
    })
    .eq('id', id)
    .select(SELECT_HORARIO)
    .single()
  if (error) throw error
  return toHorario(data as HorarioRow)
}

export async function arquivarHorario(id: string): Promise<void> {
  const { error } = await supabase.from('horarios').update({ ativo: false }).eq('id', id)
  if (error) throw error
}

// ── Atribuições ────────────────────────────────────────────────────

export async function listarHorarioColaborador(colaboradorId: string): Promise<HorarioColaborador[]> {
  const { data, error } = await supabase
    .from('horario_colaborador')
    .select(SELECT_HCOLAB)
    .eq('colaborador_id', colaboradorId)
    .order('valido_de', { ascending: false })
  if (error) throw error
  return (data as (HcoRow & { horarios: { designacao: string } | null })[]).map(toHorarioColaborador)
}

export async function atribuirHorario(
  colaboradorId: string,
  horarioId: string,
  validoDe: string,
  validoAte?: string
): Promise<void> {
  const { error } = await supabase
    .from('horario_colaborador')
    .upsert({ colaborador_id: colaboradorId, horario_id: horarioId, valido_de: validoDe, valido_ate: validoAte ?? null })
  if (error) throw error
}
