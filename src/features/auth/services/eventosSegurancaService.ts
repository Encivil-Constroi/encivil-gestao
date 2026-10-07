import { rpcSemTipos } from '@/app/lib/rpcSemTipos'
import { segurancaDb } from '../db'
import { SEM_OBJETO } from './mfaService'

const SELECT = 'id, tipo, utilizador_id, email, detalhe, criado_em'
const LIMITE = 200

export type TipoEventoCliente = 'login_ok' | 'mfa_registado' | 'mfa_removido' | 'mfa_falhado'
export type EventoSeguranca = {
  id: string; tipo: string; utilizadorId: string | null; email: string | null
  detalhe: Record<string, unknown>; criadoEm: string
}

// Melhor esforço: o registo nunca pode impedir alguém de entrar
export async function registarEvento(tipo: TipoEventoCliente, detalhe: Record<string, unknown> = {}): Promise<void> {
  try { await rpcSemTipos('registar_evento_seguranca', { p_tipo: tipo, p_detalhe: detalhe }) } catch { /* ignorado */ }
}

export async function registarLoginFalhado(email: string): Promise<void> {
  try { await rpcSemTipos('registar_login_falhado', { p_email: email }) } catch { /* ignorado */ }
}

export async function fetchEventosSeguranca(f: { tipo?: string; desde?: string }): Promise<EventoSeguranca[]> {
  let query = segurancaDb
    .from('eventos_seguranca')
    .select(SELECT)
    .order('criado_em', { ascending: false })
    .limit(LIMITE)
  if (f.tipo) query = query.eq('tipo', f.tipo)
  if (f.desde) query = query.gte('criado_em', f.desde)
  const { data, error } = await query
  if (error) {
    if (error.code && SEM_OBJETO.has(error.code)) return []
    throw error
  }
  return (data ?? []).map(r => ({
    id: r.id, tipo: r.tipo, utilizadorId: r.utilizador_id, email: r.email,
    detalhe: r.detalhe ?? {}, criadoEm: r.criado_em,
  }))
}

export async function contarLoginsFalhados24h(): Promise<number> {
  const desde = new Date(Date.now() - 24 * 3600_000).toISOString()
  const { count, error } = await segurancaDb
    .from('eventos_seguranca')
    .select('id', { count: 'exact', head: true })
    .eq('tipo', 'login_falhado')
    .gte('criado_em', desde)
  if (error) {
    if (error.code && SEM_OBJETO.has(error.code)) return 0
    throw error
  }
  return count ?? 0
}
