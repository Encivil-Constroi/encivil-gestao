import { supabase } from '@/integrations/supabase/client'
import type { TipoFormacao, FormacaoColaborador } from '@/app/types'

type TipoRow = {
  id: string; designacao: string; validade_anos: number | null; obrigatoria: boolean;
}
type FormRow = {
  id: string; colaborador_id: string; tipo_id: string;
  data_conclusao: string; data_validade: string | null;
  certificado_key: string | null; entidade: string | null; regra_alerta_id: string | null;
  colaboradores?: { nome: string } | null;
  tipos_formacao?: { designacao: string } | null;
}

const SELECT_FORM = '*, colaboradores(nome), tipos_formacao(designacao)'

function toTipoFormacao(r: TipoRow): TipoFormacao {
  return {
    id: r.id, designacao: r.designacao,
    validadeAnos: r.validade_anos ?? undefined, obrigatoria: r.obrigatoria,
  }
}

function toFormacao(r: FormRow): FormacaoColaborador {
  return {
    id: r.id, colaboradorId: r.colaborador_id,
    colaboradorNome: r.colaboradores?.nome,
    tipoId: r.tipo_id,
    tipoDesignacao: r.tipos_formacao?.designacao,
    dataConclusao: r.data_conclusao,
    dataValidade: r.data_validade ?? undefined,
    certificadoKey: r.certificado_key ?? undefined,
    entidade: r.entidade ?? undefined,
    regraAlertaId: r.regra_alerta_id ?? undefined,
  }
}

export async function listarTiposFormacao(): Promise<TipoFormacao[]> {
  const { data, error } = await supabase
    .from('tipos_formacao')
    .select('*')
    .order('designacao')
  if (error) throw error
  return (data as TipoRow[]).map(toTipoFormacao)
}

export async function listarFormacoesColaborador(colaboradorId: string): Promise<FormacaoColaborador[]> {
  const { data, error } = await supabase
    .from('formacoes_colaborador')
    .select(SELECT_FORM)
    .eq('colaborador_id', colaboradorId)
    .order('data_conclusao', { ascending: false })
  if (error) throw error
  return (data as FormRow[]).map(toFormacao)
}

export type NovaFormacao = {
  colaboradorId: string;
  tipoId: string;
  dataConclusao: string;
  entidade?: string;
  certificadoKey?: string;
}

export async function registarFormacao(input: NovaFormacao): Promise<FormacaoColaborador> {
  const { data, error } = await supabase
    .from('formacoes_colaborador')
    .insert({
      colaborador_id: input.colaboradorId,
      tipo_id: input.tipoId,
      data_conclusao: input.dataConclusao,
      entidade: input.entidade ?? null,
      certificado_key: input.certificadoKey ?? null,
    })
    .select(SELECT_FORM)
    .single()
  if (error) throw error
  return toFormacao(data as FormRow)
}

export async function uploadCertificado(colaboradorId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'pdf'
  const key = `${colaboradorId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('certificados').upload(key, file)
  if (error) throw error
  return key
}
