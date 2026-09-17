import { useAsync }    from '@/app/lib/useAsync'
import { useMutation }  from '@/app/lib/useMutation'
import {
  custoObra,
  custoConsolidado,
  actualizarOrcamentosObra,
  type OrcamentosObra,
} from './services/custosService'

export function useCustoObra(obraId: string | undefined, orcamento?: number) {
  const { data: custo, loading, error } = useAsync(
    () => custoObra(obraId!, orcamento),
    [obraId, orcamento],
    { enabled: !!obraId, cacheKey: obraId ? `custo-obra-${obraId}` : undefined, cacheTtl: 30_000 }
  )
  return { custo, loading, error }
}

export function useCustoConsolidado(obraId: string | undefined, dataIni: string, dataFim: string) {
  const { data: custo, loading, error, reload } = useAsync(
    () => custoConsolidado(obraId!, dataIni, dataFim),
    [obraId, dataIni, dataFim],
    { enabled: !!obraId, errorMsg: 'Erro ao carregar custos consolidados' }
  )
  return { custo, loading, error, reload }
}

export function useActualizarOrcamentos() {
  const { mutate, loading, error } = useMutation(
    (obraId: string, orcamentos: OrcamentosObra) => actualizarOrcamentosObra(obraId, orcamentos),
    'Erro ao actualizar orçamentos'
  )
  return { actualizar: mutate, loading, error }
}
