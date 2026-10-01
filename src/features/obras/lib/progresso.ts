import type { ProgressoFonte } from '../db'

export function limitarPct(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(Number(n))) return null
  return Math.min(100, Math.max(0, Number(n)))
}

// Data 'YYYY-MM-DD' → nº de dias absoluto (UTC, sem desvios de fuso/hora de verão)
function diaAbsoluto(data: string): number {
  const [a, m, d] = data.slice(0, 10).split('-').map(Number)
  return Math.floor(Date.UTC(a, m - 1, d) / 86_400_000)
}

export function hojeISO(agora = new Date()): string {
  const m = String(agora.getMonth() + 1).padStart(2, '0')
  const d = String(agora.getDate()).padStart(2, '0')
  return `${agora.getFullYear()}-${m}-${d}`
}

export function diasEntre(de: string, ate: string): number {
  return diaAbsoluto(ate) - diaAbsoluto(de)
}

// Mesmo critério do banco: linear entre o início e o fim previstos; sem uma das datas não há esperado
export function progressoEsperado(inicio: string | null, fim: string | null, hoje = hojeISO()): number | null {
  if (!inicio || !fim) return null
  const total = diasEntre(inicio, fim)
  if (total <= 0) return diasEntre(inicio, hoje) >= 0 ? 100 : 0
  const feito = diasEntre(inicio, hoje)
  return Math.round(Math.min(100, Math.max(0, (feito / total) * 100)))
}

// Pontos percentuais de avanço (+) ou atraso (−) face ao esperado
export function desvioProgresso(real: number | null, esperado: number | null): number | null {
  const r = limitarPct(real)
  const e = limitarPct(esperado)
  return r == null || e == null ? null : Math.round(r - e)
}

export type Ritmo = 'adiantado' | 'no_prazo' | 'atrasado' | 'muito_atrasado' | 'sem_dados'

// Limiares iguais aos da saúde no banco: 8 pontos de atraso = atenção, 20 = crítico
export function classificarRitmo(real: number | null, esperado: number | null): Ritmo {
  const d = desvioProgresso(real, esperado)
  if (d == null) return 'sem_dados'
  if (d <= -20) return 'muito_atrasado'
  if (d <= -8) return 'atrasado'
  if (d >= 5) return 'adiantado'
  return 'no_prazo'
}

export const ROTULO_RITMO: Record<Ritmo, string> = {
  adiantado: 'Adiantada',
  no_prazo: 'No ritmo previsto',
  atrasado: 'Atrasada',
  muito_atrasado: 'Muito atrasada',
  sem_dados: 'Sem dados de ritmo',
}

export function textoDesvio(real: number | null, esperado: number | null): string | null {
  const d = desvioProgresso(real, esperado)
  if (d == null) return null
  if (d === 0) return 'Em linha com o previsto'
  return d > 0 ? `${d} pontos à frente do previsto` : `${Math.abs(d)} pontos atrás do previsto`
}

export const ROTULO_FONTE: Record<ProgressoFonte, string> = {
  fases: 'Média ponderada das fases',
  afericao: 'Última aferição do engenheiro',
  subempreitadas: 'Execução das subempreitadas',
  nenhuma: 'Ainda sem progresso registado',
}

// Dias até ao fim previsto (negativo = já passou)
export function diasParaFim(fim: string | null, hoje = hojeISO()): number | null {
  return fim ? diasEntre(hoje, fim) : null
}

export function textoPrazo(fim: string | null, hoje = hojeISO()): string {
  const d = diasParaFim(fim, hoje)
  if (d == null) return 'Sem prazo definido'
  if (d === 0) return 'Termina hoje'
  if (d === 1) return 'Falta 1 dia'
  if (d > 1) return `Faltam ${d} dias`
  return d === -1 ? 'Prazo ultrapassado há 1 dia' : `Prazo ultrapassado há ${Math.abs(d)} dias`
}

export type EstadoPrazo = 'folga' | 'curto' | 'vencido' | 'sem_prazo'

export function estadoPrazo(fim: string | null, hoje = hojeISO()): EstadoPrazo {
  const d = diasParaFim(fim, hoje)
  if (d == null) return 'sem_prazo'
  if (d < 0) return 'vencido'
  return d <= 14 ? 'curto' : 'folga'
}

// Fração do orçamento já gasta; null sem orçamento
export function percentagemOrcamento(custo: number, orcamento: number | null): number | null {
  if (orcamento == null || !(orcamento > 0)) return null
  return Math.round((custo / orcamento) * 100)
}

export type EstadoOrcamento = 'ok' | 'perto' | 'excedido' | 'sem_orcamento'

// 90 % do orçamento é o limiar de atenção da saúde no banco
export function estadoOrcamento(custo: number, orcamento: number | null): EstadoOrcamento {
  const p = percentagemOrcamento(custo, orcamento)
  if (p == null) return 'sem_orcamento'
  if (p > 100) return 'excedido'
  return p >= 90 ? 'perto' : 'ok'
}

export function textoUltimoRelatorio(dias: number | null, ultimo: string | null): string {
  if (ultimo == null || dias == null) return 'Sem relatórios'
  if (dias <= 0) return 'Relatório de hoje'
  if (dias === 1) return 'Último relatório ontem'
  return `Último relatório há ${dias} dias`
}
