import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import { useAuth } from '@/features/auth/AuthContext'
import { useRole } from '@/features/auth/useRole'
import { adicionarFotos, apagarFase, autorDesignado, guardarFase, listarAfericoes, listarEventos, listarFases, listarFotos, listarUltimosRelatorios, registarAfericao } from '../services/fichaObraService'

export function useFasesObra(id: string) {
  const { data, ...resto } = useAsync(() => listarFases(id), [id], { cacheKey: `obra-fases-${id}`, errorMsg: 'Erro ao carregar fases' })
  return { fases: data ?? [], ...resto }
}
export function useAfericoesObra(id: string) {
  const { data, ...resto } = useAsync(() => listarAfericoes(id), [id], { cacheKey: `obra-afericoes-${id}`, errorMsg: 'Erro ao carregar aferições' })
  return { afericoes: data ?? [], ...resto }
}
export function useFotosObra(id: string) {
  const { data, ...resto } = useAsync(() => listarFotos(id), [id], { cacheKey: `obra-fotos-${id}`, errorMsg: 'Erro ao carregar fotos' })
  return { fotos: data ?? [], ...resto }
}
export function useEventosObra(id: string) {
  const { data, ...resto } = useAsync(() => listarEventos(id), [id], { cacheKey: `obra-eventos-${id}`, errorMsg: 'Erro ao carregar atividade' })
  return { eventos: data ?? [], ...resto }
}
export function useUltimosRelatoriosObra(id: string) {
  const { data, ...resto } = useAsync(() => listarUltimosRelatorios(id), [id], { cacheKey: `obra-ultimos-relatorios-${id}`, errorMsg: 'Erro ao carregar relatórios' })
  return { relatorios: data ?? [], ...resto }
}
export function usePermissaoFotosObra(id: string) {
  const { user } = useAuth()
  const { role } = useRole()
  const acessoDireto = role === 'admin' || role === 'gestor' || role === 'medicoes'
  const { data } = useAsync(() => autorDesignado(id, user!.id), [id, user?.id], {
    enabled: !acessoDireto && !!user && role !== 'mecanico' && role !== 'motorista',
    cacheKey: user ? `obra-autor-${id}-${user.id}` : undefined,
    errorMsg: 'Erro ao verificar autorização para fotos',
  })
  return { podeAdicionar: acessoDireto || data === true }
}
const INVALIDAR = ['obra-visao-*', 'obras-painel', 'obra-eventos-*']
export function useGuardarFase() {
  const { mutate: guardar, ...resto } = useMutation(guardarFase, 'Erro ao guardar fase', { invalidates: [...INVALIDAR, 'obra-fases-*'] })
  return { guardar, ...resto }
}
export function useApagarFase() {
  const { mutate: apagar, ...resto } = useMutation(apagarFase, 'Erro ao apagar fase', { invalidates: [...INVALIDAR, 'obra-fases-*'] })
  return { apagar, ...resto }
}
export function useRegistarAfericao() {
  const { mutate: registar, ...resto } = useMutation(registarAfericao, 'Erro ao registar aferição', { invalidates: [...INVALIDAR, 'obra-afericoes-*', 'obra-fotos-*'] })
  return { registar, ...resto }
}
export function useAdicionarFotos() {
  const { mutate: adicionar, ...resto } = useMutation(adicionarFotos, 'Erro ao adicionar fotos', { invalidates: [...INVALIDAR, 'obra-fotos-*'] })
  return { adicionar, ...resto }
}
