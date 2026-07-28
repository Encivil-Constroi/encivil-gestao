import { supabase } from '@/integrations/supabase/client'
import type { ToolLoan, LoanStatus, ReturnCondition } from '@/app/types'

type EmprestimoRow = {
  id: string
  ferramenta_id: string
  funcionario_nome: string
  funcionario_documento: string | null
  destino_obra: string | null
  data_emprestimo: string
  data_prevista_devolucao: string | null
  data_devolucao: string | null
  estado: LoanStatus
  condicao_entrega: string | null
  condicao_devolucao: ReturnCondition | null
  observacoes: string | null
  observacoes_devolucao: string | null
  responsavel_entrega: string
  responsavel_recebimento: string | null
  assinatura_entrega: string | null
  assinatura_devolucao: string | null
  assinatura_responsavel_entrega: string | null
  assinatura_responsavel_devolucao: string | null
  obra_id: string | null
  ferramentas: { nome: string; codigo: string } | null
}

function toLoan(row: EmprestimoRow): ToolLoan {
  return {
    id: row.id,
    toolId: row.ferramenta_id,
    toolName: row.ferramentas?.nome ?? '',
    toolCode: row.ferramentas?.codigo ?? '',
    employeeName: row.funcionario_nome,
    employeeDocument: row.funcionario_documento ?? undefined,
    destination: row.destino_obra ?? undefined,
    loanDate: new Date(row.data_emprestimo),
    expectedReturnDate: row.data_prevista_devolucao ? new Date(row.data_prevista_devolucao) : undefined,
    returnDate: row.data_devolucao ? new Date(row.data_devolucao) : undefined,
    status: row.estado,
    deliveryCondition: row.condicao_entrega ?? undefined,
    returnCondition: row.condicao_devolucao ?? undefined,
    notes: row.observacoes ?? undefined,
    returnNotes: row.observacoes_devolucao ?? undefined,
    deliveredBy: row.responsavel_entrega,
    receivedBy: row.responsavel_recebimento ?? undefined,
    obraId: row.obra_id ?? undefined,
    deliverySignature: row.assinatura_entrega ?? undefined,
    returnSignature: row.assinatura_devolucao ?? undefined,
    deliveredBySignature: row.assinatura_responsavel_entrega ?? undefined,
    receivedBySignature: row.assinatura_responsavel_devolucao ?? undefined,
  }
}

export type FiltrosEmprestimos = {
  ferramentaId?: string
  funcionario?: string
  estado?: LoanStatus
  destino?: string
  obraId?: string
  dataInicio?: Date
  dataFim?: Date
  limit?: number
  offset?: number
}

export const LOANS_PAGE_SIZE = 50

export async function listarEmprestimos(filtros: FiltrosEmprestimos = {}): Promise<ToolLoan[]> {
  let q = supabase
    .from('emprestimos_ferramentas')
    .select('*, ferramentas(nome, codigo)')
    .order('data_emprestimo', { ascending: false })
  if (filtros.ferramentaId) q = q.eq('ferramenta_id', filtros.ferramentaId)
  if (filtros.estado)       q = q.eq('estado', filtros.estado)
  if (filtros.funcionario)  q = q.ilike('funcionario_nome', `%${filtros.funcionario}%`)
  if (filtros.destino)      q = q.ilike('destino_obra', `%${filtros.destino}%`)
  if (filtros.obraId)       q = q.eq('obra_id', filtros.obraId)
  if (filtros.dataInicio)   q = q.gte('data_emprestimo', filtros.dataInicio.toISOString())
  if (filtros.dataFim) {
    const fim = new Date(filtros.dataFim); fim.setDate(fim.getDate() + 1)
    q = q.lt('data_emprestimo', fim.toISOString())
  }
  if (filtros.limit)  q = q.limit(filtros.limit)
  if (filtros.offset) q = q.range(filtros.offset, filtros.offset + (filtros.limit ?? 20) - 1)
  const { data, error } = await q
  if (error) throw error
  return (data as EmprestimoRow[]).map(toLoan)
}

