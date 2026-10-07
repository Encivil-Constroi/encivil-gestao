// Espelha a política do Supabase Auth (Dashboard → Auth → Passwords):
// mínimo 12, minúsculas + maiúsculas + algarismos. O servidor é quem manda;
// isto só dá a mensagem certa antes de enviar.
export const SENHA_MIN = 12
export const DICA_SENHA = 'Mínimo 12 caracteres, com maiúscula, minúscula e algarismo.'
export type FalhaSenha = 'curta' | 'sem_minuscula' | 'sem_maiuscula' | 'sem_digito'

export function validarSenha(s: string): FalhaSenha[] {
  const f: FalhaSenha[] = []
  if (s.length < SENHA_MIN) f.push('curta')
  if (!/[a-z]/.test(s)) f.push('sem_minuscula')
  if (!/[A-Z]/.test(s)) f.push('sem_maiuscula')
  if (!/[0-9]/.test(s)) f.push('sem_digito')
  return f
}

const TEXTO: Record<FalhaSenha, string> = {
  curta: `pelo menos ${SENHA_MIN} caracteres`,
  sem_minuscula: 'uma minúscula',
  sem_maiuscula: 'uma maiúscula',
  sem_digito: 'um algarismo',
}

export function mensagemSenha(f: FalhaSenha[]): string | null {
  if (f.length === 0) return null
  const partes = f.map(x => TEXTO[x])
  const lista = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`
  return `A palavra-passe tem de ter ${lista}.`
}
