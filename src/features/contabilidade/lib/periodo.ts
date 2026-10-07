const FUSO = 'Europe/Lisbon'

const PARTES = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

function partes(instante: Date): { y: number; m: number; d: number; h: number; mi: number; s: number } {
  const p = Object.fromEntries(PARTES.formatToParts(instante).map(x => [x.type, x.value]))
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second }
}

// Início (00:00 em Lisboa) do dia civil y-m-d, em ISO UTC.
function inicioDiaLisboa(y: number, m: number, d: number): string {
  const meiaNoiteUtc = Date.UTC(y, m - 1, d)
  const p = partes(new Date(meiaNoiteUtc))
  const localComoUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s)
  return new Date(meiaNoiteUtc - (localComoUtc - meiaNoiteUtc)).toISOString()
}

function ymd(s: string): [number, number, number] {
  const [y, m, d] = s.split('-').map(Number)
  return [y, m, d]
}

/** Limites para `.gte(desde)` e `.lt(ate)` sobre colunas timestamptz, em dias civis de Lisboa. */
export function limitesLisboa(dataInicio?: string, dataFim?: string): { desde?: string; ate?: string } {
  const out: { desde?: string; ate?: string } = {}
  if (dataInicio) out.desde = inicioDiaLisboa(...ymd(dataInicio))
  if (dataFim) {
    const [y, m, d] = ymd(dataFim)
    const seguinte = new Date(Date.UTC(y, m - 1, d + 1))
    out.ate = inicioDiaLisboa(seguinte.getUTCFullYear(), seguinte.getUTCMonth() + 1, seguinte.getUTCDate())
  }
  return out
}

const pad = (n: number) => String(n).padStart(2, '0')

function mes(y: number, m: number): { dataInicio: string; dataFim: string } {
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { dataInicio: `${y}-${pad(m)}-01`, dataFim: `${y}-${pad(m)}-${pad(ultimo)}` }
}

export function mesAtual(hoje = new Date()): { dataInicio: string; dataFim: string } {
  const { y, m } = partes(hoje)
  return mes(y, m)
}

export function mesAnterior(hoje = new Date()): { dataInicio: string; dataFim: string } {
  const { y, m } = partes(hoje)
  return m === 1 ? mes(y - 1, 12) : mes(y, m - 1)
}
