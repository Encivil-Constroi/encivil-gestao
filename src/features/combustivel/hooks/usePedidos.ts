import { useAsync, invalidateCache } from '@/app/lib/useAsync'
import { useIntervaloVisivel } from '@/app/lib/useIntervaloVisivel'
import { useMutation } from '@/app/lib/useMutation'
import type { OrigemLeitura, TipoCombustivel } from '../db'
import {
  fetchContexto, listarPedidos, fetchPedido, criarPedido,
  autorizarPedido, recusarPedido, aprovarRegistoAntigo, cancelarPedido, registarContadorInicial, ligarBomba,
  concluirPedido, listarPrecos, definirPreco, listarAprovadores, definirAprovador, listarUtilizadores,
  listarViaturasAtivas, listarParaAnalise,
  type FiltrosPedidos, type NovoPedido, type Conclusao,
} from '../services/pedidosService'

// Tudo o que muda com uma ação sobre um pedido
const INV = ['pedidos-*', 'abastecimentos-*', 'bomba-*']

export function useContextoAbastecimento() {
  const { data: contexto, loading, error, reload } = useAsync(fetchContexto, [],
    { errorMsg: 'Erro ao carregar os seus dados', cacheKey: 'pedidos-contexto', cacheTtl: 10_000 })
  return { contexto, loading, error, reload }
}

export { usePodeAprovar, useContagemAguardam } from './useAprovacao'

export function useViaturasAtivas(enabled = true) {
  const { data, loading } = useAsync(listarViaturasAtivas, [],
    { enabled, errorMsg: 'Erro ao carregar viaturas', cacheKey: 'pedidos-viaturas', cacheTtl: 60_000 })
  return { viaturas: data ?? [], loading }
}

// Lista viva: recarrega a cada 10 s enquanto o ecrã está visível
export function usePedidos(f: FiltrosPedidos, enabled = true) {
  const chave = `pedidos-lista-${JSON.stringify(f)}`
  const { data, loading, error, reload } = useAsync(() => listarPedidos(f), [chave],
    { enabled, errorMsg: 'Erro ao carregar os pedidos', cacheKey: chave, cacheTtl: 8_000 })
  useIntervaloVisivel(() => invalidateCache(chave), 10_000, enabled)
  return { pedidos: data ?? [], loading, error, reload }
}

// O motorista espera pela decisão e pela bomba neste ecrã: 4 s
export function usePedido(id: string | undefined) {
  const chave = `pedidos-um-${id}`
  const { data: pedido, loading, error, reload } = useAsync(() => fetchPedido(id!), [id],
    { enabled: !!id, errorMsg: 'Pedido não encontrado', cacheKey: chave, cacheTtl: 3_000 })
  useIntervaloVisivel(() => invalidateCache(chave), 4_000, !!id)
  return { pedido, loading, error, reload }
}


export function useCriarPedido() {
  const { mutate, loading, error } = useMutation(
    (p: NovoPedido) => criarPedido(p), 'Não foi possível enviar o pedido', { invalidates: INV })
  return { criar: mutate, loading, error }
}

function useAcao<TArgs extends unknown[]>(fn: (...a: TArgs) => Promise<void>, msg: string) {
  const { mutate, loading, error } = useMutation(
    async (...a: TArgs): Promise<true> => { await fn(...a); return true }, msg, { invalidates: INV })
  const executar = async (...a: TArgs) => (await mutate(...a)) === true
  return { executar, loading, error }
}

export function useDecisaoPedido() {
  const autorizar = useAcao((id: string) => autorizarPedido(id), 'Não foi possível autorizar')
  const recusar   = useAcao((id: string, motivo: string | null) => recusarPedido(id, motivo), 'Não foi possível recusar')
  const aprovarAntigo = useAcao((id: string) => aprovarRegistoAntigo(id), 'Não foi possível aprovar')
  return {
    autorizar: autorizar.executar, recusar: recusar.executar, aprovarAntigo: aprovarAntigo.executar,
    loading: autorizar.loading || recusar.loading || aprovarAntigo.loading,
    error: autorizar.error || recusar.error || aprovarAntigo.error,
  }
}

