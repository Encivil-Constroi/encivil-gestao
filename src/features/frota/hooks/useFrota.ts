import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  listarCatalogo, criarItemCatalogo, atualizarItemCatalogo, listarResumoViaturas, carregarFicha,
  listarColaboradoresAtivos, configurarItem, registarManutencao, registarChecklist, atribuirCondutor,
  avaliarFrota, listarDestinatarios, listarUtilizadores, adicionarDestinatario, removerDestinatario,
  carregarViaturaEdicao, listarLinhaTempo, ultimasEntregas, ultimasManutencoes, guardarViatura,
  arquivarViatura, definirEstadoViatura,
  type DadosItemCatalogo, type DadosViatura,
} from '../services/frotaService'
import type { EstadoOperacional } from '../db'

// Tudo o que muda prazos ou alertas invalida a lista, as fichas e os Alertas
const INVALIDA_FROTA = ['frota-*', 'alertas-*']

export function useResumoFrota() {
  const { data, loading, error, reload } = useAsync(listarResumoViaturas, [],
    { cacheKey: 'frota-resumo', cacheTtl: 30_000, errorMsg: 'Não foi possível carregar a frota' })
  return { viaturas: data ?? [], loading, error, reload }
}

export function useFichaViatura(veiculoId?: string) {
  const { data, loading, error, reload } = useAsync(() => carregarFicha(veiculoId!), [veiculoId],
    { enabled: !!veiculoId, cacheKey: veiculoId ? `frota-ficha-${veiculoId}` : undefined, cacheTtl: 15_000,
      errorMsg: 'Não foi possível carregar a ficha da viatura' })
  return { ficha: data, loading, error, reload }
}

export function useCatalogo() {
  const { data, loading, error, reload } = useAsync(listarCatalogo, [],
    { cacheKey: 'frota-catalogo', cacheTtl: 60_000, errorMsg: 'Não foi possível carregar o catálogo' })
  return { catalogo: data ?? [], loading, error, reload }
}

export function useColaboradoresAtivos() {
  const { data, loading } = useAsync(listarColaboradoresAtivos, [],
    { cacheKey: 'frota-colaboradores', errorMsg: 'Não foi possível carregar os colaboradores' })
  return { colaboradores: data ?? [], loading }
}

export function useGuardarItemCatalogo() {
  const criador     = useMutation(criarItemCatalogo, 'Erro ao guardar o item', { invalidates: INVALIDA_FROTA })
  const atualizador = useMutation((id: string, d: DadosItemCatalogo) => atualizarItemCatalogo(id, d),
    'Erro ao guardar o item', { invalidates: INVALIDA_FROTA })
  return {
    criar: criador.mutate, atualizar: atualizador.mutate,
    loading: criador.loading || atualizador.loading,
    error:   criador.error   || atualizador.error,
  }
}

export function useConfigurarItem() {
  const { mutate: configurar, loading, error } = useMutation(configurarItem, 'Erro ao guardar a configuração', { invalidates: INVALIDA_FROTA })
  return { configurar, loading, error }
}

export function useRegistarManutencao() {
  const { mutate: registar, loading, error } = useMutation(registarManutencao, 'Erro ao registar a manutenção', { invalidates: INVALIDA_FROTA })
  return { registar, loading, error }
}

export function useRegistarChecklist() {
  const { mutate: registar, loading, error } = useMutation(registarChecklist, 'Erro ao registar o checklist', { invalidates: INVALIDA_FROTA })
  return { registar, loading, error }
}

export function useAtribuirCondutor() {
  const { mutate, loading } = useMutation(
    async (veiculoId: string, colaboradorId: string | null, desde: string): Promise<true> => {
      await atribuirCondutor(veiculoId, colaboradorId, desde); return true
    },
    'Erro ao atribuir a viatura', { invalidates: INVALIDA_FROTA },
  )
  const atribuir = async (veiculoId: string, colaboradorId: string | null, desde: string) =>
    (await mutate(veiculoId, colaboradorId, desde)) === true
  return { atribuir, loading }
}

