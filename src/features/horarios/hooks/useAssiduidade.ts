import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  listarAssiduidadeMes,
  listarAssiduidadeEquipa,
  validarSupplementar,
} from '../services/assiduidadeService'
import { useAuth } from '@/features/auth/AuthContext'

export function useAssiduidadeMes(colaboradorId: string | undefined, ano: number, mes: number) {
  const { data, loading, error, reload } = useAsync(
    () => listarAssiduidadeMes(colaboradorId!, ano, mes), [colaboradorId, ano, mes],
    {
      enabled: !!colaboradorId,
      errorMsg: 'Erro ao carregar assiduidade',
      cacheKey: colaboradorId ? `assiduidade-${colaboradorId}-${ano}-${mes}` : undefined,
      cacheTtl: 120_000,
    }
  )
  return { resumos: data ?? [], loading, error, reload }
}

export function useAssiduidadeEquipa(ano: number, mes: number, obraId?: string) {
  const { data, loading, error, reload } = useAsync(
    () => listarAssiduidadeEquipa(ano, mes, obraId), [ano, mes, obraId],
    {
      errorMsg: 'Erro ao carregar assiduidade da equipa',
      cacheKey: `assiduidade-equipa-${ano}-${mes}${obraId ? `-${obraId}` : ''}`,
      cacheTtl: 120_000,
    }
  )
  return { resumos: data ?? [], loading, error, reload }
}

export function useValidarSupplementar() {
  const { user } = useAuth()
  const { mutate, loading, error } = useMutation(
    (colaboradorId: string, data: string, horas: number) =>
      validarSupplementar(colaboradorId, data, horas, user?.id ?? ''),
    'Erro ao validar horas suplementares',
    { invalidates: ['assiduidade-equipa'] }
  )
  return { validar: mutate, loading, error }
}
