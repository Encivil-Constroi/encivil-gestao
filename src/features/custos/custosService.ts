import { supabase } from '@/integrations/supabase/client'
import { listarSubempreiteirosComExecutado } from '@/features/subempreiteiros/services/subempreiteirosService'

// Read-model de job costing: junta as três fontes de custo de uma obra.
// (Camada de composição — cruza movimentos+produtos, subempreitadas e combustível.)
export type CustoObra = {
  materiais: number        // saídas de stock imputadas à obra × custo_unitario
  subempreiteiros: number  // autos validados dos subempreiteiros da obra
  combustivel: number      // abastecimentos imputados à obra
  total: number
  orcamento?: number
  margem?: number          // orcamento - total (só se houver orçamento)
}

type MovCustoRow = { quantidade: number; produtos: { custo_unitario: number } | null }

export async function custoObra(obraId: string, orcamento?: number): Promise<CustoObra> {
  const [matRes, subs, fuelRes] = await Promise.all([
    supabase
      .from('movimentos_stock')
      .select('quantidade, produtos(custo_unitario)')
      .eq('obra_id', obraId)
      .eq('tipo', 'saida'),
    listarSubempreiteirosComExecutado(obraId),
    supabase.from('comb_abastecimentos').select('custo_total').eq('obra_id', obraId),
  ])

  const materiais = ((matRes.data ?? []) as MovCustoRow[])
    .reduce((s, r) => s + Number(r.quantidade) * Number(r.produtos?.custo_unitario ?? 0), 0)
  const subempreiteiros = subs.reduce((s, x) => s + x.executed, 0)
  const combustivel = ((fuelRes.data ?? []) as { custo_total: number }[])
    .reduce((s, r) => s + Number(r.custo_total), 0)

  const total = materiais + subempreiteiros + combustivel
  return {
    materiais, subempreiteiros, combustivel, total,
    orcamento,
    margem: orcamento != null ? orcamento - total : undefined,
  }
}

export type CustoParcialObra = { materiais: number; combustivel: number }

export async function custosMateriaisCombustivelPorObra(): Promise<Record<string, CustoParcialObra>> {
  const { data, error } = await supabase.rpc('custos_materiais_por_obra')
  if (error) throw error
  const map: Record<string, CustoParcialObra> = {}
  for (const row of (data as { obra_id: string; materiais: number; combustivel: number }[])) {
    map[row.obra_id] = { materiais: Number(row.materiais), combustivel: Number(row.combustivel) }
  }
  return map
}