export function useAvaliarFrota() {
  const { mutate: avaliar, loading } = useMutation(avaliarFrota, 'Erro ao avaliar a frota', { invalidates: INVALIDA_FROTA })
  return { avaliar, loading }
}

export function useDestinatarios(ativo: boolean) {
  const { data, loading, error, reload } = useAsync(
    async () => {
      const [ids, utilizadores] = await Promise.all([listarDestinatarios(), listarUtilizadores()])
      return { ids: new Set(ids), utilizadores }
    },
    [], { enabled: ativo, cacheKey: 'frota-destinatarios', errorMsg: 'Não foi possível carregar os utilizadores' })
  return { destinatarios: data?.ids ?? new Set<string>(), utilizadores: data?.utilizadores ?? [], loading, error, reload }
}

export function useAlterarDestinatario() {
  const { mutate, loading } = useMutation(
    async (userId: string, receber: boolean): Promise<true> =>
      receber ? adicionarDestinatario(userId) : removerDestinatario(userId),
    'Erro ao guardar', { invalidates: ['frota-destinatarios'] },
  )
  const alterar = async (userId: string, receber: boolean) => (await mutate(userId, receber)) === true
  return { alterar, loading }
}

export function useViaturaEdicao(id?: string) {
  const { data, loading, error, reload } = useAsync(() => carregarViaturaEdicao(id!), [id],
    { enabled: !!id, errorMsg: 'Viatura não encontrada' })
  return { dados: data, loading, error, reload }
}

export function useLinhaTempo(veiculoId?: string) {
  const { data, loading, error, reload } = useAsync(() => listarLinhaTempo(veiculoId!), [veiculoId],
    { enabled: !!veiculoId, cacheKey: veiculoId ? `frota-tempo-${veiculoId}` : undefined, cacheTtl: 15_000,
      errorMsg: 'Não foi possível carregar a linha do tempo' })
  return { eventos: data ?? [], loading, error, reload }
}

export function useUltimasEntregas(limite = 5) {
  const { data, loading } = useAsync(() => ultimasEntregas(limite), [limite],
    { cacheKey: `frota-ultimas-entregas-${limite}`, cacheTtl: 30_000, errorMsg: 'Não foi possível carregar as entregas' })
  return { entregas: data ?? [], loading }
}

export function useUltimasManutencoes(limite = 5) {
  const { data, loading } = useAsync(() => ultimasManutencoes(limite), [limite],
    { cacheKey: `frota-ultimas-manutencoes-${limite}`, cacheTtl: 30_000, errorMsg: 'Não foi possível carregar as manutenções' })
  return { manutencoes: data ?? [], loading }
}

// comb_veiculos alimenta também o Abastecimento: invalida as suas listas
const INVALIDA_VIATURAS = [...INVALIDA_FROTA, 'veiculos-*', 'veiculo-*']

export function useGuardarViatura() {
  const { mutate: guardar, loading, error } = useMutation(
    (d: DadosViatura) => guardarViatura(d), 'Erro ao guardar a viatura', { invalidates: INVALIDA_VIATURAS })
  return { guardar, loading, error }
}

export function useArquivarViatura() {
  const { mutate, loading } = useMutation(
    (id: string, arquivar: boolean) => arquivarViatura(id, arquivar), 'Erro ao arquivar a viatura', { invalidates: INVALIDA_VIATURAS })
  const arquivar = async (id: string, valor: boolean) => (await mutate(id, valor)) === true
  return { arquivar, loading }
}

export function useDefinirEstadoViatura() {
  const { mutate, loading } = useMutation(
    (id: string, estado: Exclude<EstadoOperacional, 'EM_USO'>) => definirEstadoViatura(id, estado),
    'Erro ao alterar o estado da viatura', { invalidates: INVALIDA_VIATURAS })
  const definir = async (id: string, estado: Exclude<EstadoOperacional, 'EM_USO'>) => (await mutate(id, estado)) === true
  return { definir, loading }
}
