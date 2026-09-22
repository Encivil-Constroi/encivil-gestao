// Formatação partilhada para o módulo de obras/subempreiteiros.

const euroFormatter = new Intl.NumberFormat('pt-PT', {
  style: 'currency',
  currency: 'EUR',
})

export function fmtEuro(value: number | null | undefined): string {
  return euroFormatter.format(Number(value ?? 0))
}

const numberFormatter = new Intl.NumberFormat('pt-PT', {
  maximumFractionDigits: 3,
})

export function fmtNumber(value: number | null | undefined): string {
  return numberFormatter.format(Number(value ?? 0))
}

// Unidades típicas de medição em obra (para artigos de subempreitada).
export const UNIDADES_OBRA = ['un', 'vg', 'm', 'm²', 'm³', 'kg', 'ton', 'h', 'dia', 'mês'] as const

// ── Formatação de datas ──────────────────────────────────────────────────────
// Singletons evitam construir Intl.DateTimeFormat a cada render.

const _dateFormatter     = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
const _dateTimeFormatter = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const _dateShortFormatter = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit' })
const _monthFormatter    = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' })

export const fmtData      = (d: Date | string | null | undefined): string =>
  d ? _dateFormatter.format(new Date(d)) : '—'
export const fmtDataHora  = (d: Date | string | null | undefined): string =>
  d ? _dateTimeFormatter.format(new Date(d)) : '—'
export const fmtDataCurta = (d: Date | string | null | undefined): string =>
  d ? _dateShortFormatter.format(new Date(d)) : '—'
export const fmtMes       = (d: Date | string | null | undefined): string =>
  d ? _monthFormatter.format(new Date(d)) : '—'
