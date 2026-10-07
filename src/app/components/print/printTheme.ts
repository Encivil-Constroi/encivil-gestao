// Tinta fixa: o impresso sai igual em tema claro e escuro.
export const PRINT = {
  TINTA: '#04090F',
  MARCA: '#001C7D',
  SUAVE: '#64748b',
  LINHA: '#e2e8f0',
  FUNDO: '#f8fafc',
  FONTE: "'Geist', system-ui, -apple-system, 'Segoe UI', sans-serif",
  FONTE_MONO: "'Geist Mono', ui-monospace, monospace",
} as const

export function dataHoraLisboa(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('pt-PT', {
    timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d).replace(',', '')
}
