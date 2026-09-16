import { useAsync } from '@/app/lib/useAsync'
import { custoObra } from './custosService'

export function useCustoObra(obraId: string | undefined, orcamento?: number) {
  const { data: custo, loading, error } = useAsync(
    () => custoObra(obraId!, orcamento),
    [obraId, orcamento],
    { enabled: !!obraId, cacheKey: obraId ? `custo-obra-${obraId}` : undefined, cacheTtl: 30_000 }
  )
  return { custo, loading, error }
}
