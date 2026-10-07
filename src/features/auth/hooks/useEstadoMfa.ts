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
  const { data, loading, reload } = useAsync(async () => {
    const [nivel, fatores, obrigatorio] = await Promise.all([nivelMfa(), listarFatores(), mfaObrigatorio()])
    return decidirEstadoMfa({ papel: profile?.role ?? null, obrigatorio, temFator: fatores.length > 0, nivel })
  }, [uid, profile?.role, session?.access_token], { enabled: !!uid && !!profile, errorMsg: 'Não foi possível verificar a sessão' })
  return { estado: data ?? null, loading, recarregar: reload }
}
