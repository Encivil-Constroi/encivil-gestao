import { useEffect } from 'react'
import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import { fetchEstadoBomba, pararBomba } from '../services/bombaService'

export function useEstadoBomba(enabled = true) {
  const { data: estado, loading, error, reload } = useAsync(
    fetchEstadoBomba, [],
    { enabled, errorMsg: 'Erro ao ler estado da bomba' }
  )

  useEffect(() => {
    if (!enabled) return
    const id = setInterval(reload, 5_000)
    return () => clearInterval(id)
  }, [enabled, reload])

  return { estado, loading, error, reload }
}

export function usePararBomba() {
  const { mutate, loading, error } = useMutation(
    async (pedidoId?: string): Promise<true> => { await pararBomba(pedidoId); return true },
    'Erro ao desligar a bomba'
  )
  const parar = async (pedidoId?: string) => (await mutate(pedidoId)) === true
  return { parar, loading, error }
}
