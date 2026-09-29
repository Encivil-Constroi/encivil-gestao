// Texto dos prazos da frota ("faltam 400 km", "vence em 5 dias"), partilhado
// pela Frota e pela página de Alertas. A mesma regra existe na Edge Function
// send-push-frota (Deno não importa código do site) — mudar as duas juntas.

const km = (n: number) => `${Math.abs(n).toLocaleString('pt-PT')} km`

export function textoFaltamKm(faltam: number): string {
  const n = Math.round(faltam)
  if (n === 0) return 'chegou ao prazo'
  return n > 0 ? `faltam ${km(n)}` : `passou ${km(n)} do prazo`
}

export function textoFaltamDias(faltam: number): string {
  const n = Math.round(faltam)
  if (n > 1)  return `vence em ${n} dias`
  if (n === 1) return 'vence amanhã'
  if (n === 0) return 'vence hoje'
  return n === -1 ? 'atrasado 1 dia' : `atrasado ${-n} dias`
}

// Alertas FROTA_ITEM: valor_limiar preenchido = prazo em km; vazio = em dias
export function textoPrazoAlerta(valorAtual: number | undefined, valorLimiar: number | undefined): string {
  if (valorAtual === undefined) return ''
  return valorLimiar !== undefined ? textoFaltamKm(valorAtual) : textoFaltamDias(valorAtual)
}

// Dias entre hoje e uma data AAAA-MM-DD, em datas de calendário (sem horas)
export function diasAte(dataIso: string, hoje: Date = new Date()): number {
  const [a, m, d] = dataIso.split('-').map(Number)
  const alvo = Date.UTC(a, m - 1, d)
  const base = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  return Math.round((alvo - base) / 86_400_000)
}

export function formatarData(dataIso: string): string {
  const [a, m, d] = dataIso.split('-')
  return `${d}/${m}/${a}`
}
