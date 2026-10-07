export type Period = 'hoje' | 'semana' | 'mes' | 'ano'

const fmtDiaLisboa = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit',
})

// YYYY-MM-DD do dia civil em Lisboa. `toISOString()` dá o dia em UTC, que no verão
// atira para o dia anterior tudo o que acontece entre as 00:00 e as 01:00 locais.
export function diaLisboa(d: Date): string {
  return fmtDiaLisboa.format(d)
}

export function getPeriodConfig(p: Period, now: Date = new Date()) {
  const currFrom = new Date(now)
  const prevFrom = new Date(now)
  const prevTo   = new Date(now)

  if (p === 'hoje') {
    currFrom.setHours(0, 0, 0, 0)
    prevFrom.setDate(prevFrom.getDate() - 1); prevFrom.setHours(0, 0, 0, 0)
    prevTo.setDate(prevTo.getDate() - 1); prevTo.setHours(23, 59, 59, 999)
    return { currFrom, prevFrom, prevTo, label: 'Hoje', prevLabel: 'Ontem' }
  }
  if (p === 'semana') {
    currFrom.setDate(currFrom.getDate() - 7)
    prevFrom.setDate(prevFrom.getDate() - 14)
    prevTo.setDate(prevTo.getDate() - 7)
    return { currFrom, prevFrom, prevTo, label: 'Esta Semana', prevLabel: 'Semana anterior' }
  }
  if (p === 'mes') {
    currFrom.setMonth(currFrom.getMonth() - 1)
    prevFrom.setMonth(prevFrom.getMonth() - 2)
    prevTo.setMonth(prevTo.getMonth() - 1)
    return { currFrom, prevFrom, prevTo, label: 'Este Mês', prevLabel: 'Mês anterior' }
  }
  currFrom.setFullYear(currFrom.getFullYear() - 1)
  prevFrom.setFullYear(prevFrom.getFullYear() - 2)
  prevTo.setFullYear(prevTo.getFullYear() - 1)
  return { currFrom, prevFrom, prevTo, label: 'Este Ano', prevLabel: 'Ano anterior' }
}

// Datas civis (Lisboa) do período atual, para filtrar colunas `date` na BD.
export function intervaloDatas(p: Period, now: Date = new Date()): { ini: string; fim: string } {
  return { ini: diaLisboa(getPeriodConfig(p, now).currFrom), fim: diaLisboa(now) }
}
