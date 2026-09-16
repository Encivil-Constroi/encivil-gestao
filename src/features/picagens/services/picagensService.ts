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

// F5: colunas PostGIS não estão no tipo gerado — estendidas com interseção
type RowWithJoins = PicagemRow & {
  colaboradores: { nome: string } | null
  obras: { nome: string } | null
  precisao_m?: number | null
  distancia_geofence_m?: number | null
  mock_location_detetada?: boolean | null
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
    precisaoM: r.precisao_m ?? undefined,
    distanciaGeofenceM: r.distancia_geofence_m ?? undefined,
    mockLocationDetetada: r.mock_location_detetada ?? undefined,
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

// ── F5 — RPC com validação geofence ─────────────────────────────────────────

export type GeofencePicagemInput = NovaPicagem & {
  lat: number
  lon: number
  precisaoM: number
}

export type GeofenceRpcResult = {
  id: string
  resultado: ResultadoPicagem
  distanciaM: number | null
}

type GeofenceRpcParams = {
  p_colaborador_id: string; p_obra_id: string; p_tipo: string
  p_lat: number; p_lon: number; p_precisao_m: number; p_timestamp_disp: string
}
type GeofenceRpcData = { id: string; resultado: string; distancia_m: number | null }

// supabase.rpc é tipado com os RPCs do schema gerado — cast necessário até migration ser aplicada
type RpcFn = (name: 'registar_picagem_geofence', params: GeofenceRpcParams) => Promise<{ data: GeofenceRpcData | null; error: { message: string } | null }>

export async function registarPicagemGeofence(input: GeofencePicagemInput): Promise<GeofenceRpcResult> {
  const rpc = supabase.rpc as unknown as RpcFn
  const { data, error } = await rpc('registar_picagem_geofence', {
    p_colaborador_id: input.colaboradorId,
    p_obra_id:        input.obraId,
    p_tipo:           input.tipo,
    p_lat:            input.lat,
    p_lon:            input.lon,
    p_precisao_m:     input.precisaoM,
    p_timestamp_disp: input.timestampDispositivo,
  })
  if (error) throw error
  if (!data) throw new Error('Sem resposta da RPC registar_picagem_geofence')
  return {
    id:         data.id,
    resultado:  data.resultado as ResultadoPicagem,
    distanciaM: data.distancia_m,
  }
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
