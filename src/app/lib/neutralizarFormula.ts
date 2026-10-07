// Excel/LibreOffice executam células que comecem por = + - @ (e tab/CR antes deles).
// Um apóstrofo à frente força texto. Números negativos genuínos não são tocados.
const PERIGOSO = /^[=+\-@\t\r]/
const NUMERO = /^-?\d+([.,]\d+)?$/

export function neutralizarFormula(v: unknown): unknown {
  if (typeof v !== 'string') return v
  if (!PERIGOSO.test(v) || NUMERO.test(v)) return v
  return `'${v}`
}
