import { useAsync } from '@/app/lib/useAsync'
import { listarFormacoesColaborador, listarTiposFormacao } from '../services/formacoesService'

export function useFormacoesColaborador(colaboradorId?: string) {
  const { data: formacoes, loading, error, reload } = useAsync(
    () => listarFormacoesColaborador(colaboradorId!), [colaboradorId],
    {
      enabled: !!colaboradorId,
      cacheKey: colaboradorId ? `formacoes-colab-${colaboradorId}` : undefined,
      cacheTtl: 60_000,
      errorMsg: 'Erro ao carregar formações',
    }
  )
  return { formacoes: formacoes ?? [], loading, error, reload }
}

export function useTiposFormacao() {
  const { data: tipos, loading } = useAsync(
    listarTiposFormacao, [],
    { cacheKey: 'tipos-formacao', cacheTtl: 300_000 }
  )
  return { tipos: tipos ?? [], loading }
}
