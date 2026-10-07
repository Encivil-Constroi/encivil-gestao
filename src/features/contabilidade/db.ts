import { supabase } from '@/integrations/supabase/client'

// Os tipos gerados ainda não conhecem colaboradores_dados_laborais, as colunas
// fiscais de faturas_fornecedor nem os embeds usados nas exportações. Interface
// mínima do query builder (sem `any`); apagar quando os tipos forem regenerados.
type Resultado = { data: unknown; error: { message: string } | null }

export interface Consulta extends PromiseLike<Resultado> {
  select(colunas: string): Consulta
  eq(coluna: string, valor: string | number | boolean): Consulta
  gte(coluna: string, valor: string): Consulta
  lt(coluna: string, valor: string): Consulta
  lte(coluna: string, valor: string): Consulta
  or(filtro: string): Consulta
  order(coluna: string, opcoes?: { ascending: boolean }): Consulta
}

export const contabDb = supabase as unknown as { from(tabela: string): Consulta }

// Linha da RPC contabilidade_mapa_assiduidade (migration 20261007100000)
export type FaltaDetalhe = { tipo: string; estado: string; dias: number }

export type LinhaMapaAssiduidade = {
  colaborador_id: string
  numero_mecan: string
  nome: string
  nif: string | null
  niss: string | null
  cargo: string | null
  dias_trabalhados: number
  horas_normais: number
  horas_extra_util_25: number
  horas_extra_util_375: number
  horas_extra_descanso_50: number
  horas_extra_total: number
  dias_subsidio_alimentacao: number
  faltas_justificadas_dias: number
  faltas_injustificadas_dias: number
  faltas_descontaveis_dias: number
  faltas_detalhe: FaltaDetalhe[]
}

// Linha da RPC contabilidade_dados_laborais (migration 20261008080000)
export type LinhaDadosLaborais = {
  numero_mecan: string
  nome: string
  nif: string | null
  cargo: string | null
  ativo: boolean
  niss: string | null
  iban: string | null
  data_admissao: string | null
  tipo_contrato: string | null
  data_fim_contrato: string | null
  categoria_profissional: string | null
}

export type FaturaExportRow = {
  numero_fatura: string | null
  fornecedor: string
  nif_fornecedor: string | null
  data_fatura: string | null
  data_recepcao: string
  base_tributavel: number | null
  valor_iva: number | null
  total_fatura: number | null
  estado: string
  lancado_em: string | null
  obras: { nome: string } | null
}
