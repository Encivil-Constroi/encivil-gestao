import { supabase } from '@/integrations/supabase/client'
import type { Horario, HorarioColaborador, Feriado, TipoFalta, Falta, FaltaEstado } from '@/app/types'

// Tabelas F2 ainda não estão nos tipos gerados (migration pendente de aplicação em produção).
// TODO: remover este cast após: npx supabase gen types typescript --local > src/integrations/supabase/types.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ── Horários ──────────────────────────────────────────────────────────────

const SEL_HORARIO = '*'

type HorarioRow = {
  id: string
  designacao: string
  periodo_diario_h: number
  periodo_semanal_h: number
  intervalo_min: number | null
  intervalo_inicio: string | null
  intervalo_fim: string | null
  dias_semana: number[]
  hora_entrada: string
  hora_saida: string
  tolerancia_entrada_min: number
  ativo: boolean
  valido_de: string | null
  valido_ate: string | null
  created_at: string
}

function toHorario(r: HorarioRow): Horario {
  return {
    id: r.id,
    designacao: r.designacao,
    periodoDiarioH: Number(r.periodo_diario_h),
    periodoSemanalH: Number(r.periodo_semanal_h),
    intervaloMin: r.intervalo_min ?? undefined,
    intervaloInicio: r.intervalo_inicio ?? undefined,
    intervaloFim: r.intervalo_fim ?? undefined,
    diasSemana: r.dias_semana,
    horaEntrada: r.hora_entrada,
    horaSaida: r.hora_saida,
    toleranciaEntradaMin: r.tolerancia_entrada_min,
    ativo: r.ativo,
    validoDe: r.valido_de ?? undefined,
    validoAte: r.valido_ate ?? undefined,
    createdAt: new Date(r.created_at),
  }
}

export async function listarHorarios(apenasAtivos = true): Promise<Horario[]> {
  let query = db.from('horarios').select(SEL_HORARIO).order('designacao')
  if (apenasAtivos) query = query.eq('ativo', true)
  const { data, error } = await query
  if (error) throw error
  return (data as unknown as HorarioRow[]).map(toHorario)
}

export type NovoHorario = {
  designacao: string
  periodoDiarioH: number
  periodoSemanalH: number
  intervaloMin?: number
  intervaloInicio?: string
  intervaloFim?: string
  diasSemana: number[]
  horaEntrada: string
  horaSaida: string
  toleranciaEntradaMin?: number
  validoDe?: string
  validoAte?: string
}

export async function criarHorario(input: NovoHorario): Promise<Horario> {
  const { data, error } = await db
    .from('horarios')
    .insert({
      designacao:           input.designacao.trim(),
      periodo_diario_h:     input.periodoDiarioH,
      periodo_semanal_h:    input.periodoSemanalH,
      intervalo_min:        input.intervaloMin ?? null,
      intervalo_inicio:     input.intervaloInicio ?? null,
      intervalo_fim:        input.intervaloFim ?? null,
      dias_semana:          input.diasSemana,
      hora_entrada:         input.horaEntrada,
      hora_saida:           input.horaSaida,
      tolerancia_entrada_min: input.toleranciaEntradaMin ?? 5,
      valido_de:            input.validoDe ?? null,
      valido_ate:           input.validoAte ?? null,
    })
    .select(SEL_HORARIO)
    .single()
  if (error) throw error
  return toHorario(data as unknown as HorarioRow)
}

export async function atualizarHorario(id: string, input: Partial<NovoHorario>): Promise<Horario> {
  const patch: Record<string, unknown> = {}
  if (input.designacao !== undefined)      patch.designacao = input.designacao.trim()
  if (input.periodoDiarioH !== undefined)  patch.periodo_diario_h = input.periodoDiarioH
  if (input.periodoSemanalH !== undefined) patch.periodo_semanal_h = input.periodoSemanalH
  if (input.intervaloMin !== undefined)    patch.intervalo_min = input.intervaloMin
  if (input.intervaloInicio !== undefined) patch.intervalo_inicio = input.intervaloInicio
  if (input.intervaloFim !== undefined)    patch.intervalo_fim = input.intervaloFim
  if (input.diasSemana !== undefined)      patch.dias_semana = input.diasSemana
  if (input.horaEntrada !== undefined)     patch.hora_entrada = input.horaEntrada
  if (input.horaSaida !== undefined)       patch.hora_saida = input.horaSaida
  if (input.toleranciaEntradaMin !== undefined) patch.tolerancia_entrada_min = input.toleranciaEntradaMin
  if (input.validoDe !== undefined)        patch.valido_de = input.validoDe || null
  if (input.validoAte !== undefined)       patch.valido_ate = input.validoAte || null

  const { data, error } = await db
    .from('horarios')
    .update(patch)
    .eq('id', id)
    .select(SEL_HORARIO)
    .single()
  if (error) throw error
  return toHorario(data as unknown as HorarioRow)
}

export async function arquivarHorario(id: string): Promise<void> {
  const { error } = await db.from('horarios').update({ ativo: false }).eq('id', id)
  if (error) throw error
}

// ── Atribuição horário → colaborador ─────────────────────────────────────

const SEL_HC = '*, colaboradores(id, nome), horarios(id, designacao)'

type HCRow = {
  colaborador_id: string
  horario_id: string
  valido_de: string
  valido_ate: string | null
  colaboradores: { id: string; nome: string } | null
  horarios: { id: string; designacao: string } | null
}

function toHC(r: HCRow): HorarioColaborador {
  return {
    colaboradorId: r.colaborador_id,
    colaboradorNome: r.colaboradores?.nome,
    horarioId: r.horario_id,
    horarioDesignacao: r.horarios?.designacao,
    validoDe: r.valido_de,
    validoAte: r.valido_ate ?? undefined,
  }
}

