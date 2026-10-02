import { supabase } from '@/integrations/supabase/client'
import type { TablesUpdate } from '@/integrations/supabase/types'
import type { Measurement, MeasurementLine, EstadoPagamento } from '@/app/types'
import { obrasDb, type WorkflowAuto } from '../db'
import { certificado, retencao } from '../lib/medicao'

type LinhaRow = {
  id: string
  auto_id: string
  artigo_id: string | null
  descricao: string
  unidade: string
  preco_unitario: number
  quantidade: number
  is_extra: boolean
}

type AutoRow = {
  id: string
  subempreiteiro_id: string
  numero: number
  data_medicao: string
  percentagem_periodo: number | null
  valor_periodo: number
  observacoes: string | null
  estado: 'rascunho' | 'validado'
  estado_pagamento: EstadoPagamento
  data_pagamento: string | null
  referencia_pagamento: string | null
  created_at: string
  validado_em: string | null
  validado_por?: string | null
  workflow?: WorkflowAuto | null
  valor_glosado?: number | null
  data_vencimento?: string | null
  fatura_numero?: string | null
  fatura_data?: string | null
  fatura_valor?: number | null
  fatura_path?: string | null
  fatura_nome?: string | null
  fatura_registada_em?: string | null
  excecao_motivo?: string | null
  submetido_por?: string | null
  submetido_em?: string | null
  verificado_por?: string | null
  verificado_em?: string | null
  auto_linhas?: LinhaRow[]
  // join para calcular retenção
  subempreiteiros?: { percentagem_retencao: number } | null
}

function toLine(row: LinhaRow): MeasurementLine {
  return {
    id: row.id,
    autoId: row.auto_id,
    itemId: row.artigo_id ?? undefined,
    description: row.descricao,
    unit: row.unidade,
    unitPrice: Number(row.preco_unitario),
    quantity: Number(row.quantidade),
    isExtra: row.is_extra,
  }
}

export type FaturaAuto = {
  numero: string
  data?: string
  valor?: number
  path?: string
  nome?: string
  registadaEm?: Date
}

export type MedicaoAuto = Measurement & {
  workflow: WorkflowAuto
  valorGlosado: number
  valorCertificado: number
  dataVencimento?: string
  fatura: FaturaAuto | null
  excecaoMotivo?: string
  submetidoPor?: string
  submetidoEm?: Date
  verificadoPor?: string
  verificadoEm?: Date
  validadoPor?: string
}

const emData = (v?: string | null) => (v ? new Date(v) : undefined)

function toMeasurement(row: AutoRow): MedicaoAuto {
  const retencaoPercentagem = Number(row.subempreiteiros?.percentagem_retencao ?? 0)
  const periodValue         = Number(row.valor_periodo)
  const valorGlosado        = Number(row.valor_glosado ?? 0)
  const valorCertificado    = certificado(periodValue, valorGlosado)
  const valorRetido         = retencao(valorCertificado, retencaoPercentagem)
  const workflow: WorkflowAuto = row.workflow ?? (row.estado === 'validado' ? 'validado' : 'rascunho')
  return {
    workflow,
    valorGlosado,
    valorCertificado,
    dataVencimento: row.data_vencimento ?? undefined,
    fatura: row.fatura_numero
      ? {
          numero: row.fatura_numero,
          data: row.fatura_data ?? undefined,
          valor: row.fatura_valor != null ? Number(row.fatura_valor) : undefined,
          path: row.fatura_path ?? undefined,
          nome: row.fatura_nome ?? undefined,
          registadaEm: emData(row.fatura_registada_em),
        }
      : null,
    excecaoMotivo: row.excecao_motivo ?? undefined,
    submetidoPor: row.submetido_por ?? undefined,
    submetidoEm: emData(row.submetido_em),
    verificadoPor: row.verificado_por ?? undefined,
    verificadoEm: emData(row.verificado_em),
    validadoPor: row.validado_por ?? undefined,
    id:                  row.id,
    subcontractorId:     row.subempreiteiro_id,
    number:              row.numero,
    date:                new Date(row.data_medicao),
    periodPercentage:    row.percentagem_periodo ?? undefined,
    periodValue,
    notes:               row.observacoes ?? undefined,
    status:              row.estado,
    createdAt:           new Date(row.created_at),
    validatedAt:         row.validado_em ? new Date(row.validado_em) : undefined,
    lines:               (row.auto_linhas ?? []).map(toLine).sort((a, b) => Number(a.isExtra) - Number(b.isExtra)),
    retencaoPercentagem,
    valorRetido,
    valorLiquido:        valorCertificado - valorRetido,
    estadoPagamento:     row.estado_pagamento ?? 'por_pagar',
    dataPagamento:       row.data_pagamento ? new Date(row.data_pagamento) : undefined,
    referenciaPagamento: row.referencia_pagamento ?? undefined,
  }
}

const SELECT = '*, auto_linhas(*), subempreiteiros(percentagem_retencao)'

