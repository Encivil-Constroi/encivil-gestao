import { useAsync }    from '@/app/lib/useAsync'
import { useMutation }  from '@/app/lib/useMutation'
import { invalidateCache } from '@/app/lib/useAsync'
import type { FaturaFornecedor } from '@/app/types'
import {
  listarFaturas,
  buscarFatura,
  criarFatura,
  extrairFatura,
  classificarFatura,
  lancarFatura,
  eliminarFatura,
  type FiltrosFaturas,
  type NovaFatura,
  type ClassificarLinhaInput,
} from '../services/faturasService'

const CACHE_KEY = 'faturas-list'

// ── Listagem ──────────────────────────────────────────────────────────────────

export function useFaturas(filtros: FiltrosFaturas = {}) {
  const key = JSON.stringify(filtros)
  const { data, loading, error, reload } = useAsync(
    () => listarFaturas(filtros),
    [key],
    { errorMsg: 'Erro ao carregar faturas' }
  )
  return { faturas: data ?? [], loading, error, reload }
}

// ── Detalhe (com linhas + URL assinada para PDF) ──────────────────────────────

export function useFatura(id?: string) {
  const { data, loading, error, reload } = useAsync(
    () => buscarFatura(id!),
    [id],
    { enabled: !!id, errorMsg: 'Fatura não encontrada' }
  )
  return { fatura: data as FaturaFornecedor | null, loading, error, reload }
}

// ── Criar + upload ────────────────────────────────────────────────────────────

export function useCriarFatura() {
  const { mutate, loading, error } = useMutation(
    criarFatura,
    'Erro ao criar fatura',
    { invalidates: [CACHE_KEY] }
  )
  return { criar: mutate, loading, error }
}

// ── Extracção IA ──────────────────────────────────────────────────────────────

export function useExtrairFatura() {
  const { mutate, loading, error } = useMutation(
    extrairFatura,
    'Erro ao extrair fatura via IA'
  )
  const extrair = async (id: string) => {
    const result = await mutate(id)
    invalidateCache(CACHE_KEY)
    return result
  }
  return { extrair, loading, error }
}

// ── Classificação manual + aprendizagem ──────────────────────────────────────

export function useClassificarFatura() {
  const { mutate, loading, error } = useMutation(
    (id: string, linhas: ClassificarLinhaInput[]) => classificarFatura(id, linhas),
    'Erro ao guardar classificação'
  )
  const classificar = async (id: string, linhas: ClassificarLinhaInput[]) => {
    const result = await mutate(id, linhas)
    invalidateCache(CACHE_KEY)
    return result
  }
  return { classificar, loading, error }
}

// ── Lançamento em stock ───────────────────────────────────────────────────────

export function useLancarFatura() {
  const { mutate, loading, error } = useMutation(
    (id: string, responsavel: string) => lancarFatura(id, responsavel),
    'Erro ao lançar fatura em stock'
  )
  const lancar = async (id: string, responsavel: string) => {
    const result = await mutate(id, responsavel)
    invalidateCache(CACHE_KEY)
    return result
  }
  return { lancar, loading, error }
}

// ── Eliminar ──────────────────────────────────────────────────────────────────

export function useEliminarFatura() {
  const { mutate, loading } = useMutation(
    async (id: string): Promise<true> => { await eliminarFatura(id); return true },
    'Erro ao eliminar fatura',
    { invalidates: [CACHE_KEY] }
  )
  const eliminar = async (id: string) => (await mutate(id)) === true
  return { eliminar, loading }
}

// ── Export de tipos para uso nos componentes ──────────────────────────────────
export type { FiltrosFaturas, NovaFatura, ClassificarLinhaInput }
