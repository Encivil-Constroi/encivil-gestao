import { supabase } from '@/integrations/supabase/client'
import type { ResumoAssiduidade } from '@/app/types'
import type { Database } from '@/integrations/supabase/types'

type ResumoRow = Database['public']['Tables']['resumo_assiduidade_dia']['Row']

const SELECT = '*, colaboradores(nome)'

function toResumo(r: ResumoRow & { colaboradores?: { nome: string } | null }): ResumoAssiduidade {
  return {
    colaboradorId: r.colaborador_id,
    colaboradorNome: r.colaboradores?.nome,
    data: r.data,
    obraId: r.obra_id ?? undefined,
    horasPrevistas: r.horas_previstas ?? undefined,
    horasEfetivas: r.horas_efetivas ?? undefined,
    desvio: r.desvio ?? undefined,
    horasSuplPropostas: r.horas_supl_propostas ?? undefined,
    horasSuplValidadas: r.horas_supl_validadas ?? undefined,
    validadoPor: r.validado_por ?? undefined,
    validadoEm: r.validado_em ? new Date(r.validado_em) : undefined,
  }
}

export async function listarAssiduidadeMes(
  colaboradorId: string,
  ano: number,
  mes: number // 1-12
): Promise<ResumoAssiduidade[]> {
  const dataIni = `${ano}-${String(mes).padStart(2, '0')}-01`
  const dataFim = new Date(ano, mes, 0).toISOString().slice(0, 10) // último dia do mês

  const { data, error } = await supabase
    .from('resumo_assiduidade_dia')
    .select(SELECT)
    .eq('colaborador_id', colaboradorId)
    .gte('data', dataIni)
    .lte('data', dataFim)
    .order('data')
  if (error) throw error
  return (data as (ResumoRow & { colaboradores: { nome: string } | null })[]).map(toResumo)
}

export async function listarAssiduidadeEquipa(
  ano: number,
  mes: number,
  obraId?: string
): Promise<ResumoAssiduidade[]> {
  const dataIni = `${ano}-${String(mes).padStart(2, '0')}-01`
  const dataFim = new Date(ano, mes, 0).toISOString().slice(0, 10)

  let q = supabase
    .from('resumo_assiduidade_dia')
    .select(SELECT)
    .gte('data', dataIni)
    .lte('data', dataFim)
    .order('data')
  if (obraId) q = q.eq('obra_id', obraId)
  const { data, error } = await q
  if (error) throw error
  return (data as (ResumoRow & { colaboradores: { nome: string } | null })[]).map(toResumo)
}

export async function validarSupplementar(
  colaboradorId: string,
  data: string,
  horasSuplValidadas: number,
  validadoPor: string
): Promise<void> {
  const { error } = await supabase
    .from('resumo_assiduidade_dia')
    .update({
      horas_supl_validadas: horasSuplValidadas,
      validado_por: validadoPor,
      validado_em: new Date().toISOString(),
    })
    .eq('colaborador_id', colaboradorId)
    .eq('data', data)
  if (error) throw error
}
