// Espelho de src/features/auth/lib/contaInterna.ts — a Edge Function (Deno) não importa de src/.
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

/** Traduz erros comuns do GoTrue (inglês) para pt-PT; o resto passa como veio. */
export function traduzErroAuth(msg: string): string {
  if (/already|registered|exists/i.test(msg)) return 'Este email/utilizador já está registado no sistema.'
  if (/password/i.test(msg) && /(weak|short|least|characters|pwned|easy)/i.test(msg)) return 'Senha demasiado fraca. Escolha outra mais forte.'
  return msg
}
