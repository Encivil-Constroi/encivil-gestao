import { supabase } from '@/integrations/supabase/client'
import type { Picagem, TipoPicagem, ResultadoPicagem, OrigemPicagem } from '@/app/types'
import type { Database } from '@/integrations/supabase/types'

type PicagemRow = Database['public']['Tables']['picagens']['Row']

const SELECT = '*, colaboradores(nome), obras(nome)'

export type NovaPicagem = {
  colaboradorId: string
  obraId: string
  tipo: TipoPicagem
  timestampDispositivo: string
  origem?: OrigemPicagem
}

export type ValidacaoPicagem = {
  resultado: ResultadoPicagem
  horaFinalValidada?: string
  justificacao?: string
  validadaPor: string
}

type RowWithJoins = PicagemRow & {
  colaboradores: { nome: string } | null
  obras: { nome: string } | null
}

function toPicagem(r: RowWithJoins): Picagem {
  return {
    id: r.id,
    colaboradorId: r.colaborador_id,
    colaboradorNome: r.colaboradores?.nome,
    obraId: r.obra_id,
    obraNome: r.obras?.nome,
    tipo: r.tipo as TipoPicagem,
    timestampDispositivo: new Date(r.timestamp_dispositivo),
    timestampServidor: new Date(r.timestamp_servidor),
    desvioRelogioS: r.desvio_relogio_s ?? undefined,
    resultado: r.resultado as ResultadoPicagem,
    origem: r.origem as OrigemPicagem,
    horaOriginalProposta: r.hora_original_proposta ? new Date(r.hora_original_proposta) : undefined,
    horaFinalValidada: r.hora_final_validada ? new Date(r.hora_final_validada) : undefined,
    justificacao: r.justificacao ?? undefined,
    validadaPor: r.validada_por ?? undefined,
    validadaEm: r.validada_em ? new Date(r.validada_em) : undefined,
  }
}

export async function registarPicagem(input: NovaPicagem): Promise<Picagem> {
  const { data, error } = await supabase
    .from('picagens')
    .insert({
      colaborador_id:        input.colaboradorId,
      obra_id:               input.obraId,
      tipo:                  input.tipo,
      timestamp_dispositivo: input.timestampDispositivo,
      origem:                input.origem ?? 'ONLINE',
    })
    .select(SELECT)
    .single()
  if (error) throw error
  return toPicagem(data as RowWithJoins)
}

// Chamado ao sincronizar um item da fila offline.
// Calcula o desvio de relógio em segundos.
export async function registarPicagemOffline(input: NovaPicagem, timestampServidor: Date): Promise<Picagem> {
  const tsDisp = new Date(input.timestampDispositivo)
  const desvio = Math.round((timestampServidor.getTime() - tsDisp.getTime()) / 1000)

  const { data, error } = await supabase
    .from('picagens')
    .insert({
      colaborador_id:        input.colaboradorId,
      obra_id:               input.obraId,
      tipo:                  input.tipo,
      timestamp_dispositivo: input.timestampDispositivo,
      timestamp_servidor:    timestampServidor.toISOString(),
      desvio_relogio_s:      desvio,
      origem:                'OFFLINE',
    })
    .select(SELECT)
    .single()
  if (error) throw error
  return toPicagem(data as RowWithJoins)
}

export async function listarPicagensDia(colaboradorId: string, data: string): Promise<Picagem[]> {
  const { data: rows, error } = await supabase
    .from('picagens')
    .select(SELECT)
    .eq('colaborador_id', colaboradorId)
    .gte('timestamp_dispositivo', `${data}T00:00:00`)
    .lte('timestamp_dispositivo', `${data}T23:59:59`)
    .order('timestamp_dispositivo', { ascending: true })
  if (error) throw error
  return (rows as RowWithJoins[]).map(toPicagem)
}

export async function listarPicagensObraDia(obraId: string, data: string): Promise<Picagem[]> {
  const { data: rows, error } = await supabase
    .from('picagens')
    .select(SELECT)
    .eq('obra_id', obraId)
    .gte('timestamp_dispositivo', `${data}T00:00:00`)
    .lte('timestamp_dispositivo', `${data}T23:59:59`)
    .order('timestamp_dispositivo', { ascending: true })
  if (error) throw error
  return (rows as RowWithJoins[]).map(toPicagem)
}

export async function validarPicagem(id: string, params: ValidacaoPicagem): Promise<void> {
  const { error } = await supabase
    .from('picagens')
    .update({
      resultado:           params.resultado,
      hora_final_validada: params.horaFinalValidada ?? null,
      justificacao:        params.justificacao ?? null,
      validada_por:        params.validadaPor,
      validada_em:         new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

// Preserva hora_original_proposta para auditoria quando o gestor corrige.
export async function corrigirHoraPicagem(
  id: string,
  horaOriginalProposta: string,
  horaFinalValidada: string,
  validadaPor: string
): Promise<void> {
  const { error } = await supabase
    .from('picagens')
    .update({
      hora_original_proposta: horaOriginalProposta,
      hora_final_validada:    horaFinalValidada,
      validada_por:           validadaPor,
      validada_em:            new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

export async function buscarColaboradorPorUserId(userId: string): Promise<{ id: string; nome: string } | null> {
  const { data } = await supabase
    .from('colaboradores')
    .select('id, nome')
    .eq('user_id', userId)
    .eq('ativo', true)
    .maybeSingle()
  return data ?? null
}
