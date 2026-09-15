import { useState, useEffect, useRef } from 'react'
import { Bell, User, LogOut, Menu, Search } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useAuth } from '@/features/auth/AuthContext'
import { useRole } from '@/features/auth/useRole'
import { useNotifications } from '@/features/notificacoes/hooks/useNotifications'
import { NotificationPanel } from './NotificationPanel'
import { GlobalSearch } from './GlobalSearch'

const ROLE_LABELS: Record<string, string> = {
  admin:   'Administrador',
  gestor:  'Encarregado',
}

interface HeaderProps {
  onMenuOpen?: () => void
}

export function Header({ onMenuOpen }: HeaderProps) {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { nome, role } = useRole()
  const { notifications, count: notifCount, loading: notifLoading, error: notifError } = useNotifications()
  const [notifOpen,  setNotifOpen]  = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!notifOpen) return
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [notifOpen])

  // Ctrl+K / Cmd+K opens global search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleLogout = async () => {
    if (window.confirm('Terminar sessão?')) {
      await signOut()
      navigate('/login')
    }
  }

  const displayName = nome || 'Utilizador'
  const roleLabel = role ? (ROLE_LABELS[role] ?? role) : ''

  return (
    <>
    <header className="bg-card border-b border-border px-4 py-3 sticky top-0 z-40">
      <div className="flex items-center justify-between gap-3">

        {/* Mobile: hamburger + logo oficial */}
        <div className="flex items-center gap-3 md:hidden">
          <button
            onClick={onMenuOpen}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
            aria-label="Abrir menu"
          >
            <Menu className="w-5 h-5 text-foreground" />
          </button>
          <div className="flex items-center gap-2">
            <img
              src="/icone_oficial.png"
              alt="ENCIVIL"
              className="w-8 h-8 object-contain"
              draggable={false}
            />
            <span className="font-semibold text-sm text-foreground">ENCIVIL</span>
          </div>
        </div>

        {/* Desktop: data */}
        <div className="hidden md:block">
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString('pt-PT', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>

        {/* Ações direita */}
        <div className="flex items-center gap-2 ml-auto">

          {/* Pesquisa global */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/40 hover:bg-muted transition-colors text-sm text-muted-foreground"
            aria-label="Pesquisar"
          >
            <Search className="w-4 h-4 shrink-0" />
            <span className="hidden md:inline text-xs">Pesquisar…</span>
            <kbd className="hidden lg:inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium border border-border rounded bg-background ml-1">
              Ctrl K
            </kbd>
          </button>

          {/* Sino + painel de notificações */}
          <div ref={notifRef} className="relative">
            <button
              onClick={() => setNotifOpen(prev => !prev)}
              className="p-2 hover:bg-accent rounded-lg transition-colors relative"
              aria-label="Notificações"
            >
              <Bell className="w-5 h-5 text-foreground" />
              {notifCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                  {notifCount > 9 ? '9+' : notifCount}
                </span>
              )}
            </button>
            {notifOpen && (
              <NotificationPanel
                notifications={notifications}
                loading={notifLoading}
                error={notifError}
                onClose={() => setNotifOpen(false)}
              />
            )}
          </div>

          {/* User info (só desktop) */}
          <div className="hidden md:flex items-center gap-2 px-3 py-2 bg-accent rounded-lg">
            <User className="w-5 h-5 text-foreground" />
            <div className="text-sm">
              <p className="font-medium capitalize">{displayName}</p>
              <p className="text-xs text-muted-foreground">{roleLabel}</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="p-2 hover:bg-destructive/10 hover:text-destructive rounded-lg transition-colors"
            title="Terminar sessão"
            aria-label="Terminar sessão"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
    {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
    </>
  )
}
