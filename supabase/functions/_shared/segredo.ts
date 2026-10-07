// Comparação em tempo constante: não revela pelo tempo de resposta quantos
// caracteres do segredo acertaram.
export function igualSeguro(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  let dif = ea.length ^ eb.length
  const n = Math.max(ea.length, eb.length)
  for (let i = 0; i < n; i++) dif |= (ea[i] ?? 0) ^ (eb[i] ?? 0)
  return dif === 0
}

// Falha fechada: sem segredo configurado, ninguém entra
export function autorizadoPorSegredo(cabecalho: string | null, segredo: string): boolean {
  if (!segredo) return false
  return igualSeguro(cabecalho ?? '', `Bearer ${segredo}`)
}
