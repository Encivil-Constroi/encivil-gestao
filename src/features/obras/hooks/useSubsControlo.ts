import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import {
  lerConfigSubs, guardarConfigSubs, listarItensOrcamento, guardarItemOrcamento, apagarItemOrcamento,
  resumoOrcamento, listarDocsSub, registarDocSub, removerDocSub, estadoDocsSub, registarEvidencia,
  apagarEvidencia, listarEvidenciasAuto, submeterAuto, iniciarVerificacao, listarVerificacoes,
  registarVerificacao, verificarAuto, listarGlosasAuto, glosarAuto, levantarGlosa, devolverAuto,
  aprovarAuto, registarFaturaAuto, pagarAuto, marcarAutoEmAtrasoRpc, libertarRetencao,
  buscarPainelCeo, listarFluxoCaixa,
} from '../services/subsControloService'

const CONFIG = ['subs-config', 'subs-resumo-*', 'sub-painel-*', 'subs-ceo-*', 'subs-fluxo-*']
const ORCAMENTO = ['orcamento-*', 'subs-resumo-*', 'sub-painel-*', 'subs-ceo-*']
const DOCUMENTOS = ['sub-docs-*', 'sub-painel-*', 'subs-resumo-*', 'subs-ceo-*']
const EVIDENCIAS = ['auto-*']
const FLUXO_AUTO = ['auto-*', 'orcamento-*', 'subs-resumo-*', 'sub-painel-*', 'subs-ceo-*', 'subs-fluxo-*', 'sub-docs-*']

// ── Leituras ─────────────────────────────────────────────────────────────────
export function useConfigSubs() {
  const { data, loading, error, reload } = useAsync(
    lerConfigSubs, [], { errorMsg: 'Erro ao carregar a configuração', cacheKey: 'subs-config' },
  )
  return { config: data, loading, error, reload }
}

export function useItensOrcamento(obraId: string | undefined) {
  const { data, loading, error, reload } = useAsync(
    () => listarItensOrcamento(obraId!), [obraId],
    { enabled: !!obraId, errorMsg: 'Erro ao carregar o orçamento', cacheKey: obraId ? `orcamento-itens-${obraId}` : undefined },
  )
  return { itens: data ?? [], loading, error, reload }
}

export function useResumoOrcamento(obraId: string | undefined) {
  const { data, loading, error, reload } = useAsync(
    () => resumoOrcamento(obraId!), [obraId],
    { enabled: !!obraId, errorMsg: 'Erro ao carregar o resumo do orçamento', cacheKey: obraId ? `orcamento-resumo-${obraId}` : undefined },
  )
  return { resumo: data ?? [], loading, error, reload }
}

export function useDocsSub(subId: string | undefined) {
  const { data, loading, error, reload } = useAsync(
    () => listarDocsSub(subId!), [subId],
    { enabled: !!subId, errorMsg: 'Erro ao carregar os documentos', cacheKey: subId ? `sub-docs-lista-${subId}` : undefined },
  )
  return { documentos: data ?? [], loading, error, reload }
}

export function useEstadoDocsSub(subId: string | undefined) {
  const { data, loading, error, reload } = useAsync(
    () => estadoDocsSub(subId!), [subId],
    { enabled: !!subId, errorMsg: 'Erro ao carregar o estado dos documentos', cacheKey: subId ? `sub-docs-estado-${subId}` : undefined },
  )
  return { estados: data ?? [], loading, error, reload }
}

export function useEvidenciasAutoLista(autoId: string | undefined) {
  const { data, loading, error, reload } = useAsync(
    () => listarEvidenciasAuto(autoId!), [autoId],
    { enabled: !!autoId, errorMsg: 'Erro ao carregar as evidências', cacheKey: autoId ? `auto-evid-lista-${autoId}` : undefined },
  )
  return { evidencias: data ?? [], loading, error, reload }
}

export function useVerificacoesAuto(autoId: string | undefined) {
  const { data, loading, error, reload } = useAsync(
    () => listarVerificacoes(autoId!), [autoId],
    { enabled: !!autoId, errorMsg: 'Erro ao carregar a verificação', cacheKey: autoId ? `auto-verif-${autoId}` : undefined },
  )
  return { itens: data ?? [], loading, error, reload }
}

