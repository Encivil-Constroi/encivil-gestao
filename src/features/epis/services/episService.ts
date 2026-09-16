import { supabase } from '@/integrations/supabase/client'
import type { TipoEpi, AtribuicaoEpi } from '@/app/types'

type TipoRow = {
  id: string; designacao: string; validade_dias: number | null; obrigatorio: boolean;
}
type AtribRow = {
  id: string; colaborador_id: string; tipo_epi_id: string;
  data_entrega: string; data_validade: string | null;
  devolvido: boolean; data_devolucao: string | null; regra_alerta_id: string | null;
  colaboradores?: { nome: string } | null;
  tipos_epi?: { designacao: string } | null;
}

const SELECT_ATRIB = '*, colaboradores(nome), tipos_epi(designacao)'

function toTipoEpi(r: TipoRow): TipoEpi {
  return {
    id: r.id, designacao: r.designacao,
    validadeDias: r.validade_dias ?? undefined, obrigatorio: r.obrigatorio,
  }
}

function toAtribuicao(r: AtribRow): AtribuicaoEpi {
  return {
    id: r.id, colaboradorId: r.colaborador_id,
    colaboradorNome: r.colaboradores?.nome,
    tipoEpiId: r.tipo_epi_id,
    tipoEpiDesignacao: r.tipos_epi?.designacao,
    dataEntrega: r.data_entrega,
    dataValidade: r.data_validade ?? undefined,
    devolvido: r.devolvido,
    dataDevolucao: r.data_devolucao ?? undefined,
    regraAlertaId: r.regra_alerta_id ?? undefined,
  }
}

export async function listarTiposEpi(): Promise<TipoEpi[]> {
  const { data, error } = await supabase
    .from('tipos_epi')
    .select('*')
    .order('designacao')
  if (error) throw error
  return (data as TipoRow[]).map(toTipoEpi)
}

export async function listarEpisColaborador(colaboradorId: string): Promise<AtribuicaoEpi[]> {
  const { data, error } = await supabase
    .from('atribuicoes_epi')
    .select(SELECT_ATRIB)
    .eq('colaborador_id', colaboradorId)
    .order('data_entrega', { ascending: false })
  if (error) throw error
  return (data as AtribRow[]).map(toAtribuicao)
}

export type NovaAtribuicaoEpi = {
  colaboradorId: string;
  tipoEpiId: string;
  dataEntrega: string;
}

export async function atribuirEpi(input: NovaAtribuicaoEpi): Promise<AtribuicaoEpi> {
  const { data, error } = await supabase
    .from('atribuicoes_epi')
    .insert({
      colaborador_id: input.colaboradorId,
      tipo_epi_id: input.tipoEpiId,
      data_entrega: input.dataEntrega,
    })
    .select(SELECT_ATRIB)
    .single()
  if (error) throw error
  return toAtribuicao(data as AtribRow)
}

export async function devolverEpi(id: string, dataDevolucao: string): Promise<AtribuicaoEpi> {
  const { data, error } = await supabase
    .from('atribuicoes_epi')
    .update({ devolvido: true, data_devolucao: dataDevolucao })
    .eq('id', id)
    .select(SELECT_ATRIB)
    .single()
  if (error) throw error
  return toAtribuicao(data as AtribRow)
}
