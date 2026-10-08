import { supabase } from '@/integrations/supabase/client'
import { TABELAS_ELIMINACAO_LEGADA, inicioDiaLisboa, somarDias, type LogRow } from '@/app/lib/auditoria/descrever'

export { limitesPeriodo } from '@/app/lib/auditoria/descrever'

export const PAGE_SIZE = 50
const LIMITE_EXPORT = 5000
const SELECT = 'id, action, actor_id, created_at, details, target_id'

// datas: YYYY-MM-DD (dia de Lisboa) ou um instante ISO já calculado (presets)
export type FiltrosAuditoria = {
  atorId?: string
  tabela?: string
  operacao?: 'insert' | 'update' | 'delete'
  desde?: string
  ate?: string
}

function instanteDesde(v: string): string {
  return v.length > 10 ? v : inicioDiaLisboa(v)
}

function instanteAte(v: string): string {
  return v.length > 10 ? v : inicioDiaLisboa(somarDias(v, 1))
}

const LEGADAS: ReadonlySet<string> = new Set(TABELAS_ELIMINACAO_LEGADA)

// Prefixo da action e não a coluna tabela: funciona também com a BD sem a migration 20261008060000.
// As eliminações antigas gravam 'delete_<tabela>' (trigger audit_delete).
function filtroAction(f: FiltrosAuditoria): { like: string } | { or: string } | null {
  const t = f.tabela
  if (t && LEGADAS.has(t) && (!f.operacao || f.operacao === 'delete')) {
    const generica = f.operacao ? `${t}.delete` : `${t}.%`
    return { or: `action.like.${generica},action.eq.delete_${t}` }
  }
  if (t && f.operacao) return { like: `${t}.${f.operacao}` }
  if (t) return { like: `${t}.%` }
  if (f.operacao === 'delete') return { or: 'action.like.%.delete,action.like.delete_%' }
  if (f.operacao) return { like: `%.${f.operacao}` }
  return null
}

export async function listarAuditoria(f: FiltrosAuditoria, pagina: number): Promise<{ rows: LogRow[]; total: number }> {
  const de = pagina * PAGE_SIZE
  let query = supabase
    .from('audit_log')
    .select(SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
  if (f.atorId) query = query.eq('actor_id', f.atorId)
  const filtro = filtroAction(f)
  if (filtro && 'like' in filtro) query = query.like('action', filtro.like)
  else if (filtro) query = query.or(filtro.or)
  if (f.desde) query = query.gte('created_at', instanteDesde(f.desde))
  if (f.ate) query = query.lt('created_at', instanteAte(f.ate))
  const { data, count, error } = await query.range(de, de + PAGE_SIZE - 1)
  if (error) throw error
  return { rows: (data ?? []) as LogRow[], total: count ?? 0 }
}

export async function exportarAuditoria(f: FiltrosAuditoria): Promise<LogRow[]> {
  let query = supabase
    .from('audit_log')
    .select(SELECT)
    .order('created_at', { ascending: false })
  if (f.atorId) query = query.eq('actor_id', f.atorId)
  const filtro = filtroAction(f)
  if (filtro && 'like' in filtro) query = query.like('action', filtro.like)
  else if (filtro) query = query.or(filtro.or)
  if (f.desde) query = query.gte('created_at', instanteDesde(f.desde))
  if (f.ate) query = query.lt('created_at', instanteAte(f.ate))
  const { data, error } = await query.range(0, LIMITE_EXPORT - 1)
  if (error) throw error
  return (data ?? []) as LogRow[]
}

export async function listarPerfisNomes(): Promise<{ id: string; nome: string }[]> {
  const { data, error } = await supabase.from('profiles').select('id, nome')
  if (error) throw error
  return data ?? []
}
