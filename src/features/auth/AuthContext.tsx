import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { temMarcadorRecuperacao } from '@/integrations/supabase/entradaUrl'
import type { Enums } from '@/integrations/supabase/types'
import { setSentryUser, clearSentryUser } from '@/app/lib/sentry'
import { clearAsyncCache } from '@/app/lib/useAsync'
import { limparDadosLocais } from './lib/limparDadosLocais'
import { registarEvento } from './services/eventosSegurancaService'

// 'mecanico' (Fase 9, migration 20260929020000) e 'motorista' (abastecimento v2,
// 20260930000000) ainda não estão nos tipos gerados — saem daqui quando os
// tipos forem regenerados (etapa 3 do plano de segurança)
export type RoleUtilizador = Enums<'role_utilizador'> | 'mecanico' | 'motorista'

// Complementa o MFA: limita a exposição de um dispositivo desbloqueado.
// A sessão expira após inatividade em vez de ficar aberta indefinidamente.
const INACTIVITY_LIMIT_MS = 30 * 60 * 1000 // 30 minutos
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'] as const
// Partilhado entre separadores: quem trabalha noutro separador não é expulso deste
const CHAVE_ATIVIDADE = 'encivil-ultima-atividade'
const INTERVALO_GRAVACAO_MS = 5000
const ESPERA_NOVA_TENTATIVA_MS = 1000

function lerUltimaAtividade(): number {
  try { return Number(localStorage.getItem(CHAVE_ATIVIDADE)) || 0 } catch { return 0 }
}
function gravarUltimaAtividade(t: number) {
  try { localStorage.setItem(CHAVE_ATIVIDADE, String(t)) } catch { /* armazenamento bloqueado */ }
}

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
  recarregarPerfil: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Sair = terminar a sessão no Supabase e apagar o que a app guardou no dispositivo
// 'local': a inatividade num telemóvel não pode terminar a sessão do mesmo utilizador no PC
async function terminarSessao(scope?: 'local') {
  try {
    const { error } = await (scope ? supabase.auth.signOut({ scope }) : supabase.auth.signOut())
    if (error) esquecerSessaoGuardada()
  } catch {
    esquecerSessaoGuardada()
  } finally {
    await limparDadosLocais()
  }
}

// Sem rede o supabase-js devolve o erro e NÃO apaga a sessão guardada: num telemóvel
// partilhado, o próximo a pegar nele voltava a entrar como o anterior. O supabase-js
// lê a sessão do armazenamento a cada pedido, por isso apagá-la aqui chega.
const CHAVE_SESSAO = /^sb-.+-auth-token(-code-verifier|-user)?$/
function esquecerSessaoGuardada() {
  try {
    const chaves: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && CHAVE_SESSAO.test(k)) chaves.push(k)
    }
    chaves.forEach(k => localStorage.removeItem(k))
  } catch { /* armazenamento bloqueado: nada guardado */ }
}

type LeituraPerfil = { perfil: Profile | null; falhaRede: boolean }

async function lerPerfil(userId: string): Promise<LeituraPerfil> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role, nome')
      .eq('id', userId)
      .single()
    if (error) {
      console.error('fetchProfile:', error.message)
      // Erros do PostgREST trazem código (ex.: PGRST116 sem linha); falha de rede não
      return { perfil: null, falhaRede: !error.code }
    }
    return { perfil: data ?? null, falhaRede: false }
  } catch (e) {
    console.error('fetchProfile:', e)
    return { perfil: null, falhaRede: true }
  }
}

// Rede de obra instável: sem esta nova tentativa um soluço no login deixava o
// utilizador com "Ainda não tem funções" até recarregar a página
async function fetchProfile(userId: string): Promise<LeituraPerfil> {
  const primeira = await lerPerfil(userId)
  if (!primeira.falhaRede) return primeira
  await new Promise(r => setTimeout(r, ESPERA_NOVA_TENTATIVA_MS))
  return lerPerfil(userId)
}

