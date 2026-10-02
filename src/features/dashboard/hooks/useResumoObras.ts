import { useAsync } from '@/app/lib/useAsync'
import { supabase } from '@/integrations/supabase/client'
import { listarObras } from '@/features/obras/services/obrasService'
import { certificado } from '@/features/obras/lib/medicao'
import { listarSubempreiteiros } from '@/features/subempreiteiros/services/subempreiteirosService'
import { custosMateriaisCombustivelPorObra } from '@/features/custos/custosService'

// Read-model do dashboard: o P&L global das obras (o número do CEO).
// (O dashboard é a camada de composição — pode cruzar módulos.)
export type ResumoObras = {
  obrasAtivas: number
  totalOrcamento: number
  custoReal: number       // materiais + subempreiteiros + combustível (todas as obras)
  margem: number          // orçamento - custo real
  contratosPorValidar: number
  autosPorValidar: number
}

async function fetchResumoObras(): Promise<ResumoObras> {
  const [obras, subs, autosRes, matComb] = await Promise.all([
    listarObras(false),
    listarSubempreiteiros(),
    supabase.from('autos_medicao').select('valor_periodo, valor_glosado, estado'),
    custosMateriaisCombustivelPorObra(),
  ])

  if (autosRes.error) throw autosRes.error
  const autos = (autosRes.data ?? []) as unknown as { valor_periodo: number; valor_glosado?: number | null; estado: string }[]
  const executado = autos
    .filter(a => a.estado === 'validado')
    .reduce((s, a) => s + certificado(Number(a.valor_periodo), Number(a.valor_glosado ?? 0)), 0)

  const parciais = Object.values(matComb)
  const materiais = parciais.reduce((s, p) => s + p.materiais, 0)
  const combustivel = parciais.reduce((s, p) => s + p.combustivel, 0)
  const custoReal = materiais + executado + combustivel

  const totalOrcamento = obras.reduce((s, o) => s + (o.budget ?? 0), 0)

  return {
    obrasAtivas: obras.filter(o => o.active && o.status === 'ativa').length,
    totalOrcamento,
    custoReal,
    margem: totalOrcamento - custoReal,
    contratosPorValidar: subs.filter(s => s.status === 'rascunho').length,
    autosPorValidar: autos.filter(a => a.estado === 'rascunho').length,
  }
}

export function useResumoObras() {
  const { data: resumo, loading, error, reload } = useAsync(
    fetchResumoObras, [],
    { cacheKey: 'resumo-obras', cacheTtl: 60_000, errorMsg: 'Não foi possível carregar o resumo de obras' }
  )
  return { resumo, loading, error, reload }
}
