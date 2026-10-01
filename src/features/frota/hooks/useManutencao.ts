import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import { registarManutencao } from '../services/frotaService'
import {
  listarHistorico, carregarDia, carregarManutencao, carregarContextoViatura, editarManutencao,
  definirEstadoViatura, listarChecklistsRecentes,
} from '../services/manutencaoService'

const INVALIDA_FROTA = ['frota-*', 'alertas-*']

export function useHistoricoManutencoes(f: { veiculoId: string | null; desde: string; ate: string }) {
  const { data, loading, error, reload } = useAsync(
    () => listarHistorico({ veiculoId: f.veiculoId, desde: f.desde, ate: f.ate }), [f.veiculoId, f.desde, f.ate],
    { cacheKey: `frota-historico-${f.veiculoId ?? 'todas'}-${f.desde}-${f.ate}`, cacheTtl: 15_000,
      errorMsg: 'Não foi possível carregar o histórico de manutenções' })
  return { linhas: data ?? [], loading, error, reload }
}

export function useDiaDaViatura(veiculoId: string, data: string) {
  const r = useAsync(() => carregarDia(veiculoId, data), [veiculoId, data],
    { errorMsg: 'Não foi possível carregar o detalhe do dia' })
  return { dia: r.data, loading: r.loading, error: r.error }
}

export function useManutencaoParaEditar(id?: string) {
  const r = useAsync(() => carregarManutencao(id!), [id],
    { enabled: !!id, errorMsg: 'Manutenção não encontrada' })
  return { dados: r.data, loading: r.loading, error: r.error }
}

export function useContextoViatura(veiculoId?: string) {
  const r = useAsync(() => carregarContextoViatura(veiculoId!), [veiculoId],
    { enabled: !!veiculoId, errorMsg: 'Não foi possível carregar a viatura' })
  return { contexto: r.data, loading: r.loading, error: r.error }
}

export function useChecklistsRecentes() {
  const r = useAsync(listarChecklistsRecentes, [],
    { cacheKey: 'frota-checklists-recentes', cacheTtl: 30_000, errorMsg: 'Não foi possível carregar os checklists' })
  return { checklists: r.data ?? [], loading: r.loading, error: r.error }
}

export function useGravarManutencao() {
  const criador = useMutation(registarManutencao, 'Erro ao registar a manutenção', { invalidates: INVALIDA_FROTA })
  const atualizador = useMutation(editarManutencao, 'Erro ao guardar a correção', { invalidates: INVALIDA_FROTA })
  return {
    registar: criador.mutate, editar: atualizador.mutate,
    loading: criador.loading || atualizador.loading,
  }
}

export function useDefinirEstadoViatura() {
  const { mutate, loading } = useMutation(
    async (veiculoId: string, estado: 'LIVRE' | 'OFICINA'): Promise<true> => definirEstadoViatura(veiculoId, estado),
    'Erro ao mudar o estado da viatura', { invalidates: INVALIDA_FROTA },
  )
  const definir = async (veiculoId: string, estado: 'LIVRE' | 'OFICINA') => (await mutate(veiculoId, estado)) === true
  return { definir, loading }
}
