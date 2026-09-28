import { useEffect } from 'react'
import { useAsync, invalidateCache } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  fetchEstadoBomba, fetchSessoesBomba, fetchEstadoPedidoBomba, pararBomba, definirRegrasBomba,
  type RegrasBomba,
} from '../services/bombaService'

// Mesmo ritmo do polling do Shelly: mais rápido não traz dados novos
const REFRESH_MS = 5_000
const CACHE = { cacheTtl: REFRESH_MS - 500 }

export function useEstadoBomba(enabled = true) {
  const { data: estado, loading, error } = useAsync(
    fetchEstadoBomba, [],
    { enabled, errorMsg: 'Erro ao ler estado da bomba', cacheKey: 'bomba-estado', ...CACHE }
  )
  useRefreshBomba(enabled)
  return { estado, loading, error }
}

export function useSessoesBomba(enabled = true) {
  const { data, loading } = useAsync(
    () => fetchSessoesBomba(5), [],
    { enabled, errorMsg: 'Erro ao ler sessões da bomba', cacheKey: 'bomba-sessoes', ...CACHE }
  )
  return { sessoes: data ?? [], loading }
}

function useRefreshBomba(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => invalidateCache('bomba-*'), REFRESH_MS)
    return () => clearInterval(id)
  }, [enabled])
}

// Página do motorista: estado da sessão deste pedido (ativa / desligada confirmada)
export function useEstadoPedidoBomba(pedidoId: string) {
  const chave = `bomba-pedido-${pedidoId}`
  const { data } = useAsync(
    () => fetchEstadoPedidoBomba(pedidoId), [pedidoId],
    { errorMsg: 'Erro ao ler estado da bomba', cacheKey: chave, cacheTtl: 2_500 }
  )
  useEffect(() => {
    const id = setInterval(() => invalidateCache(chave), 3_000)
    return () => clearInterval(id)
  }, [chave])
  return data
}

export function useDefinirRegrasBomba() {
  const { mutate, loading, error } = useMutation(
    async (r: RegrasBomba): Promise<true> => { await definirRegrasBomba(r); return true },
    'Erro ao guardar as regras da bomba',
    { invalidates: ['bomba-*'] }
  )
  const definir = async (r: RegrasBomba) => (await mutate(r)) === true
  return { definir, loading, error }
}

export function usePararBomba() {
  const { mutate, loading, error } = useMutation(
    async (pedidoId?: string): Promise<true> => { await pararBomba(pedidoId); return true },
    'Erro ao desligar a bomba',
    { invalidates: ['bomba-*'] }
  )
  const parar = async (pedidoId?: string) => (await mutate(pedidoId)) === true
  return { parar, loading, error }
}
