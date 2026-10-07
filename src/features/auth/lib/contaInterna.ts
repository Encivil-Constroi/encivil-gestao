// Espelhado em supabase/functions/admin-utilizadores/regras.ts — a Edge Function (Deno) não importa de src/.
export const DOMINIO_CONTA_INTERNA = 'contas.encivilconstroi.com'
export const SENHA_MIN = 8
const LOGIN_RE = /^[a-z0-9._-]{3,40}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizarLogin(v: string): string {
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, '.')
}
export function emailEfetivo(email?: string | null, login?: string | null): string | null {
  const e = (email ?? '').trim().toLowerCase()
  if (e) return EMAIL_RE.test(e) ? e : null
  const l = normalizarLogin(login ?? '')
  return LOGIN_RE.test(l) ? `${l}@${DOMINIO_CONTA_INTERNA}` : null
}
export function loginDeEmail(email: string): string | null {
  const suf = `@${DOMINIO_CONTA_INTERNA}`
  return email.toLowerCase().endsWith(suf) ? email.slice(0, -suf.length) : null
}
export function senhaValida(s: unknown): s is string {
  return typeof s === 'string' && s.length >= SENHA_MIN
}

export function paraEmailLogin(valor: string): string {
  const v = valor.trim()
  return v.includes('@') ? v.toLowerCase() : `${normalizarLogin(v)}@${DOMINIO_CONTA_INTERNA}`
}

// Sem caracteres ambíguos (0/O, 1/l/I) para ditar a senha em obra.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
export function gerarSenha(tamanho = 12): string {
  const bytes = crypto.getRandomValues(new Uint32Array(tamanho))
  return Array.from(bytes, b => ALFABETO[b % ALFABETO.length]).join('')
}
