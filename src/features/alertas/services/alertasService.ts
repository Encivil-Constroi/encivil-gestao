import { supabase } from '@/integrations/supabase/client'
import type { Alerta, AlertaTipo, AlertaEstado, AlertaSeveridade } from '@/app/types'

type AlertaRow = {
  id: string
  regra_id: string
  entidade_id: string
  estado: AlertaEstado
  severidade: AlertaSeveridade
  valor_atual: number | null
  valor_limiar: number | null
  criado_em: string
  atualizado_em: string
  reconhecido_por: string | null
  reconhecido_em: string | null
  resolvido_por: string | null
  resolvido_em: string | null
  // alertas_detalhados
  regra_tipo: AlertaTipo | null
  entidade_alvo: string | null
  campo_ref: string | null
  limiar_atencao: number | null
  limiar_urgente: number | null
  entidade_nome: string | null
  entidade_detalhe: string | null
}

function toAlerta(row: AlertaRow): Alerta {
  return {
    id: row.id,
    regraId: row.regra_id,
    entidadeId: row.entidade_id,
    estado: row.estado,
    severidade: row.severidade,
    valorAtual: row.valor_atual ?? undefined,
    valorLimiar: row.valor_limiar ?? undefined,
    criadoEm: new Date(row.criado_em),
    atualizadoEm: new Date(row.atualizado_em),
    reconhecidoPor: row.reconhecido_por ?? undefined,
    reconhecidoEm: row.reconhecido_em ? new Date(row.reconhecido_em) : undefined,
    resolvidoPor: row.resolvido_por ?? undefined,
    resolvidoEm: row.resolvido_em ? new Date(row.resolvido_em) : undefined,
    regraTipo: row.regra_tipo ?? undefined,
    entidadeAlvo: row.entidade_alvo ?? undefined,
    entidadeNome: row.entidade_nome ?? undefined,
    entidadeDetalhe: row.entidade_detalhe ?? undefined,
  }
}

export async function listarAlertasAtivos(): Promise<Alerta[]> {
  const { data, error } = await supabase
    .from('alertas_detalhados')
    .select('*')
    .in('estado', ['ATIVO', 'RECONHECIDO'])
    .order('severidade', { ascending: true }) // URGENTE vem antes (U > A alfabeticamente desc)
    .order('criado_em', { ascending: false })
  if (error) throw error
  // Ordenar URGENTE antes de ATENCAO
  const rows = (data as AlertaRow[]).map(toAlerta)
  return rows.sort((a, b) => {
    if (a.severidade === b.severidade) return 0
    return a.severidade === 'URGENTE' ? -1 : 1
  })
}

export async function listarTodosAlertas(): Promise<Alerta[]> {
  const { data, error } = await supabase
    .from('alertas_detalhados')
    .select('*')
    .order('criado_em', { ascending: false })
  if (error) throw error
  return (data as AlertaRow[]).map(toAlerta)
}

export async function reconhecerAlerta(id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('alertas')
    .update({
      estado: 'RECONHECIDO' as AlertaEstado,
      reconhecido_por: user?.id ?? null,
      reconhecido_em: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

export async function resolverAlerta(id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('alertas')
    .update({
      estado: 'RESOLVIDO' as AlertaEstado,
      resolvido_por: user?.id ?? null,
      resolvido_em: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

export async function avaliarAlertas(): Promise<number> {
  const { data, error } = await supabase.rpc('avaliar_regras_alerta')
  if (error) throw error
  return data as number
}

export function labelTipo(tipo: AlertaTipo | undefined): string {
  switch (tipo) {
    case 'REVISAO_KM':   return 'Revisão (km)'
    case 'REVISAO_DATA': return 'Revisão (data)'
    case 'SEGURO':       return 'Seguro'
    case 'IPO':          return 'IPO'
    case 'SUPLEMENTAR':  return 'Suplementar'
    case 'VALIDADE_DOC': return 'Validade Doc.'
    case 'EPI_VALIDADE': return 'EPI'
    case 'FORMACAO_VALIDADE': return 'Formação'
    default: return tipo ?? '—'
  }
}
