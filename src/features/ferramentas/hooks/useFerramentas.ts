import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  listarFerramentas, listarFerramentasArquivadas, buscarFerramenta,
  criarFerramenta, atualizarFerramenta, arquivarFerramenta, restaurarFerramenta,
  type AtualizarFerramenta,
} from '../services/ferramentasService'

export function useFerramentas(apenasAtivas = true) {
  const { data, loading, error, reload } = useAsync(
    () => listarFerramentas(apenasAtivas), [apenasAtivas],
    { errorMsg: 'Erro ao carregar ferramentas' }
  )
  return { tools: data ?? [], loading, error, reload }
}

export function useFerramenta(id: string | undefined) {
  const { data: tool, loading, error, reload } = useAsync(
    () => buscarFerramenta(id!), [id],
    { enabled: !!id, errorMsg: 'Ferramenta não encontrada' }
  )
  return { tool, loading, error, reload }
}

export function useFerramentasArquivadas() {
  const { data, loading, error, reload } = useAsync(
    listarFerramentasArquivadas, [],
    { errorMsg: 'Erro ao carregar ferramentas arquivadas' }
  )
  return { tools: data ?? [], loading, error, reload }
}

export function useCriarFerramenta() {
  const { mutate: criar, loading, error } = useMutation(criarFerramenta, 'Erro ao criar ferramenta')
  return { criar, loading, error }
}

export function useAtualizarFerramenta() {
  const { mutate: atualizar, loading, error } = useMutation(
    (id: string, input: AtualizarFerramenta) => atualizarFerramenta(id, input),
    'Erro ao atualizar ferramenta'
  )
  return { atualizar, loading, error }
}

export function useArquivarFerramenta() {
  const { mutate, loading } = useMutation(
    async (id: string): Promise<true> => { await arquivarFerramenta(id); return true }
  )
  const arquivar = async (id: string) => (await mutate(id)) === true
  return { arquivar, loading }
}

export function useRestaurarFerramenta() {
  const { mutate, loading } = useMutation(
    async (id: string): Promise<true> => { await restaurarFerramenta(id); return true }
  )
  const restaurar = async (id: string) => (await mutate(id)) === true
  return { restaurar, loading }
}
