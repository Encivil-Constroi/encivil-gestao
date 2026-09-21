import { useAsync }    from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  listarUtilizadores,
  convidarUtilizador,
  alterarPapel,
  desativarUtilizador,
  reativarUtilizador,
  type RoleUtilizador,
} from '../services/utilizadoresService'

export function useUtilizadores() {
  const { data: utilizadores, loading, error, reload } = useAsync(
    listarUtilizadores,
    [],
    { cacheKey: 'utilizadores', errorMsg: 'Não foi possível carregar os utilizadores' },
  )
  return { utilizadores: utilizadores ?? [], loading, error, reload }
}

const INV_UTILIZADORES = ['utilizadores']

export function useConvidarUtilizador() {
  const { mutate, loading, error } = useMutation(
    (email: string, nome: string, role: RoleUtilizador) => convidarUtilizador(email, nome, role),
    'Erro ao convidar utilizador',
    { invalidates: INV_UTILIZADORES }
  )
  return { convidar: mutate, loading, error }
}

export function useAlterarPapel() {
  const { mutate, loading, error } = useMutation(
    (userId: string, role: RoleUtilizador) => alterarPapel(userId, role),
    'Erro ao alterar papel',
    { invalidates: INV_UTILIZADORES }
  )
  return { alterar: mutate, loading, error }
}

export function useDesativarUtilizador() {
  const { mutate, loading } = useMutation(
    async (userId: string): Promise<true> => { await desativarUtilizador(userId); return true },
    'Erro ao desativar utilizador',
    { invalidates: INV_UTILIZADORES }
  )
  const desativar = async (userId: string) => (await mutate(userId)) === true
  return { desativar, loading }
}

export function useReativarUtilizador() {
  const { mutate, loading } = useMutation(
    async (userId: string): Promise<true> => { await reativarUtilizador(userId); return true },
    'Erro ao reativar utilizador',
    { invalidates: INV_UTILIZADORES }
  )
  const reativar = async (userId: string) => (await mutate(userId)) === true
  return { reativar, loading }
}
