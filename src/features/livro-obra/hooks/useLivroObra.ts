import { useAsync }   from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import { useAuth }     from '@/features/auth/AuthContext'
import {
  listarRegistos,
  criarRegisto,
  editarRegisto,
  type CategoriaRegisto,
  type CriarRegistoInput,
} from '../services/livroObraService'

export function useLivroObra(obraId: string | undefined, categoria?: CategoriaRegisto) {
  const { data: registos, loading, error, reload } = useAsync(
    () => listarRegistos(obraId!, categoria),
    [obraId, categoria],
    { enabled: !!obraId, errorMsg: 'Erro ao carregar livro de obra' }
  )
  return { registos: registos ?? [], loading, error, reload }
}

export function useRegistarOcorrencia() {
  const { user } = useAuth()
  const { mutate, loading, error } = useMutation(
    (input: CriarRegistoInput) => criarRegisto(user!.id, input),
    'Erro ao registar ocorrência'
  )
  return { registar: mutate, loading, error }
}

export function useEditarRegisto() {
  const { mutate, loading, error } = useMutation(
    (id: string, input: Partial<CriarRegistoInput>) => editarRegisto(id, input),
    'Erro ao editar registo'
  )
  return { editar: mutate, loading, error }
}
