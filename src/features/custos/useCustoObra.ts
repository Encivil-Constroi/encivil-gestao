import { useAsync } from '@/app/lib/useAsync'
import { custoObra } from './custosService'

export function useCustoObra(obraId: string | undefined, orcamento?: number) {
  const { data: custo, loading } = useAsync(
    () => custoObra(obraId!, orcamento),
    [obraId, orcamento],
    { enabled: !!obraId }
  )
  return { custo, loading }
}
