// Espelho de src/features/auth/lib/contaInterna.ts — a Edge Function (Deno) não importa de src/.
export const DOMINIO_CONTA_INTERNA = 'contas.encivilconstroi.com'
// Igual à política do Supabase Auth e a src/features/auth/lib/politicaSenha.ts
export const SENHA_MIN = 12
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
  return typeof s === 'string' && s.length >= SENHA_MIN && /[a-z]/.test(s) && /[A-Z]/.test(s) && /[0-9]/.test(s)
}

/** Traduz erros comuns do GoTrue (inglês) para pt-PT; o resto passa como veio. */
export function traduzErroAuth(msg: string): string {
  if (/already|registered|exists/i.test(msg)) return 'Este email/utilizador já está registado no sistema.'
  if (/password/i.test(msg) && /(weak|short|least|characters|pwned|easy)/i.test(msg)) return 'Senha demasiado fraca. Escolha outra mais forte.'
  return msg
}

// Link para a nossa página e não para o /verify do GoTrue: um GET (pré-visualização do WhatsApp,
// scanners de e-mail) não gasta o token; só o clique em "Continuar" chama verifyOtp.
export function linkRecuperacaoApp(appUrl: string, hashedToken: string): string {
  return `${appUrl}/reset-password?token_hash=${encodeURIComponent(hashedToken)}&type=recovery`
}
