import { useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAsync, invalidateCache } from '@/app/lib/useAsync'

export type EstadoPendente =
  | 'AGUARDA_AUTORIZACAO'
  | 'AUTORIZADO'
  | 'AGUARDA_APROVACAO'
  | 'REJEITADO'

export type TipoFonte = 'POLO2' | 'CARRINHA' | 'POSTO_RUA'

export type AbastecimentoPendente = {
  id:               string
  veiculo_id:       string
  veiculo_nome:     string
  funcionario_nome: string
  data:             string
  litros:           number | null
  custo_total:      number | null
  contador:         number | null
  local:            string | null
  observacoes:      string | null
  foto_url:         string | null
  foto_medidor_url: string | null
  tipo_fonte:       TipoFonte | null
  estado:           EstadoPendente
  litros_gemini:    number | null
  custo_gemini:     number | null
  criado_em:        string
}

// Busca apenas os pendentes que precisam de ação (autorização ou aprovação final)
async function fetchPendentes(): Promise<AbastecimentoPendente[]> {
  const { data, error } = await supabase
    .from('comb_abastecimentos_pendentes')
    .select('*')
    .in('estado', ['AGUARDA_AUTORIZACAO', 'AGUARDA_APROVACAO'])
    .order('criado_em', { ascending: false })
  if (error) throw error
  return (data ?? []) as AbastecimentoPendente[]
}

const INV = ['abastecimentos-pendentes', 'abastecimentos-*'] as const

export function usePendentes() {
  const { data, loading, error, reload } = useAsync(fetchPendentes, [],
    { cacheKey: 'abastecimentos-pendentes', cacheTtl: 30_000 }
  )
  const items = data ?? []

  // Ação 1: autorizar pedido (AGUARDA_AUTORIZACAO → AUTORIZADO)
  const autorizar = useCallback(async (id: string): Promise<boolean> => {
    // @ts-ignore — rpc adicionado em 20260921000000_combustivel_novo_fluxo.sql; tipos ainda não regenerados
    const { error: err } = await supabase.rpc('autorizar_abastecimento', { p_id: id })
    if (err) return false
    invalidateCache(...INV)
    reload()
    return true
  }, [reload])

  // Ação 2: rejeitar pedido (qualquer estado → REJEITADO)
  const rejeitar = useCallback(async (id: string): Promise<boolean> => {
    // @ts-ignore — rpc adicionado em 20260921000000_combustivel_novo_fluxo.sql; tipos ainda não regenerados
    const { error: err } = await supabase.rpc('rejeitar_abastecimento', { p_id: id })
    if (err) return false
    invalidateCache(...INV)
    reload()
    return true
  }, [reload])

  // Ação 3: aprovação final (AGUARDA_APROVACAO → entra na tabela principal)
  const aprovar = useCallback(async (id: string): Promise<boolean> => {
    const { error: err } = await supabase.rpc('aprovar_abastecimento_pendente', { p_id: id })
    if (err) return false
    invalidateCache(...INV)
    reload()
    return true
  }, [reload])

  const pedidosAutorizacao = items.filter(i => i.estado === 'AGUARDA_AUTORIZACAO')
  const aguardaAprovacao   = items.filter(i => i.estado === 'AGUARDA_APROVACAO')

  return {
    items,
    pedidosAutorizacao,
    aguardaAprovacao,
    loading,
    error,
    reload,
    autorizar,
    rejeitar,
    aprovar,
  }
}
