import { useAsync } from '@/app/lib/useAsync'
import { useMutation } from '@/app/lib/useMutation'
import { useAuth } from '@/features/auth/AuthContext'
import { useRole } from '@/features/auth/useRole'
import {
  autorDesignadoParaRelatorio, guardarRelatorioDiario, listarEquipaParaRelatorio, listarRelatoriosDiarios,
  listarSubempreitadasParaRelatorio, obterRelatorioDiario, reabrirRelatorioDiario,
  submeterRelatorioDiario, type FiltrosRelatorios,
} from '../services/relatoriosDiariosService'

const INVALIDAR = ['obra-relatorios-*', 'obra-relatorio-*', 'obras-painel', 'obra-visao-*', 'obra-fotos-*', 'obra-eventos-*', 'obra-ultimos-relatorios-*']

export function usePodeRelatarObra(obraId?: string) {
  const { user } = useAuth()
  const { role } = useRole()
  const direto = role === 'admin' || role === 'gestor' || role === 'medicoes'
  const { data } = useAsync(() => autorDesignadoParaRelatorio(obraId!, user!.id), [obraId, user?.id],
    { enabled: !!obraId && !!user && !direto && role !== 'mecanico' && role !== 'motorista', errorMsg: 'Erro ao verificar autorização do relatório' })
  return direto || data === true
}

export function useRelatoriosDiarios(f: FiltrosRelatorios) {
  const { data, loading, error, reload } = useAsync(() => listarRelatoriosDiarios(f),
    [f.obraId, f.desde, f.ate, f.estado, f.soOcorrencias, f.autorId],
    { errorMsg: 'Erro ao carregar relatórios diários' })
  return { relatorios: data ?? [], loading, error, reload }
}

export function useRelatorioDiario(id?: string) {
  const { data, loading, error, reload } = useAsync(() => obterRelatorioDiario(id!), [id],
    { enabled: !!id, errorMsg: 'Erro ao carregar o relatório diário' })
  return { relatorio: data, loading, error, reload }
}

export function useEquipaRelatorio(obraId?: string) {
  const { data, loading } = useAsync(() => listarEquipaParaRelatorio(obraId!), [obraId],
    { enabled: !!obraId, errorMsg: 'Erro ao carregar a equipa' })
  return { equipa: data ?? [], loading }
}

export function useSubempreitadasRelatorio(obraId?: string) {
  const { data, loading } = useAsync(() => listarSubempreitadasParaRelatorio(obraId!), [obraId],
    { enabled: !!obraId, errorMsg: 'Erro ao carregar subempreitadas' })
  return { subempreitadas: data ?? [], loading }
}

export function useGuardarRelatorioDiario() {
  const { mutate: guardar, loading, error } = useMutation(guardarRelatorioDiario, 'Erro ao guardar o relatório', { invalidates: INVALIDAR })
  return { guardar, loading, error }
}

export function useSubmeterRelatorioDiario() {
  const { mutate: submeter, loading, error } = useMutation(submeterRelatorioDiario, 'Erro ao submeter o relatório', { invalidates: INVALIDAR })
  return { submeter, loading, error }
}

export function useReabrirRelatorioDiario() {
  const { mutate: reabrir, loading, error } = useMutation(reabrirRelatorioDiario, 'Erro ao reabrir o relatório', { invalidates: INVALIDAR })
  return { reabrir, loading, error }
}
