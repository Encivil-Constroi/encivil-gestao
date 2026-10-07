import { colaboradoresDb, type DadosLaborais } from '../db'

const SELECT = 'colaborador_id, niss, iban, data_admissao, tipo_contrato, data_fim_contrato, categoria_profissional'

export async function buscarDadosLaborais(colaboradorId: string): Promise<DadosLaborais | null> {
  const { data, error } = await colaboradoresDb
    .from('colaboradores_dados_laborais')
    .select(SELECT)
    .eq('colaborador_id', colaboradorId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function guardarDadosLaborais(d: DadosLaborais): Promise<DadosLaborais> {
  const { data, error } = await colaboradoresDb
    .from('colaboradores_dados_laborais')
    .upsert({ ...d, updated_at: new Date().toISOString() }, { onConflict: 'colaborador_id' })
    .select(SELECT)
    .single()
  if (error) throw error
  return data
}
