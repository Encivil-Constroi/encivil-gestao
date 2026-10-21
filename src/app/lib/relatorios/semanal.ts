import { supabase } from '@/integrations/supabase/client'
import { hojeLisboa, limitesDiaLisboa } from '../dataLisboa'

export type SemanaKey = 'atual' | 'anterior'

export type ResumoSemanal = {
  semanaLabel: string
  entradas: number
  saidas: number
  abastecimentos: number
  totalLitros: number
  totalCombust: number
  ferramAtrasadas: number
  stockCritico: number
  stockBaixo: number
}

function somarDias(iso: string, n: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Segunda a domingo (datas de calendário de Lisboa). */
export function intervaloSemana(key: SemanaKey, agora: Date = new Date()): { inicio: string; fim: string } {
  const hoje = hojeLisboa(agora)
  const [a, m, d] = hoje.split('-').map(Number)
  const diaSemana = (new Date(Date.UTC(a, m - 1, d)).getUTCDay() + 6) % 7
  const inicioAtual = somarDias(hoje, -diaSemana)
  const inicio = key === 'atual' ? inicioAtual : somarDias(inicioAtual, -7)
  return { inicio, fim: somarDias(inicio, 6) }
}

export function rotuloSemana(inicio: string, fim: string): string {
  const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
  return `${dm(inicio)} – ${dm(fim)}`
}

type CombRow = { litros: number; custo_total: number }
type StockRow = { stock_atual: number; stock_minimo: number }

export async function carregarResumoSemanal(key: SemanaKey, agora: Date = new Date()): Promise<ResumoSemanal> {
  const { inicio, fim } = intervaloSemana(key, agora)
  const hoje = hojeLisboa(agora)

  const [movRes, combRes, atrasoRes, stockRes] = await Promise.all([
    supabase.from('movimentos_stock').select('tipo')
      .gte('created_at', limitesDiaLisboa(inicio).inicio)
      .lt('created_at', limitesDiaLisboa(fim).fimExclusivo),
    supabase.from('comb_abastecimentos').select('litros, custo_total').gte('data', inicio).lte('data', fim),
    supabase.from('emprestimos_ferramentas').select('id').eq('estado', 'ativo')
      .not('data_prevista_devolucao', 'is', null).lt('data_prevista_devolucao', hoje),
    supabase.from('produtos').select('stock_atual, stock_minimo').eq('ativo', true),
  ])
  if (movRes.error) throw movRes.error
  if (combRes.error) throw combRes.error
  if (atrasoRes.error) throw atrasoRes.error
  if (stockRes.error) throw stockRes.error

  const movs = movRes.data ?? []
  const combs = (combRes.data ?? []) as CombRow[]
  const stocks = (stockRes.data ?? []) as StockRow[]

  return {
    semanaLabel: rotuloSemana(inicio, fim),
    entradas: movs.filter(m => m.tipo === 'entrada').length,
    saidas: movs.filter(m => m.tipo === 'saida').length,
    abastecimentos: combs.length,
    totalLitros: combs.reduce((s, c) => s + Number(c.litros), 0),
    totalCombust: combs.reduce((s, c) => s + Number(c.custo_total), 0),
    ferramAtrasadas: (atrasoRes.data ?? []).length,
    stockCritico: stocks.filter(p => p.stock_atual <= 0).length,
    stockBaixo: stocks.filter(p => p.stock_atual > 0 && p.stock_atual <= p.stock_minimo).length,
  }
}
