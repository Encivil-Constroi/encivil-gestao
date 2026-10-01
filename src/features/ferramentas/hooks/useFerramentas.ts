import { useEffect, useState } from 'react'
import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  listarFerramentas, listarFerramentasArquivadas, buscarFerramenta,
  criarFerramenta, atualizarFerramenta, arquivarFerramenta, restaurarFerramenta,
  procurarNumeroSerie, type AtualizarFerramenta,
} from '../services/ferramentasService'

const CACHE_ATIVAS     = 'ferramentas-ativas'
const CACHE_ARQUIVADAS = 'ferramentas-arquivadas'
const CACHE_LISTAS     = [CACHE_ATIVAS, CACHE_ARQUIVADAS, 'ferramentas-todas', 'ferramenta-*']

export function useFerramentas(apenasAtivas = true) {
  const { data, loading, error, reload } = useAsync(
    () => listarFerramentas(apenasAtivas), [apenasAtivas],
    // useFerramentas(false) devolve TODAS as ferramentas — cache key diferente de arquivadas
    { errorMsg: 'Erro ao carregar ferramentas', cacheKey: apenasAtivas ? CACHE_ATIVAS : 'ferramentas-todas' }
  )
  return { tools: data ?? [], loading, error, reload }
}

export function useFerramenta(id: string | undefined) {
  const { data: tool, loading, error, reload } = useAsync(
    () => buscarFerramenta(id!), [id],
    { enabled: !!id, errorMsg: 'Ferramenta não encontrada', cacheKey: id ? `ferramenta-${id}` : undefined }
  )
  return { tool, loading, error, reload }
}

export function useFerramentasArquivadas() {
  const { data, loading, error, reload } = useAsync(
    listarFerramentasArquivadas, [],
    { errorMsg: 'Erro ao carregar ferramentas arquivadas', cacheKey: CACHE_ARQUIVADAS }
  )
  return { tools: data ?? [], loading, error, reload }
}

export function useCriarFerramenta() {
  const { mutate: criar, loading, error } = useMutation(
    criarFerramenta, 'Erro ao criar ferramenta', { invalidates: CACHE_LISTAS }
  )
  return { criar, loading, error }
}

export function useAtualizarFerramenta() {
  const { mutate: atualizar, loading, error } = useMutation(
    (id: string, input: AtualizarFerramenta) => atualizarFerramenta(id, input),
    'Erro ao atualizar ferramenta',
    { invalidates: CACHE_LISTAS }
  )
  return { atualizar, loading, error }
}

export function useArquivarFerramenta() {
  const { mutate, loading } = useMutation(
    async (id: string): Promise<true> => { await arquivarFerramenta(id); return true },
    'Erro ao arquivar ferramenta',
    { invalidates: CACHE_LISTAS }
  )
  const arquivar = async (id: string) => (await mutate(id)) === true
  return { arquivar, loading }
}

export function useRestaurarFerramenta() {
  const { mutate, loading } = useMutation(
    async (id: string): Promise<true> => { await restaurarFerramenta(id); return true },
    'Erro ao restaurar ferramenta',
    { invalidates: CACHE_LISTAS }
  )
  const restaurar = async (id: string) => (await mutate(id)) === true
  return { restaurar, loading }
}

// Aviso ao escrever o n.º de série: espera a pessoa parar de escrever antes de consultar.
// O servidor também recusa (índice único) — isto é só para avisar cedo.
export function useNumeroSerieRepetido(serie: string, excluirId?: string, esperaMs = 400) {
  const [termo, setTermo] = useState(serie.trim())
  useEffect(() => {
    const t = setTimeout(() => setTermo(serie.trim()), esperaMs)
    return () => clearTimeout(t)
  }, [serie, esperaMs])
  const { data, loading } = useAsync(
    () => procurarNumeroSerie(termo, excluirId), [termo, excluirId],
    { enabled: termo.length >= 2, errorMsg: 'Erro ao verificar o n.º de série' },
  )
  return { repetida: termo.length >= 2 && termo === serie.trim() ? data : null, aVerificar: loading }
}