export async function listarEmprestimosPaginados(
  filtros: FiltrosEmprestimos = {},
  page = 0,
): Promise<{ data: ToolLoan[]; count: number }> {
  const from = page * LOANS_PAGE_SIZE
  let q = supabase
    .from('emprestimos_ferramentas')
    .select('*, ferramentas(nome, codigo)', { count: 'exact' })
    .order('data_emprestimo', { ascending: false })
    .range(from, from + LOANS_PAGE_SIZE - 1)
  if (filtros.ferramentaId) q = q.eq('ferramenta_id', filtros.ferramentaId)
  if (filtros.estado)       q = q.eq('estado', filtros.estado)
  if (filtros.funcionario)  q = q.ilike('funcionario_nome', `%${filtros.funcionario}%`)
  if (filtros.destino)      q = q.ilike('destino_obra', `%${filtros.destino}%`)
  if (filtros.obraId)       q = q.eq('obra_id', filtros.obraId)
  if (filtros.dataInicio)   q = q.gte('data_emprestimo', filtros.dataInicio.toISOString())
  if (filtros.dataFim) {
    const fim = new Date(filtros.dataFim); fim.setDate(fim.getDate() + 1)
    q = q.lt('data_emprestimo', fim.toISOString())
  }
  const { data, error, count } = await q
  if (error) throw error
  return { data: (data as EmprestimoRow[]).map(toLoan), count: count ?? 0 }
}

export type RegistarEmprestimoInput = {
  toolId: string
  employeeName: string
  deliveredBy: string
  signature: string
  responsibleSignature: string
  employeeDocument?: string
  destination?: string
  obraId?: string
  expectedReturnDate?: string
  deliveryCondition?: string
  notes?: string
}

async function buscarEmprestimoComFerramenta(id: string): Promise<ToolLoan> {
  const { data, error } = await supabase
    .from('emprestimos_ferramentas')
    .select('*, ferramentas(nome, codigo)')
    .eq('id', id)
    .single()
  if (error) throw error
  return toLoan(data as EmprestimoRow)
}

export async function registarEmprestimo(input: RegistarEmprestimoInput): Promise<ToolLoan> {
  const { data, error } = await supabase.rpc('registar_emprestimo_ferramenta', {
    p_ferramenta_id: input.toolId,
    p_funcionario_nome: input.employeeName,
    p_responsavel_entrega: input.deliveredBy,
    p_funcionario_documento: input.employeeDocument,
    p_destino_obra: input.destination,
    p_data_prevista_devolucao: input.expectedReturnDate,
    p_condicao_entrega: input.deliveryCondition,
    p_observacoes: input.notes,
    p_obra_id: input.obraId,
    p_assinatura_entrega: input.signature,
    p_assinatura_responsavel_ent: input.responsibleSignature,
  })
  if (error) throw error

  return buscarEmprestimoComFerramenta((data as unknown as EmprestimoRow).id)
}

export type RegistarDevolucaoInput = {
  loanId: string
  returnCondition: ReturnCondition
  receivedBy: string
  signature: string
  responsibleSignature: string
  returnNotes?: string
}

export async function registarDevolucao(input: RegistarDevolucaoInput): Promise<ToolLoan> {
  const { data, error } = await supabase.rpc('registar_devolucao_ferramenta', {
    p_emprestimo_id: input.loanId,
    p_condicao_devolucao: input.returnCondition,
    p_responsavel_recebimento: input.receivedBy,
    p_observacoes_devolucao: input.returnNotes,
    p_assinatura_devolucao: input.signature,
    p_assinatura_responsavel_dev: input.responsibleSignature,
  })
  if (error) throw error

  return buscarEmprestimoComFerramenta((data as unknown as EmprestimoRow).id)
}
