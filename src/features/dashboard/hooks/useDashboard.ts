import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import type { DashboardStats, LowStockItem, Movement, Unit, MovementType } from '@/app/types'
import { calcStatus } from '@/app/lib/stockUtils'

export function useDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const [
        { count: totalProducts, error: e1 },
        { count: todayEntries,  error: e2 },
        { count: todayExits,    error: e3 },
        { data: alertRaw,       error: e4 },
        { data: recentRaw,      error: e5 },
      ] = await Promise.all([
        supabase.from('produtos').select('*', { count: 'exact', head: true }).eq('ativo', true),
        supabase.from('movimentos_stock')
          .select('*', { count: 'exact', head: true })
          .eq('tipo', 'entrada')
          .gte('created_at', todayStart.toISOString()),
        supabase.from('movimentos_stock')
          .select('*', { count: 'exact', head: true })
          .eq('tipo', 'saida')
          .gte('created_at', todayStart.toISOString()),
        supabase.rpc('produtos_em_alerta'),           // only alert products, server-filtered
        supabase.from('movimentos_stock')
          .select('*, produtos(nome, unidade)')
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      if (e1 || e2 || e3 || e4 || e5) throw e1 ?? e2 ?? e3 ?? e4 ?? e5

      type AlertRow = { id: string; nome: string; unidade: string; stock_atual: number; stock_minimo: number }
      type MovRow   = {
        id: string; produto_id: string; tipo: MovementType; quantidade: number
        stock_antes: number; stock_depois: number; responsavel: string
        destino_obra: string | null; observacoes: string | null; created_at: string
        created_by: string; produtos: { nome: string; unidade: string } | null
      }

      const lowStockItems: LowStockItem[] = (alertRaw as AlertRow[]).slice(0, 5).map(p => ({
        id: p.id, name: p.nome, unit: p.unidade as Unit,
        currentStock: p.stock_atual, minStock: p.stock_minimo,
        status: calcStatus(p.stock_atual, p.stock_minimo),
      }))

      const recentMovements: Movement[] = (recentRaw as MovRow[]).map(m => ({
        id: m.id, productId: m.produto_id,
        productName: m.produtos?.nome ?? '', type: m.tipo,
        quantity: m.quantidade, unit: (m.produtos?.unidade ?? '') as Unit,
        responsible: m.responsavel, destination: m.destino_obra ?? undefined,
        notes: m.observacoes ?? undefined,
        date: new Date(m.created_at), previousStock: m.stock_antes, newStock: m.stock_depois,
      }))

      setStats({
        totalProducts:    totalProducts ?? 0,
        todayEntries:     todayEntries  ?? 0,
        todayExits:       todayExits    ?? 0,
        lowStockProducts: (alertRaw as AlertRow[]).length,
        recentMovements,
        lowStockItems,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { stats, loading, error, reload: load }
}
