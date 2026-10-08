// Espelhado em supabase/functions/admin-utilizadores/regras.ts
export function mensagemRecuperacao(nome: string, link: string): string {
  const primeiro = nome.trim().split(/\s+/)[0] ?? ''
  const saud = primeiro ? `Olá ${primeiro}` : 'Olá'
  return `${saud}, para criar a sua nova palavra-passe da ENCIVIL Gestão abra este link (pessoal, válido cerca de 1 hora):\n${link}`
}
