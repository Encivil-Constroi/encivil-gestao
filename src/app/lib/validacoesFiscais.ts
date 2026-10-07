const soDigitos = (s: string) => s.replace(/\s/g, '')

export function nifValido(s: string): boolean {
  const v = soDigitos(s)
  if (!/^\d{9}$/.test(v) || !'12356789'.includes(v[0])) return false
  const soma = [...v.slice(0, 8)].reduce((a, c, i) => a + Number(c) * (9 - i), 0)
  const c = 11 - (soma % 11)
  return (c >= 10 ? 0 : c) === Number(v[8])
}

const PESOS_NISS = [29, 23, 19, 17, 13, 11, 7, 5, 3, 2]

export function nissValido(s: string): boolean {
  const v = soDigitos(s)
  if (!/^\d{11}$/.test(v)) return false
  const soma = PESOS_NISS.reduce((a, p, i) => a + p * Number(v[i]), 0)
  return 9 - (soma % 10) === Number(v[10])
}

export function ibanValido(s: string): boolean {
  const v = soDigitos(s).toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(v)) return false
  if (v.startsWith('PT') && v.length !== 25) return false
  const rearranjado = v.slice(4) + v.slice(0, 4)
  let resto = 0
  for (const ch of rearranjado) {
    const n = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55)
    for (const d of n) resto = (resto * 10 + Number(d)) % 97
  }
  return resto === 1
}

export function formatarIban(s: string): string {
  return soDigitos(s).toUpperCase().replace(/(.{4})(?=.)/g, '$1 ')
}
