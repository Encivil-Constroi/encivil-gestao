import { supabase } from '@/integrations/supabase/client'
import { rpcSemTipos } from '@/app/lib/rpcSemTipos'
import { segurancaDb } from '../db'

export type NivelMfa = { atual: 'aal1' | 'aal2'; seguinte: 'aal1' | 'aal2' }
export type FatorTotp = { id: string; nome: string | null; criadoEm: string }
export type RegistoTotp = { fatorId: string; qrSvg: string; segredo: string }

// Códigos de "relação/função não existe": o site pode estar publicado antes da migration
export const SEM_OBJETO = new Set(['42P01', 'PGRST205', 'PGRST202', '42883'])

const nivel = (n: string | null | undefined): 'aal1' | 'aal2' => (n === 'aal2' ? 'aal2' : 'aal1')

export async function nivelMfa(): Promise<NivelMfa> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error) throw error
  return { atual: nivel(data.currentLevel), seguinte: nivel(data.nextLevel) }
}

export async function listarFatores(): Promise<FatorTotp[]> {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) throw error
  return data.totp
    .filter(f => f.status === 'verified')
    .map(f => ({ id: f.id, nome: f.friendly_name ?? null, criadoEm: f.created_at }))
}

export async function iniciarRegisto(): Promise<RegistoTotp> {
  // Um registo abandonado a meio fica "unverified" e bloqueia um novo com o mesmo nome
  const { data: lista } = await supabase.auth.mfa.listFactors()
  for (const f of lista?.all ?? []) {
    if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `ENCIVIL ${new Date().toISOString().slice(0, 16)}`,
  })
  if (error) throw error
  return { fatorId: data.id, qrSvg: data.totp.qr_code, segredo: data.totp.secret }
}

export async function verificarCodigo(fatorId: string, codigo: string): Promise<true> {
  const c = codigo.replace(/\s/g, '')
  if (!/^\d{6}$/.test(c)) throw new Error('O código tem 6 algarismos.')
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fatorId, code: c })
  if (error) throw new Error('Código inválido ou expirado. Tenta o código atual da app.')
  return true
}

export async function removerFator(fatorId: string): Promise<true> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId: fatorId })
  if (error) throw error
  return true
}

export async function mfaObrigatorio(): Promise<boolean> {
  const { data, error } = await segurancaDb
    .from('seguranca_config')
    .select('mfa_obrigatorio')
    .eq('id', true)
    .maybeSingle()
  if (error) {
    if (error.code && SEM_OBJETO.has(error.code)) return false
    throw error
  }
  return data?.mfa_obrigatorio ?? false
}

export async function definirMfaObrigatorio(ativo: boolean): Promise<boolean> {
  const r = await rpcSemTipos<{ mfa_obrigatorio: boolean }>('definir_mfa_obrigatorio', { p_ativo: ativo })
  return r.mfa_obrigatorio
}
