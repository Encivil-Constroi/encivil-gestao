import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  listarVeiculos, buscarVeiculo, criarVeiculo, atualizarVeiculo,
  type AtualizarVeiculo,
} from '../services/veiculosService'
import {
  listarAbastecimentos, buscarAbastecimento, criarAbastecimento,
  atualizarAbastecimento, eliminarAbastecimento,
  type FiltrosAbastecimentos, type AtualizarAbastecimento,
} from '../services/abastecimentosService'

/* ── Veículos ──────────────────────────────────────────────────── */

export function useVeiculos(apenasAtivos = true) {
  const { data, loading, error, reload } = useAsync(
    () => listarVeiculos(apenasAtivos), [apenasAtivos],
    { cacheKey: `veiculos-${apenasAtivos}` }
  )
  return { vehicles: data ?? [], loading, error, reload }
}

export function useVeiculo(id: string | undefined) {
  const { data: vehicle, loading, error, reload } = useAsync(
    () => buscarVeiculo(id!), [id],
    { enabled: !!id, cacheKey: id ? `veiculo-${id}` : undefined }
  )
  return { vehicle, loading, error, reload }
}

export function useGuardarVeiculo() {
  const criador    = useMutation(criarVeiculo)
  const atualizador = useMutation(
    (id: string, input: AtualizarVeiculo) => atualizarVeiculo(id, input)
  )
  return {
    criar:    criador.mutate,
    atualizar: atualizador.mutate,
    loading:  criador.loading || atualizador.loading,
  }
}

/* ── Abastecimentos ────────────────────────────────────────────── */

export function useAbastecimentos(filtros: FiltrosAbastecimentos = {}) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const key = JSON.stringify(filtros)
  const { data, loading, reload } = useAsync(
    () => listarAbastecimentos(filtros),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
    { cacheKey: `abastecimentos-${key}` }
  )
  return { entries: data ?? [], loading, reload }
}

export function useAbastecimento(id: string | undefined) {
  const { data: entry, loading, error, reload } = useAsync(
    () => buscarAbastecimento(id!), [id],
    { enabled: !!id, cacheKey: id ? `abastecimento-${id}` : undefined }
  )
  return { entry, loading, error, reload }
}

export function useGuardarAbastecimento() {
  const criador    = useMutation(criarAbastecimento,    'Erro ao guardar')
  const atualizador = useMutation(
    (id: string, input: AtualizarAbastecimento) => atualizarAbastecimento(id, input),
    'Erro ao guardar'
  )
  return {
    criar:    criador.mutate,
    atualizar: atualizador.mutate,
    loading:  criador.loading || atualizador.loading,
    error:    criador.error   || atualizador.error,
  }
}

export function useEliminarAbastecimento() {
  const { mutate, loading } = useMutation(
    async (id: string): Promise<true> => { await eliminarAbastecimento(id); return true }
  )
  const eliminar = async (id: string) => (await mutate(id)) === true
  return { eliminar, loading }
}
