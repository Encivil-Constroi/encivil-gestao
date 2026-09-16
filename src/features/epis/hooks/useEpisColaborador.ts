import { useAsync } from '@/app/lib/useAsync'
import { listarEpisColaborador } from '../services/episService'
import { listarTiposEpi } from '../services/episService'

export function useEpisColaborador(colaboradorId?: string) {
  const { data: epis, loading, error, reload } = useAsync(
    () => listarEpisColaborador(colaboradorId!), [colaboradorId],
    {
      enabled: !!colaboradorId,
      cacheKey: colaboradorId ? `epis-colab-${colaboradorId}` : undefined,
      cacheTtl: 60_000,
      errorMsg: 'Erro ao carregar EPIs',
    }
  )
  return { epis: epis ?? [], loading, error, reload }
}

export function useTiposEpi() {
  const { data: tipos, loading } = useAsync(
    listarTiposEpi, [],
    { cacheKey: 'tipos-epi', cacheTtl: 300_000 }
  )
  return { tipos: tipos ?? [], loading }
}
