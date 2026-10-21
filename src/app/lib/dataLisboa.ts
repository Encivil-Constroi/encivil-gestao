// toISOString() converte para UTC: entre as 00:00 e a 01:00 de Lisboa no verão
// devolve o dia anterior. Estas funções evitam essa conversão.
const FUSO = 'Europe/Lisbon'

const pad = (n: number) => String(n).padStart(2, '0')

export function hojeLisboa(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora)
}

export function dataISOLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// A hora muda sempre à 01:00 UTC; a meia-noite de Lisboa (23:00 ou 00:00 UTC)
// cai antes disso, logo tem o mesmo offset que as 00:00 UTC desse dia.
function offsetMeiaNoite(data: string): string {
  const instante = new Date(`${data}T00:00:00Z`)
  const nome = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, timeZoneName: 'longOffset' })
    .formatToParts(instante).find(p => p.type === 'timeZoneName')?.value ?? 'GMT'
  const m = /GMT([+-]\d{2}):?(\d{2})?/.exec(nome)
  return m ? `${m[1]}:${m[2] ?? '00'}` : '+00:00'
}

function diaSeguinte(data: string): string {
  const d = new Date(`${data}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function limitesDiaLisboa(data: string): { inicio: string; fimExclusivo: string } {
  const seguinte = diaSeguinte(data)
  return {
    inicio: `${data}T00:00:00${offsetMeiaNoite(data)}`,
    fimExclusivo: `${seguinte}T00:00:00${offsetMeiaNoite(seguinte)}`,
  }
}
