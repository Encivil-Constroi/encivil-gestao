import { useMemo }       from 'react'
import { useAsync }      from '@/app/lib/useAsync'
import { useMutation }   from '@/app/lib/useMutation'
import { useAuth }       from '@/features/auth/AuthContext'
import {
  listarRegistos,
  criarRegisto,
  editarRegisto,
  type CategoriaRegisto,
  type CriarRegistoInput,
} from '../services/livroObraService'

// Cache por obra (não por categoria) — filtragem client-side via useMemo
// para evitar re-fetch ao mudar filtro de categoria.
function cacheKey(obraId: string) {
  return `livro-obra-${obraId}`
}

export function useLivroObra(obraId: string | undefined, categoria?: CategoriaRegisto) {
  const key = obraId ? cacheKey(obraId) : undefined
  const { data: todos, loading, error, reload } = useAsync(
    () => listarRegistos(obraId!),
    [obraId],
    { enabled: !!obraId, errorMsg: 'Erro ao carregar livro de obra', cacheKey: key }
  )

  const registos = useMemo(() => {
    if (!todos) return []
    return categoria ? todos.filter(r => r.categoria === categoria) : todos
  }, [todos, categoria])

  return { registos, loading, error, reload }
}

export function useRegistarOcorrencia(obraId: string) {
  const { user } = useAuth()
  const { mutate, loading, error } = useMutation(
    (input: CriarRegistoInput) => criarRegisto(user!.id, input),
    'Erro ao registar ocorrência',
    { invalidates: [cacheKey(obraId)] }
  )
  return { registar: mutate, loading, error }
}

export function useEditarRegisto(obraId: string) {
  const { mutate, loading, error } = useMutation(
    (id: string, input: Partial<CriarRegistoInput>) => editarRegisto(id, input),
    'Erro ao editar registo',
    { invalidates: [cacheKey(obraId)] }
  )
  return { editar: mutate, loading, error }
}