export async function listarHorariosColaborador(colaboradorId: string): Promise<HorarioColaborador[]> {
  const { data, error } = await db
    .from('horario_colaborador')
    .select(SEL_HC)
    .eq('colaborador_id', colaboradorId)
    .order('valido_de', { ascending: false })
  if (error) throw error
  return (data as unknown as HCRow[]).map(toHC)
}

export async function atribuirHorario(
  colaboradorId: string,
  horarioId: string,
  validoDe: string,
  validoAte?: string,
): Promise<HorarioColaborador> {
  const { data, error } = await db
    .from('horario_colaborador')
    .upsert({ colaborador_id: colaboradorId, horario_id: horarioId, valido_de: validoDe, valido_ate: validoAte ?? null })
    .select(SEL_HC)
    .single()
  if (error) throw error
  return toHC(data as unknown as HCRow)
}

// ── Feriados ──────────────────────────────────────────────────────────────

export async function listarFeriados(): Promise<Feriado[]> {
  const { data, error } = await db
    .from('feriados_excecoes')
    .select('*')
    .order('data')
  if (error) throw error
  return (data ?? []) as Feriado[]
}

export async function criarFeriado(f: Feriado): Promise<Feriado> {
  const { data, error } = await db
    .from('feriados_excecoes')
    .upsert(f)
    .select('*')
    .single()
  if (error) throw error
  return data as unknown as Feriado
}

export async function eliminarFeriado(data: string): Promise<void> {
  const { error } = await db.from('feriados_excecoes').delete().eq('data', data)
  if (error) throw error
}

// ── Tipos de falta ───────────────────────────────────────────────────────

export async function listarTiposFalta(apenasAtivos = true): Promise<TipoFalta[]> {
  let query = db.from('tipos_falta').select('*').order('designacao')
  if (apenasAtivos) query = query.eq('ativo', true)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as TipoFalta[]
}

// ── Faltas ───────────────────────────────────────────────────────────────

const SEL_FALTA = '*, colaboradores(id, nome), tipos_falta(id, designacao)'

type FaltaRow = {
  id: string
  colaborador_id: string
  data_inicio: string
  data_fim: string
  periodo: string | null
  tipo_falta_id: string | null
  estado: string
  justificacao_texto: string | null
  dado_saude: boolean
  previsivel: boolean
  comunicada_em: string
  prazo_prova_ate: string | null
  decidida_por: string | null
  decidida_em: string | null
  colaboradores: { id: string; nome: string } | null
  tipos_falta: { id: string; designacao: string } | null
}

function toFalta(r: FaltaRow): Falta {
  return {
    id: r.id,
    colaboradorId: r.colaborador_id,
    colaboradorNome: r.colaboradores?.nome,
    dataInicio: r.data_inicio,
    dataFim: r.data_fim,
    periodo: (r.periodo ?? undefined) as Falta['periodo'],
    tipoFaltaId: r.tipo_falta_id ?? undefined,
    tipoFaltaDesignacao: r.tipos_falta?.designacao,
    estado: r.estado as FaltaEstado,
    justificacaoTexto: r.justificacao_texto ?? undefined,
    dadoSaude: r.dado_saude,
    previsivel: r.previsivel,
    comunicadaEm: new Date(r.comunicada_em),
    prazoProvaAte: r.prazo_prova_ate ?? undefined,
    decididaPor: r.decidida_por ?? undefined,
    decididaEm: r.decidida_em ? new Date(r.decidida_em) : undefined,
  }
}

export type FiltrosFaltas = {
  colaboradorId?: string
  estado?: FaltaEstado
  dataInicio?: string
  dataFim?: string
}

export async function listarFaltas(filtros: FiltrosFaltas = {}): Promise<Falta[]> {
  let query = db
    .from('faltas')
    .select(SEL_FALTA)
    .order('data_inicio', { ascending: false })

  if (filtros.colaboradorId) query = query.eq('colaborador_id', filtros.colaboradorId)
  if (filtros.estado)        query = query.eq('estado', filtros.estado)
  if (filtros.dataInicio)    query = query.gte('data_inicio', filtros.dataInicio)
  if (filtros.dataFim)       query = query.lte('data_fim', filtros.dataFim)

  const { data, error } = await query
  if (error) throw error
  return (data as unknown as FaltaRow[]).map(toFalta)
}

export type NovaFalta = {
  colaboradorId: string
  dataInicio: string
  dataFim: string
  periodo?: string
  tipoFaltaId?: string
  justificacaoTexto?: string
  dadoSaude?: boolean
  previsivel?: boolean
}

export async function registarFalta(input: NovaFalta): Promise<Falta> {
  const { data, error } = await db
    .from('faltas')
    .insert({
      colaborador_id:    input.colaboradorId,
      data_inicio:       input.dataInicio,
      data_fim:          input.dataFim,
      periodo:           input.periodo ?? null,
      tipo_falta_id:     input.tipoFaltaId ?? null,
      justificacao_texto: input.justificacaoTexto?.trim() ?? null,
      dado_saude:        input.dadoSaude ?? false,
      previsivel:        input.previsivel ?? false,
    })
    .select(SEL_FALTA)
    .single()
  if (error) throw error
  return toFalta(data as FaltaRow)
}

export async function atualizarEstadoFalta(id: string, estado: FaltaEstado): Promise<Falta> {
  const patch: Record<string, unknown> = { estado }
  if (estado === 'JUSTIFICADA' || estado === 'INJUSTIFICADA') {
    patch.decidida_em = new Date().toISOString()
  }
  const { data, error } = await db
    .from('faltas')
    .update(patch)
    .eq('id', id)
    .select(SEL_FALTA)
    .single()
  if (error) throw error
  return toFalta(data as FaltaRow)
}
