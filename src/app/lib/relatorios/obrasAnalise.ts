import type { ObraResumoRow } from '@/features/obras/db'

// Custo já >= 85% do orçamento => risco de estouro.
export const RISCO_LIMIAR = 0.85

const temOrcamento = (o: ObraResumoRow): o is ObraResumoRow & { orcamento: number } =>
  o.orcamento != null && Number(o.orcamento) > 0

export const margemDe = (o: ObraResumoRow): number | null =>
  temOrcamento(o) ? Number(o.orcamento) - Number(o.custo_total) : null

export const margemPctDe = (o: ObraResumoRow): number | null => {
  const m = margemDe(o)
  return m == null ? null : (m / Number(o.orcamento)) * 100
}

// Verde margem >= 15 %, âmbar 0–15 %, vermelho negativa.
export function saudeMargem(o: ObraResumoRow): 'sem-dados' | 'ok' | 'atencao' | 'critico' {
  const pct = margemPctDe(o)
  if (pct == null) return 'sem-dados'
  if (pct < 0) return 'critico'
  return pct < 15 ? 'atencao' : 'ok'
}

// Portefólio = tudo o que não está arquivado/cancelado no painel; a ordem põe ativas primeiro, depois por custo.
const PESO_ESTADO: Record<string, number> = { ativa: 0, planeada: 1, suspensa: 2, concluida: 3 }

export function ordenarPortefolio(obras: ObraResumoRow[]): ObraResumoRow[] {
  return [...obras].sort((a, b) =>
    (PESO_ESTADO[a.estado] ?? 9) - (PESO_ESTADO[b.estado] ?? 9) || Number(b.custo_total) - Number(a.custo_total))
}

export function analiseObras(obras: ObraResumoRow[]) {
  const comOrc = obras.filter(temOrcamento)
  const totalOrcamento = comOrc.reduce((s, o) => s + Number(o.orcamento), 0)
  // Custo e margem comparam como com como: só obras com orçamento entram na margem global.
  const custoComOrc = comOrc.reduce((s, o) => s + Number(o.custo_total), 0)
  const totalCusto = obras.reduce((s, o) => s + Number(o.custo_total), 0)
  const totalMargem = totalOrcamento - custoComOrc
  const margemPct = totalOrcamento > 0 ? (totalMargem / totalOrcamento) * 100 : null

  const noVermelho = comOrc.filter(o => Number(o.custo_total) > Number(o.orcamento))
  const emRisco = comOrc.filter(o => Number(o.custo_total) <= Number(o.orcamento) && Number(o.custo_total) / Number(o.orcamento) >= RISCO_LIMIAR)

  const rank = comOrc.map(o => ({ o, pct: margemPctDe(o)! })).sort((a, b) => b.pct - a.pct)
  return {
    comOrc, totalOrcamento, totalCusto, totalMargem, margemPct, noVermelho, emRisco,
    melhor: rank[0], pior: rank.length > 1 ? rank[rank.length - 1] : undefined,
  }
}
