import type { StockStatus } from '@/app/types'

export function calcStatus(stockAtual: number, stockMinimo: number): StockStatus {
  if (stockAtual <= 0)          return 'sem-stock'
  if (stockAtual < stockMinimo) return 'baixo'
  return 'normal'
}