export function useCancelarPedido() {
  const { executar, loading, error } = useAcao((id: string) => cancelarPedido(id), 'Não foi possível cancelar')
  return { cancelar: executar, loading, error }
}

export function useContadorInicial() {
  const { executar, loading, error } = useAcao(
    (id: string, leitura: number, foto: string, origem: OrigemLeitura) => registarContadorInicial(id, leitura, foto, origem),
    'Não foi possível guardar a leitura')
  return { registar: executar, loading, error }
}

export function useLigarBomba() {
  const { executar, loading, error } = useAcao((id: string) => ligarBomba(id), 'Não foi possível ligar a bomba')
  return { ligar: executar, loading, error }
}

export function useConcluirPedido() {
  const { mutate, loading, error } = useMutation(
    (id: string, c: Conclusao) => concluirPedido(id, c), 'Não foi possível concluir', { invalidates: INV })
  return { concluir: mutate, loading, error }
}

export function usePrecos() {
  const { data, loading, error } = useAsync(listarPrecos, [],
    { errorMsg: 'Erro ao carregar preços', cacheKey: 'pedidos-precos', cacheTtl: 60_000 })
  return { precos: data ?? [], loading, error }
}

export function useDefinirPreco() {
  const { mutate, loading, error } = useMutation(
    async (tipo: TipoCombustivel, preco: number): Promise<true> => { await definirPreco(tipo, preco); return true },
    'Não foi possível guardar o preço', { invalidates: ['pedidos-precos'] })
  const definir = async (tipo: TipoCombustivel, preco: number) => (await mutate(tipo, preco)) === true
  return { definir, loading, error }
}

export function useAprovadores(enabled = true) {
  const { data: ids, loading: l1, error: e1 } = useAsync(listarAprovadores, [],
    { enabled, errorMsg: 'Erro ao carregar aprovadores', cacheKey: 'pedidos-aprovadores', cacheTtl: 30_000 })
  const { data: utilizadores, loading: l2, error: e2 } = useAsync(listarUtilizadores, [],
    { enabled, errorMsg: 'Erro ao carregar utilizadores', cacheKey: 'pedidos-utilizadores', cacheTtl: 60_000 })
  return {
    aprovadores: new Set(ids ?? []), utilizadores: utilizadores ?? [],
    loading: l1 || l2, error: e1 || e2,
  }
}

export function useDefinirAprovador() {
  const { mutate, loading, error } = useMutation(
    async (userId: string, aprova: boolean): Promise<true> => { await definirAprovador(userId, aprova); return true },
    'Não foi possível guardar', { invalidates: ['pedidos-aprovadores', 'pedidos-pode-aprovar'] })
  const definir = async (userId: string, aprova: boolean) => (await mutate(userId, aprova)) === true
  return { definir, loading, error }
}

// Relatório: período pedido + o anterior (comparação) + os pedidos do período
export function useDadosAnalise(inicio: string, fim: string, inicioAnterior: string, fimAnterior: string) {
  const chave = `pedidos-analise-${inicio}-${fim}`
  const atual = useAsync(() => listarParaAnalise(inicio, fim), [chave],
    { errorMsg: 'Erro ao carregar os abastecimentos', cacheKey: chave, cacheTtl: 60_000 })
  const anterior = useAsync(() => listarParaAnalise(inicioAnterior, fimAnterior), [inicioAnterior, fimAnterior],
    { cacheKey: `pedidos-analise-${inicioAnterior}-${fimAnterior}`, cacheTtl: 5 * 60_000 })
  const pedidos = useAsync(() => listarPedidos({ desde: `${inicio}T00:00:00`, limite: 2000 }), [inicio],
    { cacheKey: `pedidos-analise-pedidos-${inicio}`, cacheTtl: 60_000 })
  return {
    abastecimentos: atual.data, anteriores: anterior.data ?? [],
    pedidos: (pedidos.data ?? []).filter(p => p.criado_em.slice(0, 10) <= fim),
    loading: atual.loading || anterior.loading || pedidos.loading,
    error: atual.error,
  }
}
