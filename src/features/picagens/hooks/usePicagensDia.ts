import { useState, useEffect } from 'react'
import { useAsync } from '@/app/lib/useAsync'
import { listarPicagensDia, listarPicagensObraDia } from '../services/picagensService'
import { getQueue, onQueueChange, type PendingPicagem } from '../offlineQueue'

export function usePicagensDia(colaboradorId: string | undefined, data: string) {
  const { data: picagens, loading, error, reload } = useAsync(
    () => listarPicagensDia(colaboradorId!, data),
    [colaboradorId, data],
    {
      enabled: !!colaboradorId && !!data,
      errorMsg: 'Erro ao carregar picagens',
      cacheKey: colaboradorId ? `picagens-dia-${colaboradorId}-${data}` : undefined,
      cacheTtl: 30_000,
    }
  )

  const [pendentes, setPendentes] = useState<PendingPicagem[]>(() =>
    getQueue().filter(
      p => p.colaboradorId === colaboradorId && p.timestampDispositivo.startsWith(data)
    )
  )

  useEffect(() => {
    if (!colaboradorId) return
    const update = () =>
      setPendentes(
        getQueue().filter(
          p => p.colaboradorId === colaboradorId && p.timestampDispositivo.startsWith(data)
        )
      )
    return onQueueChange(update)
  }, [colaboradorId, data])

  return { picagens: picagens ?? [], pendentes, loading, error, reload }
}

export function usePicagensObra(obraId: string | undefined, data: string) {
  const { data: picagens, loading, error, reload } = useAsync(
    () => listarPicagensObraDia(obraId!, data),
    [obraId, data],
    {
      enabled: !!obraId && !!data,
      errorMsg: 'Erro ao carregar picagens',
      cacheKey: obraId ? `picagens-obra-${obraId}-${data}` : undefined,
      cacheTtl: 30_000,
    }
  )
  return { picagens: picagens ?? [], loading, error, reload }
}
