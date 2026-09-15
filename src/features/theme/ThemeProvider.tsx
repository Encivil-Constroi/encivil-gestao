import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type ThemeChoice   = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

interface ThemeCtx {
  theme:         ThemeChoice
  resolvedTheme: ResolvedTheme
  setTheme:      (t: ThemeChoice) => void
}

const STORAGE_KEY = 'encivil-theme'

const ThemeContext = createContext<ThemeCtx>({
  theme:         'system',
  resolvedTheme: 'light',
  setTheme:      () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

function getOsTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// Aplica .dark e .light no <html> para que os tokens CSS e o Tailwind dark: actuem
// .light é necessário para distinguir "explicitamente claro com OS escuro" de "sistema"
function applyTheme(resolved: ResolvedTheme, choice: ThemeChoice) {
  const root = document.documentElement
  root.classList.toggle('dark',  resolved === 'dark')
  root.classList.toggle('light', choice   === 'light')
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
    } catch { /* localStorage bloqueado em janelas privadas */ }
    return 'system'
  })

  const resolvedTheme = useMemo<ResolvedTheme>(
    () => (theme === 'system' ? getOsTheme() : theme),
    [theme],
  )

  // Sincroniza classes no DOM sempre que o tema resolve muda
  useEffect(() => {
    applyTheme(resolvedTheme, theme)
  }, [resolvedTheme, theme])

  // Quando em modo 'sistema', reagir a mudanças de preferência do SO
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      applyTheme(e.matches ? 'dark' : 'light', 'system')
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const setTheme = (next: ThemeChoice) => {
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* bloqueado */ }
    setThemeState(next)
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
