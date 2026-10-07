export type Tendencia = { pct: number; dir: 'up' | 'down' | 'neutral' } | null

export function calcTrend(curr: number, prev: number): Tendencia {
  if (prev === 0) return null
  const pct = ((curr - prev) / prev) * 100
  return { pct: Math.abs(Math.round(pct)), dir: pct > 1 ? 'up' : pct < -1 ? 'down' : 'neutral' }
}