export function useGlosasAuto(autoId: string | undefined) {
  const { data, loading, error, reload } = useAsync(
    () => listarGlosasAuto(autoId!), [autoId],
    { enabled: !!autoId, errorMsg: 'Erro ao carregar as glosas', cacheKey: autoId ? `auto-glosas-${autoId}` : undefined },
  )
  return { glosas: data ?? [], loading, error, reload }
}

export function usePainelCeo(obraId: string | null) {
  const { data, loading, error, reload } = useAsync(
    () => buscarPainelCeo(obraId), [obraId],
    { errorMsg: 'Erro ao carregar o painel de subempreitadas', cacheKey: `subs-ceo-${obraId ?? 'todas'}` },
  )
  return { painel: data, loading, error, reload }
}

export function useFluxoCaixaSubs(obraId: string | null, semanas = 12) {
  const { data, loading, error, reload } = useAsync(
    () => listarFluxoCaixa(obraId, semanas), [obraId, semanas],
    { errorMsg: 'Erro ao carregar o fluxo de caixa', cacheKey: `subs-fluxo-${obraId ?? 'todas'}-${semanas}` },
  )
  return { fluxo: data ?? [], loading, error, reload }
}

// ── Mutações ─────────────────────────────────────────────────────────────────
export function useGuardarConfigSubs() {
  const m = useMutation(guardarConfigSubs, 'Erro ao guardar a configuração', { invalidates: CONFIG })
  return { guardar: m.mutate, loading: m.loading, error: m.error }
}

export function useGuardarItemOrcamento() {
  const m = useMutation(guardarItemOrcamento, 'Erro ao guardar o item do orçamento', { invalidates: ORCAMENTO })
  return { guardar: m.mutate, loading: m.loading, error: m.error }
}

export function useApagarItemOrcamento() {
  const m = useMutation(
    async (id: string): Promise<true> => { await apagarItemOrcamento(id); return true },
    'Erro ao apagar o item do orçamento', { invalidates: ORCAMENTO },
  )
  const apagar = async (id: string) => (await m.mutate(id)) === true
  return { apagar, loading: m.loading, error: m.error }
}

export function useRegistarDocSub() {
  const m = useMutation(registarDocSub, 'Erro ao registar o documento', { invalidates: DOCUMENTOS })
  return { registar: m.mutate, loading: m.loading, error: m.error }
}

export function useRemoverDocSub() {
  const m = useMutation(
    async (id: string): Promise<true> => { await removerDocSub(id); return true },
    'Erro ao remover o documento', { invalidates: DOCUMENTOS },
  )
  const remover = async (id: string) => (await m.mutate(id)) === true
  return { remover, loading: m.loading, error: m.error }
}

export function useRegistarEvidencia() {
  const m = useMutation(registarEvidencia, 'Erro ao registar a evidência', { invalidates: EVIDENCIAS })
  return { registar: m.mutate, loading: m.loading, error: m.error }
}

export function useApagarEvidencia() {
  const m = useMutation(
    async (id: string): Promise<true> => { await apagarEvidencia(id); return true },
    'Erro ao apagar a evidência', { invalidates: EVIDENCIAS },
  )
  const apagar = async (id: string) => (await m.mutate(id)) === true
  return { apagar, loading: m.loading, error: m.error }
}

export function useSubmeterAuto() {
  const m = useMutation(
    async (autoId: string): Promise<true> => { await submeterAuto(autoId); return true },
    'Erro ao submeter o auto', { invalidates: FLUXO_AUTO },
  )
  const submeter = async (autoId: string) => (await m.mutate(autoId)) === true
  return { submeter, loading: m.loading, error: m.error }
}

export function useIniciarVerificacao() {
  const m = useMutation(
    async (autoId: string): Promise<true> => { await iniciarVerificacao(autoId); return true },
    'Erro ao iniciar a verificação', { invalidates: FLUXO_AUTO },
  )
  const iniciar = async (autoId: string) => (await m.mutate(autoId)) === true
  return { iniciar, loading: m.loading, error: m.error }
}

