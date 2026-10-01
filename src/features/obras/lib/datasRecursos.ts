const dataPt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' })
const apresentacao = new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', year: 'numeric' })
const dataHora = new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function hojeLisboa(): string { return dataPt.format(new Date()) }
export function dataLisboa(valor: string | null): string { return valor ? apresentacao.format(new Date(`${valor.slice(0, 10)}T12:00:00Z`)) : '—' }
export function dataHoraLisboa(valor: string | null): string { return valor ? dataHora.format(new Date(valor)) : '—' }
