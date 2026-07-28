import { useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAsync } from '@/app/lib/useAsync'

export type AbastecimentoPendente = {
  id: string
  veiculo_id: string
  veiculo_nome: string
  funcionario_nome: string
  data: string
  litros: number
  custo_total: number
  contador: number | null
  local: string | null
  observacoes: string | null
  foto_url: string | null
  criado_em: string
}

async function fetchPendentes(): Promise<AbastecimentoPendente[]> {
  const { data, error } = await supabase
    .from('comb_abastecimentos_pendentes')
    .select('*')
    .order('criado_em', { ascending: false })
  if (error) throw error
  return (data ?? []) as AbastecimentoPendente[]
}

export function usePendentes() {
  const { data, loading, error, reload } = useAsync(fetchPendentes, [])
  const items = data ?? []

  const aprovar = useCallback(async (id: string): Promise<boolean> => {
    const { error: err } = await supabase.rpc('aprovar_abastecimento_pendente', { p_id: id })
    if (err) return false
    reload()
    return true
  }, [reload])

  const rejeitar = useCallback(async (id: string): Promise<boolean> => {
    const { error: err } = await supabase.rpc('rejeitar_abastecimento_pendente', { p_id: id })
    if (err) return false
    reload()
    return true
  }, [reload])

  return { items, loading, error, reload, aprovar, rejeitar }
}
