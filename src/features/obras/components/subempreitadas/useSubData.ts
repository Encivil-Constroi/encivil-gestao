import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import { anexarContrato, buscarEvidencias, buscarFichaSub, buscarPainelSub, guardarEvidencias, guardarFichaSub, listarOcorrencias, listarResumoSubs, registarOcorrencia, removerContrato, resolverOcorrencia } from './subData'

const invalidar = ['subs-resumo-*', 'sub-painel-*', 'sub-ficha-*', 'sub-ocorrencias-*', 'auto-evidencias-*']

export function useResumoSubs(obraId: string | null) {
  const { data, loading, error, reload } = useAsync(() => listarResumoSubs(obraId), [obraId], { cacheKey: `subs-resumo-${obraId ?? 'todos'}` })
  return { subs: data ?? [], loading, error, reload }
}
export function usePainelSub(id: string | undefined) {
  const { data, loading, error, reload } = useAsync(() => buscarPainelSub(id!), [id], { enabled: !!id, cacheKey: id ? `sub-painel-${id}` : undefined })
  return { painel: data, loading, error, reload }
}
export function useFichaSub(id: string | undefined) {
  const { data, loading, error, reload } = useAsync(() => buscarFichaSub(id!), [id], { enabled: !!id, cacheKey: id ? `sub-ficha-${id}` : undefined })
  return { ficha: data, loading, error, reload }
}
export function useOcorrenciasSub(id: string | undefined) {
  const { data, loading, error, reload } = useAsync(() => listarOcorrencias(id!), [id], { enabled: !!id, cacheKey: id ? `sub-ocorrencias-${id}` : undefined })
  return { ocorrencias: data ?? [], loading, error, reload }
}
export function useEvidenciasAuto(id: string | undefined) {
  const { data, loading, error, reload } = useAsync(() => buscarEvidencias(id!), [id], { enabled: !!id, cacheKey: id ? `auto-evidencias-${id}` : undefined })
  return { evidencias: data, loading, error, reload }
}
export function useGuardarFichaSub() { const m = useMutation(guardarFichaSub, 'Erro ao guardar ficha', { invalidates: invalidar }); return { guardar: m.mutate, loading: m.loading, error: m.error } }
export function useAnexarContrato() { const m = useMutation(anexarContrato, 'Erro ao anexar contrato', { invalidates: invalidar }); return { anexar: m.mutate, loading: m.loading, error: m.error } }
export function useRemoverContrato() { const m = useMutation(removerContrato, 'Erro ao remover contrato', { invalidates: invalidar }); return { remover: m.mutate, loading: m.loading, error: m.error } }
export function useRegistarOcorrencia() { const m = useMutation(registarOcorrencia, 'Erro ao registar ocorrência', { invalidates: invalidar }); return { registar: m.mutate, loading: m.loading, error: m.error } }
export function useResolverOcorrencia() { const m = useMutation(resolverOcorrencia, 'Erro ao resolver ocorrência', { invalidates: invalidar }); return { resolver: m.mutate, loading: m.loading, error: m.error } }
export function useGuardarEvidencias() { const m = useMutation(guardarEvidencias, 'Erro ao guardar evidências', { invalidates: invalidar }); return { guardar: m.mutate, loading: m.loading, error: m.error } }
