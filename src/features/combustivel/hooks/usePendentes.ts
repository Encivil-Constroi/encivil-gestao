import { useCallback, useEffect } from 'react'
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
  // Bomba Polo 2
  pump_auth_token:      string | null
  pump_auth_expires_at: string | null
  pump_activated_at:    string | null
  // Tempo aprovado para esta ativação (copiado da viatura na autorização)
  pump_max_seconds:     number
  // Join com a viatura — usado antes da autorização para mostrar tempo correto
  comb_veiculos:        { pump_max_seconds: number } | null
}

// Projeção explícita — pump_auth_token excluído intencionalmente:
// é um token de uso único para ativar relay físico; expô-lo no browser
// permitiria a qualquer admin com DevTools tentar ativar a bomba diretamente.
// comb_veiculos(pump_max_seconds): join para mostrar o tempo configurado
// na viatura ANTES da autorização (em que o pedido ainda tem o default 180).
const SELECT_PENDENTES = [
  'id', 'veiculo_id', 'veiculo_nome', 'funcionario_nome', 'data',
  'litros', 'custo_total', 'contador', 'local', 'observacoes',
  'foto_url', 'foto_medidor_url', 'tipo_fonte', 'estado',
  'litros_gemini', 'custo_gemini', 'criado_em',
  'pump_auth_expires_at', 'pump_activated_at', 'pump_max_seconds',
  'comb_veiculos(pump_max_seconds)',
].join(', ')

// Busca apenas os pendentes que precisam de ação (autorização ou aprovação final)
async function fetchPendentes(): Promise<AbastecimentoPendente[]> {
  const { data, error } = await supabase
    .from('comb_abastecimentos_pendentes')
    .select(SELECT_PENDENTES)
    .in('estado', ['AGUARDA_AUTORIZACAO', 'AGUARDA_APROVACAO'])
    .order('criado_em', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as AbastecimentoPendente[]
}

const INV = ['abastecimentos-pendentes', 'abastecimentos-*'] as const

export function usePendentes() {
  const { data, loading, error, reload } = useAsync(fetchPendentes, [],
    { cacheKey: 'abastecimentos-pendentes', cacheTtl: 30_000 }
  )
  const items = data ?? []

  // Polling automático a cada 15s — garante que novos pedidos aparecem sem reload manual
  useEffect(() => {
    const id = setInterval(() => { invalidateCache(...INV); reload() }, 15_000)
    return () => clearInterval(id)
  }, [reload])

  // Ação 1: autorizar pedido (AGUARDA_AUTORIZACAO → AUTORIZADO)
  const autorizar = useCallback(async (id: string): Promise<boolean> => {
    const { error: err } = await supabase.rpc('autorizar_abastecimento', { p_id: id })
    if (err) return false
    invalidateCache(...INV)
    reload()
    return true
  }, [reload])

  // Ação 2: rejeitar pedido (qualquer estado → REJEITADO)
  const rejeitar = useCallback(async (id: string): Promise<boolean> => {
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
