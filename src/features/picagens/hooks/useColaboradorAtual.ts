import { useAsync } from '@/app/lib/useAsync'
import { useAuth } from '@/features/auth/AuthContext'
import { buscarColaboradorPorUserId } from '../services/picagensService'

export function useColaboradorAtual() {
  const { user } = useAuth()
  const { data: colaboradorAtual, loading } = useAsync(
    () => buscarColaboradorPorUserId(user!.id),
    [user?.id],
    {
      enabled: !!user,
      errorMsg: 'Erro ao identificar colaborador',
      cacheKey: user ? `colaborador-atual-${user.id}` : undefined,
      cacheTtl: 300_000,
    }
  )
  return { colaboradorAtual: colaboradorAtual ?? null, loading }
}
