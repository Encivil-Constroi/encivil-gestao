import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  listarCatalogo, criarItemCatalogo, atualizarItemCatalogo, listarResumoViaturas, carregarFicha,
  listarColaboradoresAtivos, configurarItem, registarManutencao, registarChecklist, atribuirCondutor,
  avaliarFrota, listarDestinatarios, listarUtilizadores, adicionarDestinatario, removerDestinatario,
  type DadosItemCatalogo,
} from '../services/frotaService'

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
