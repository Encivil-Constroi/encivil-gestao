import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import type { Enums } from '@/integrations/supabase/types'
import { setSentryUser, clearSentryUser } from '@/app/lib/sentry'

export type RoleUtilizador = Enums<'role_utilizador'>

// Sem MFA disponível no plano atual, a sessão expira após inatividade —
// reduz o risco de um telemóvel/laptop desbloqueado ficar logado indefinidamente.
const INACTIVITY_LIMIT_MS = 30 * 60 * 1000 // 30 minutos
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'] as const

interface Profile {
  role: RoleUtilizador
  nome: string
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('role, nome')
    .eq('id', userId)
    .single()
  return data ?? null
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession]   = useState<Session | null>(null)
  const [profile, setProfile]   = useState<Profile | null>(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    // Initial session + profile load — keeps loading=true until both are resolved
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      if (session?.user) {
        const p = await fetchProfile(session.user.id)
        setProfile(p)
      }
      setLoading(false)
    })

    // Subsequent auth state changes (sign-in, sign-out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session)
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        const p = await fetchProfile(session.user.id)
        setProfile(p)
        setSentryUser(session.user.id, session.user.email)
      } else if (event === 'SIGNED_OUT') {
        setProfile(null)
        clearSentryUser()
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Auto-logout por inatividade — só ativo enquanto há sessão.
  const sessionRef = useRef(session)
  sessionRef.current = session
  useEffect(() => {
    if (!session) return

    let timer: ReturnType<typeof setTimeout>

    const handleTimeout = () => {
      if (!sessionRef.current) return
      toast.info('Sessão terminada por inatividade. Inicie sessão de novo.')
      supabase.auth.signOut()
    }

    const resetTimer = () => {
      clearTimeout(timer)
      timer = setTimeout(handleTimeout, INACTIVITY_LIMIT_MS)
    }

    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, resetTimer, { passive: true }))
    resetTimer()

    return () => {
      clearTimeout(timer)
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, resetTimer))
    }
  }, [session])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