export async function listarAutos(subId: string): Promise<MedicaoAuto[]> {
  const { data, error } = await supabase
    .from('autos_medicao')
    .select(SELECT)
    .eq('subempreiteiro_id', subId)
    .order('numero', { ascending: true })
  if (error) throw error
  return (data as AutoRow[]).map(toMeasurement)
}

export async function buscarAuto(id: string): Promise<MedicaoAuto> {
  const { data, error } = await supabase.from('autos_medicao').select(SELECT).eq('id', id).single()
  if (error) throw error
  return toMeasurement(data as AutoRow)
}

export type LinhaInput = {
  itemId?: string
  description: string
  unit: string
  unitPrice: number
  quantity: number
  isExtra?: boolean
}

export type NovoAuto = {
  subcontractorId: string
  date: string
  periodPercentage?: number
  periodValue: number
  notes?: string
  lines?: LinhaInput[]
}

export async function criarAuto(input: NovoAuto): Promise<MedicaoAuto> {
  const { data, error } = await supabase.rpc('criar_auto_rpc', {
    p_sub_id:      input.subcontractorId,
    p_data:        input.date,
    p_percentagem: input.periodPercentage ?? 0,
    p_valor:       input.periodValue,
    p_notas:       input.notes,
  })
  if (error) throw error
  const { id } = (data as { id: string; numero: number }[])[0]
  if (input.lines?.length) await substituirLinhas(id, input.lines)
  return buscarAuto(id)
}

export type AtualizarAuto = Partial<Omit<NovoAuto, 'subcontractorId'>>

export async function atualizarAuto(id: string, input: AtualizarAuto): Promise<MedicaoAuto> {
  const update: Record<string, unknown> = {}
  if (input.date !== undefined)             update.data_medicao = input.date
  if (input.periodPercentage !== undefined) update.percentagem_periodo = input.periodPercentage ?? null
  if (input.periodValue !== undefined)      update.valor_periodo = input.periodValue
  if (input.notes !== undefined)            update.observacoes = input.notes || null

  const { error } = await supabase.from('autos_medicao').update(update as TablesUpdate<'autos_medicao'>).eq('id', id)
  if (error) throw error

  if (input.lines !== undefined) await substituirLinhas(id, input.lines)
  return buscarAuto(id)
}

async function substituirLinhas(autoId: string, lines: LinhaInput[]): Promise<void> {
  const { error: delError } = await supabase.from('auto_linhas').delete().eq('auto_id', autoId)
  if (delError) throw delError
  if (!lines.length) return
  const { error: insError } = await supabase.from('auto_linhas').insert(lines.map(l => ({
    auto_id:       autoId,
    artigo_id:     l.itemId ?? null,
    descricao:     l.description,
    unidade:       l.unit,
    preco_unitario: l.unitPrice,
    quantidade:    l.quantity,
    is_extra:      l.isExtra ?? false,
  })))
  if (insError) throw insError
}

export async function eliminarAuto(id: string): Promise<void> {
  const { error } = await supabase.from('autos_medicao').delete().eq('id', id)
  if (error) throw error
}

export async function validarAuto(id: string, excecaoDocsMotivo?: string): Promise<MedicaoAuto> {
  const { error } = await obrasDb.rpc('auto_aprovar', {
    p_auto_id: id,
    p_excecao_docs_motivo: excecaoDocsMotivo ?? null,
  })
  if (error) throw error
  return buscarAuto(id)
}

export async function marcarAutoPago(id: string, referencia?: string, excecaoMotivo?: string): Promise<void> {
  const { error } = await obrasDb.rpc('marcar_auto_pago', {
    p_auto_id:       id,
    p_referencia:    referencia ?? null,
    p_excecao_motivo: excecaoMotivo ?? null,
  })
  if (error) throw error
}

export async function marcarAutoEmAtraso(id: string): Promise<void> {
  const { error } = await supabase.rpc('marcar_auto_em_atraso', { p_auto_id: id })
  if (error) throw error
}

export type Aprovador = { etapa: 'Submetido' | 'Verificado' | 'Aprovado'; nome: string | null; em?: Date }

// Os perfis só são legíveis pelo próprio e pelo admin: quando o nome não é
// legível fica null e o documento mostra só a data.
export async function listarAprovadores(auto: MedicaoAuto): Promise<Aprovador[]> {
  const etapas: { etapa: Aprovador['etapa']; id?: string; em?: Date }[] = [
    { etapa: 'Submetido',  id: auto.submetidoPor,  em: auto.submetidoEm },
    { etapa: 'Verificado', id: auto.verificadoPor, em: auto.verificadoEm },
    { etapa: 'Aprovado',   id: auto.validadoPor,   em: auto.validatedAt },
  ]
  const ids = [...new Set(etapas.map(e => e.id).filter((i): i is string => !!i))]
  const nomes: Record<string, string> = {}
  if (ids.length) {
    const { data } = await supabase.from('profiles').select('id, nome').in('id', ids)
    ;(data ?? []).forEach(p => { nomes[p.id] = p.nome })
  }
  return etapas
    .filter(e => e.id || e.em)
    .map(e => ({ etapa: e.etapa, nome: e.id ? (nomes[e.id] ?? null) : null, em: e.em }))
}
