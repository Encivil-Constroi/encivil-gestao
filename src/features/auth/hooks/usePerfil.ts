import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import { buscarMeuPerfil, atualizarContacto, pedirNovoEmail, alterarSenha } from '../services/perfilService'

export function useMeuPerfil(userId: string | undefined) {
  const { data, loading, reload } = useAsync(() => buscarMeuPerfil(userId!), [userId],
    { enabled: !!userId, errorMsg: 'Não foi possível carregar o perfil', cacheKey: userId ? `meu-perfil-${userId}` : undefined })
  return { perfil: data, loading, reload }
}

export function useAtualizarContacto() {
  return useMutation(atualizarContacto, 'Erro ao atualizar o contacto', { invalidates: ['meu-perfil-*', 'colaboradores-*'] })
}

export function usePedirNovoEmail() {
  return useMutation(pedirNovoEmail, 'Erro ao alterar o email')
}

export function useAlterarSenha() {
  return useMutation(alterarSenha, 'Erro ao alterar a senha')
}
