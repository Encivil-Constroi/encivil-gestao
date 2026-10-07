const CHAVE_RECENTES = 'encivil:wa-recentes'
const MAX_RECENTES = 5

export function normalizarNumero(input: string): string | null {
  let s = input.trim().replace(/[\s().-]/g, '')
  let internacional = false
  if (s.startsWith('+')) { s = s.slice(1); internacional = true }
  else if (s.startsWith('00')) { s = s.slice(2); internacional = true }
  else if (/^[29]\d{8}$/.test(s)) s = `351${s}`
  if (!/^\d+$/.test(s)) return null
  if (s.startsWith('351')) return /^351[29]\d{8}$/.test(s) ? s : null
  // Sem prefixo internacional, só números portugueses são aceites.
  if (!internacional) return null
  return /^[1-9]\d{7,14}$/.test(s) ? s : null
}

export function formatarNumero(n: string): string {
  const m = /^351([29]\d{2})(\d{3})(\d{3})$/.exec(n)
  return m ? `+351 ${m[1]} ${m[2]} ${m[3]}` : `+${n}`
}

export function linkWhatsApp(numero: string, texto: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
}

export function numerosRecentes(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(CHAVE_RECENTES) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENTES) : []
  } catch {
    return []
  }
}

export function guardarNumeroRecente(n: string): void {
  try {
    const lista = [n, ...numerosRecentes().filter(x => x !== n)].slice(0, MAX_RECENTES)
    localStorage.setItem(CHAVE_RECENTES, JSON.stringify(lista))
  } catch {
    // armazenamento indisponível: os recentes são só conveniência
  }
}
