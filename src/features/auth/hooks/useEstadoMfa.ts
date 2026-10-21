import { useAsync } from '@/app/lib/useAsync'
import { useAuth } from '../AuthContext'
import { listarFatores, mfaObrigatorio, nivelMfa, type NivelMfa } from '../services/mfaService'

export type EstadoMfa = 'ok' | 'desafio' | 'registo'
const EXIGEM_MFA = new Set(['admin', 'gestor'])

export function decidirEstadoMfa(i: { papel: string | null; obrigatorio: boolean; temFator: boolean; nivel: NivelMfa }): EstadoMfa {
  if (i.nivel.atual === 'aal2') return 'ok'
  if (i.temFator) return 'desafio'
  if (i.obrigatorio && i.papel && EXIGEM_MFA.has(i.papel)) return 'registo'
  return 'ok'
}

// Em erro de rede o estado fica null e o AuthGuard deixa passar: o servidor continua a impor o MFA
export function useEstadoMfa(): { estado: EstadoMfa | null; loading: boolean; recarregar: () => void } {
  const { session, profile } = useAuth()
  const uid = session?.user.id
  const ativo = !!uid && !!profile
  // Só depende da sessão: corre em paralelo com a leitura do perfil em vez de esperar por ela
  const { data, loading, error, reload } = useAsync(async () => {
    const [nivel, fatores, obrigatorio] = await Promise.all([nivelMfa(), listarFatores(), mfaObrigatorio()])
    return { nivel, obrigatorio, temFator: fatores.length > 0 }
  }, [uid, session?.access_token], { enabled: !!uid, errorMsg: 'Não foi possível verificar a sessão' })
  const estado = ativo && data ? decidirEstadoMfa({ papel: profile?.role ?? null, ...data }) : null
  // Ao ligar o useAsync ainda diz loading=false num render:
  // sem isto o AuthGuard mostrava a app um frame antes do desafio MFA
  return { estado, loading: ativo && (loading || (data === null && error === null)), recarregar: reload }
}