export function useRegistarVerificacao() {
  const m = useMutation(
    async (...args: Parameters<typeof registarVerificacao>): Promise<true> => { await registarVerificacao(...args); return true },
    'Erro ao guardar a verificação', { invalidates: FLUXO_AUTO },
  )
  const registar = async (...args: Parameters<typeof registarVerificacao>) => (await m.mutate(...args)) === true
  return { registar, loading: m.loading, error: m.error }
}

export function useVerificarAuto() {
  const m = useMutation(
    async (...args: Parameters<typeof verificarAuto>): Promise<true> => { await verificarAuto(...args); return true },
    'Erro ao verificar o auto', { invalidates: FLUXO_AUTO },
  )
  const verificar = async (...args: Parameters<typeof verificarAuto>) => (await m.mutate(...args)) === true
  return { verificar, loading: m.loading, error: m.error }
}

export function useGlosarAuto() {
  const m = useMutation(glosarAuto, 'Erro ao aplicar a glosa', { invalidates: FLUXO_AUTO })
  return { glosar: m.mutate, loading: m.loading, error: m.error }
}

export function useLevantarGlosa() {
  const m = useMutation(
    async (...args: Parameters<typeof levantarGlosa>): Promise<true> => { await levantarGlosa(...args); return true },
    'Erro ao levantar a glosa', { invalidates: FLUXO_AUTO },
  )
  const levantar = async (...args: Parameters<typeof levantarGlosa>) => (await m.mutate(...args)) === true
  return { levantar, loading: m.loading, error: m.error }
}

export function useDevolverAuto() {
  const m = useMutation(
    async (...args: Parameters<typeof devolverAuto>): Promise<true> => { await devolverAuto(...args); return true },
    'Erro ao devolver o auto', { invalidates: FLUXO_AUTO },
  )
  const devolver = async (...args: Parameters<typeof devolverAuto>) => (await m.mutate(...args)) === true
  return { devolver, loading: m.loading, error: m.error }
}

export function useAprovarAuto() {
  const m = useMutation(
    async (...args: Parameters<typeof aprovarAuto>): Promise<true> => { await aprovarAuto(...args); return true },
    'Erro ao aprovar o auto', { invalidates: FLUXO_AUTO },
  )
  const aprovar = async (...args: Parameters<typeof aprovarAuto>) => (await m.mutate(...args)) === true
  return { aprovar, loading: m.loading, error: m.error }
}

export function useRegistarFaturaAuto() {
  const m = useMutation(
    async (...args: Parameters<typeof registarFaturaAuto>): Promise<true> => { await registarFaturaAuto(...args); return true },
    'Erro ao guardar a fatura', { invalidates: FLUXO_AUTO },
  )
  const registar = async (...args: Parameters<typeof registarFaturaAuto>) => (await m.mutate(...args)) === true
  return { registar, loading: m.loading, error: m.error }
}

export function usePagarAuto() {
  const m = useMutation(
    async (...args: Parameters<typeof pagarAuto>): Promise<true> => { await pagarAuto(...args); return true },
    'Erro ao marcar o pagamento', { invalidates: FLUXO_AUTO },
  )
  const pagar = async (...args: Parameters<typeof pagarAuto>) => (await m.mutate(...args)) === true
  return { pagar, loading: m.loading, error: m.error }
}

export function useMarcarAutoEmAtraso() {
  const m = useMutation(
    async (autoId: string): Promise<true> => { await marcarAutoEmAtrasoRpc(autoId); return true },
    'Erro ao marcar o auto em atraso', { invalidates: FLUXO_AUTO },
  )
  const marcar = async (autoId: string) => (await m.mutate(autoId)) === true
  return { marcar, loading: m.loading, error: m.error }
}

export function useLibertarRetencao() {
  const m = useMutation(libertarRetencao, 'Erro ao libertar a retenção', { invalidates: FLUXO_AUTO })
  return { libertar: m.mutate, loading: m.loading, error: m.error }
}
