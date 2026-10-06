import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './AuthContext'

const CHAVE_ENTRADA = 'encivil-entrada'

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

export function AuthGuard() {
  const { session, loading } = useAuth()
  const location = useLocation()

  useEffect(() => {
    if (session) entradaPendente = false
  }, [session])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Sem sessão: login, e depois do login é sempre a página inicial (o destino não é guardado)
  if (!session) return <Navigate to="/login" replace />

  if (entradaPendente && location.pathname !== '/') return <Navigate to="/" replace />

  return <Outlet />
}
