import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './AuthContext'
import { useEstadoMfa } from './hooks/useEstadoMfa'
import { MfaDesafio } from './components/MfaDesafio'

const CHAVE_ENTRADA = 'encivil-entrada'
const ROTA_MFA = '/seguranca/mfa'

// Primeira abertura da app neste separador/janela (também no arranque da PWA):
// o endereço restaurado pelo browser (ex.: um pedido de combustível) não conta,
// a app abre sempre na página inicial. Dentro da sessão, refrescar mantém o sítio.
// Calculado uma só vez no arranque do módulo (estável com StrictMode).
let entradaPendente = (() => {
  try {
    if (sessionStorage.getItem(CHAVE_ENTRADA)) return false
    sessionStorage.setItem(CHAVE_ENTRADA, '1')
    return true
  } catch {
    return false
  }
})()

const spinner = (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
)

export function AuthGuard() {
  const { session, loading } = useAuth()
  const location = useLocation()
  const { estado, loading: aVerificarMfa, recarregar } = useEstadoMfa()

  useEffect(() => {
    if (session) entradaPendente = false
  }, [session])

  if (loading) return spinner

  // Sem sessão: login, e depois do login é sempre a página inicial (o destino não é guardado)
  if (!session) return <Navigate to="/login" replace />

  if (entradaPendente && location.pathname !== '/') return <Navigate to="/" replace />

  // Primeira verificação em curso: não mostrar a app a quem ainda tem de dar o código.
  // Se a verificação falhar (estado null), deixa passar — o servidor continua a impor o MFA.
  if (estado === null && aVerificarMfa) return spinner
  if (estado === 'desafio') return <MfaDesafio onConcluido={recarregar} />
  // A reverificar (ex.: sessão acabou de passar a aal2 no registo): não reenviar com o estado antigo
  if (estado === 'registo' && !aVerificarMfa && location.pathname !== ROTA_MFA) return <Navigate to={ROTA_MFA} replace />

  return <Outlet />
}