function apagarCacheApiSw() {
  if (typeof caches === 'undefined' || !caches) return
  try { void caches.delete('supabase-api').catch(() => false) } catch { /* best effort */ }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession]   = useState<Session | null>(null)
  const [profile, setProfile]   = useState<Profile | null>(null)
  const [loading, setLoading]   = useState(true)
  const cacheUserRef = useRef<string | null>(null)
  const loginNesteSeparadorRef = useRef(false)
  const sessaoVersaoRef = useRef(0)
  // uid cujo perfil já foi pedido (em curso ou carregado): os eventos repetidos não o voltam a pedir
  const perfilDeRef = useRef<string | null>(null)

  useEffect(() => {
    const sessaoVersao = sessaoVersaoRef
    const versaoInicial = ++sessaoVersaoRef.current
    // Initial session + profile load — keeps loading=true until both are resolved.
    // .catch() garante que loading=false mesmo em falha de rede no arranque.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (versaoInicial !== sessaoVersaoRef.current) return
      if (cacheUserRef.current !== (session?.user.id ?? null)) clearAsyncCache()
      cacheUserRef.current = session?.user.id ?? null
      setSession(session)
      if (session?.user) {
        perfilDeRef.current = session.user.id
        const { perfil: p, falhaRede } = await fetchProfile(session.user.id)
        if (versaoInicial !== sessaoVersaoRef.current) return
        if (falhaRede) perfilDeRef.current = null
        setProfile(p)
      }
      setLoading(false)
    }).catch(() => {
      if (versaoInicial === sessaoVersaoRef.current) setLoading(false)
    })

    // Síncrono de propósito: o auth-js espera por este callback durante a inicialização e
    // uma consulta aqui dentro pede o token, que espera pela inicialização (deadlock).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const uidNovo = session?.user.id ?? null
      const mudouIdentidade = cacheUserRef.current !== uidNovo
      if (event === 'SIGNED_OUT' || mudouIdentidade) clearAsyncCache()
      if (mudouIdentidade) apagarCacheApiSw()
      cacheUserRef.current = uidNovo
      setSession(session)

      if (!uidNovo) {
        ++sessaoVersaoRef.current
        perfilDeRef.current = null
        setProfile(null)
        clearSentryUser()
        // Também cobre sessões terminadas fora do nosso signOut (refresh falhado, outro separador)
        if (event === 'SIGNED_OUT') void limparDadosLocais()
        setLoading(false)
        return
      }
      // INITIAL_SESSION/SIGNED_IN repetem-se no arranque e ao voltar ao separador; o refresh
      // horário relê para apanhar um perfil alterado ou removido
      const releitura = event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED'
      if (!mudouIdentidade && !releitura && perfilDeRef.current === uidNovo) return

      const versao = ++sessaoVersaoRef.current
      perfilDeRef.current = uidNovo
      if (mudouIdentidade) { setProfile(null); setLoading(true) }
      // Sem await: o callback devolve já e a consulta segue quando a inicialização acabar
      void fetchProfile(uidNovo).then(({ perfil, falhaRede }) => {
        if (versao !== sessaoVersaoRef.current) return
        if (falhaRede) perfilDeRef.current = null
        // Mesma pessoa (refresh, regresso ao separador) sem rede: não lhe tirar as funções
        setProfile(anterior => (falhaRede && !mudouIdentidade ? anterior : perfil))
        setSentryUser(uidNovo)
        setLoading(false)
      })
    })

    return () => { sessaoVersao.current++; subscription.unsubscribe() }
  }, [])

  // Auto-logout por inatividade — só ativo enquanto há sessão.
  const sessionRef = useRef(session)
  sessionRef.current = session
  // Pelo id e não pelo objeto: o refresh do token troca a sessão e não é atividade
  const uid = session?.user.id
  useEffect(() => {
    if (!uid) return
    // Telemóvel partilhado reaberto horas depois: a sessão guardada não vale como atividade.
    // Um login acabado de fazer aqui ou um link de recuperação não contam (a marca é antiga).
    const guardada = lerUltimaAtividade()
    const loginAgora = loginNesteSeparadorRef.current
    loginNesteSeparadorRef.current = false
    if (!loginAgora && !temMarcadorRecuperacao() && guardada > 0 && Date.now() - guardada >= INACTIVITY_LIMIT_MS) {
      toast.info('Sessão terminada por inatividade. Inicie sessão de novo.')
      void encerrarSessao('local')
      return
    }

    let timer: ReturnType<typeof setTimeout>
    let ultima = Date.now()
    let ultimaGravada = 0

    const agendar = () => {
      clearTimeout(timer)
      timer = setTimeout(verificar, Math.max(0, ultima + INACTIVITY_LIMIT_MS - Date.now()))
    }

    const verificar = () => {
      ultima = Math.max(ultima, lerUltimaAtividade())
      if (Date.now() - ultima < INACTIVITY_LIMIT_MS) { agendar(); return }
      if (!sessionRef.current) return
      toast.info('Sessão terminada por inatividade. Inicie sessão de novo.')
      void encerrarSessao('local')
    }

    const registarAtividade = () => {
      ultima = Date.now()
      // mousemove dispara dezenas de vezes por segundo: não escrever no localStorage a cada um
      if (ultima - ultimaGravada >= INTERVALO_GRAVACAO_MS) {
        ultimaGravada = ultima
        gravarUltimaAtividade(ultima)
      }
      agendar()
    }

    const atividadeNoutroSeparador = (e: StorageEvent) => {
      if (e.key !== CHAVE_ATIVIDADE || !e.newValue) return
      ultima = Math.max(ultima, Number(e.newValue) || 0)
      agendar()
    }

    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, registarAtividade, { passive: true }))
    window.addEventListener('storage', atividadeNoutroSeparador)
    registarAtividade()

    return () => {
      clearTimeout(timer)
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, registarAtividade))
      window.removeEventListener('storage', atividadeNoutroSeparador)
    }
  }, [uid])

  async function signIn(email: string, password: string) {
    loginNesteSeparadorRef.current = true
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    // Aqui e não em SIGNED_IN: o supabase-js volta a emitir SIGNED_IN ao regressar ao separador
    if (!error) void registarEvento('login_ok')
    else loginNesteSeparadorRef.current = false
    return { error: error?.message ?? null }
  }

  async function encerrarSessao(scope?: 'local') {
    // Invalida respostas antes de esperar pela rede, inclusive se não houver SIGNED_OUT.
    sessaoVersaoRef.current++
    cacheUserRef.current = null
    perfilDeRef.current = null
    setSession(null)
    setProfile(null)
    setLoading(false)
    clearSentryUser()
    await terminarSessao(scope)
  }

  const signOut = () => encerrarSessao()

  async function recarregarPerfil() {
    const id = cacheUserRef.current
    if (!id) return
    const versao = ++sessaoVersaoRef.current
    const { perfil, falhaRede } = await fetchProfile(id)
    if (versao !== sessaoVersaoRef.current || cacheUserRef.current !== id) return
    setProfile(anterior => (falhaRede ? anterior : perfil))
    setLoading(false)
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, loading, signIn, signOut, recarregarPerfil }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
