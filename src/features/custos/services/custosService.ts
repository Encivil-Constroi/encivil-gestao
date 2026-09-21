import { supabase } from '@/integrations/supabase/client'
import { listarSubempreiteirosComExecutado } from '@/features/subempreiteiros/services/subempreiteirosService'

// ── Legado: custeio simples sem filtro de datas ───────────────────────────────
// Usado em ObraDetailPage e ObraRelatorioPage — mantido para não quebrar.

export type CustoObra = {
  materiais: number
  subempreiteiros: number
  combustivel: number
  total: number
  orcamento?: number
  margem?: number
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

  if (matRes.error)  throw matRes.error
  if (fuelRes.error) throw fuelRes.error

  const materiais = (matRes.data as MovCustoRow[])
    .reduce((s, r) => s + Number(r.quantidade) * Number(r.produtos?.custo_unitario ?? 0), 0)
  const subempreiteiros = subs.reduce((s, x) => s + x.executed, 0)
  const combustivel = (fuelRes.data as { custo_total: number }[])
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

// ── F7: custeio consolidado por obra com filtro de período ───────────────────

export type OrcamentosObra = {
  materiais?:       number
  maoDeObra?:       number
  combustivel?:     number
  fornecedores?:    number
  subempreiteiros?: number
}

export type CustoConsolidado = {
  materiais:       number
  maoDeObra:       number
  combustivel:     number
  fornecedores:    number
  subempreiteiros: number
  total:           number
  orcamentos?:     OrcamentosObra & { total?: number }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as any

export async function custoConsolidado(
  obraId:  string,
  dataIni: string,
  dataFim: string
): Promise<CustoConsolidado> {
  const [rpcRes, obraRes] = await Promise.all([
    // RPC adicionada em F7 — não está nos tipos gerados até regeneração
    db.rpc('custos_consolidados_por_obra', {
      p_obra_id:  obraId,
      p_data_ini: dataIni,
      p_data_fim: dataFim,
    }),
    db
      .from('obras')
      .select('orcamento_materiais, orcamento_mao_obra, orcamento_combustivel, orcamento_fornecedores, orcamento_subempreiteiros')
      .eq('id', obraId)
      .single(),
  ])

  if (rpcRes.error)  throw rpcRes.error
  if (obraRes.error) throw obraRes.error

  const r = rpcRes.data as {
    materiais: number; combustivel: number; mao_de_obra: number
    fornecedores: number; subempreiteiros: number; total: number
  }
  const o = (obraRes.data ?? {}) as {
    orcamento_materiais?:       number | null
    orcamento_mao_obra?:        number | null
    orcamento_combustivel?:     number | null
    orcamento_fornecedores?:    number | null
    orcamento_subempreiteiros?: number | null
  }

  const orcamentos: OrcamentosObra & { total?: number } = {
    materiais:       o.orcamento_materiais       != null ? Number(o.orcamento_materiais)       : undefined,
    maoDeObra:       o.orcamento_mao_obra        != null ? Number(o.orcamento_mao_obra)        : undefined,
    combustivel:     o.orcamento_combustivel     != null ? Number(o.orcamento_combustivel)     : undefined,
    fornecedores:    o.orcamento_fornecedores    != null ? Number(o.orcamento_fornecedores)    : undefined,
    subempreiteiros: o.orcamento_subempreiteiros != null ? Number(o.orcamento_subempreiteiros) : undefined,
  }
  const temAlgumOrcamento = Object.values(orcamentos).some(v => v != null)

  if (temAlgumOrcamento) {
    const vals = [
      orcamentos.materiais, orcamentos.maoDeObra, orcamentos.combustivel,
      orcamentos.fornecedores, orcamentos.subempreiteiros,
    ]
    orcamentos.total = vals.filter(v => v != null).reduce((s, v) => s + (v ?? 0), 0)
  }

  return {
    materiais:       Number(r.materiais),
    maoDeObra:       Number(r.mao_de_obra),
    combustivel:     Number(r.combustivel),
    fornecedores:    Number(r.fornecedores),
    subempreiteiros: Number(r.subempreiteiros),
    total:           Number(r.total),
    orcamentos:      temAlgumOrcamento ? orcamentos : undefined,
  }
}

export async function actualizarOrcamentosObra(obraId: string, orcamentos: OrcamentosObra): Promise<void> {
  const { error } = await db
    .from('obras')
    .update({
      orcamento_materiais:       orcamentos.materiais       ?? null,
      orcamento_mao_obra:        orcamentos.maoDeObra       ?? null,
      orcamento_combustivel:     orcamentos.combustivel     ?? null,
      orcamento_fornecedores:    orcamentos.fornecedores    ?? null,
      orcamento_subempreiteiros: orcamentos.subempreiteiros ?? null,
    })
    .eq('id', obraId)
  if (error) throw error
}
