import { Toaster } from 'sonner'
import { useTheme } from '@/features/theme/ThemeProvider'

// O sonner não vê a classe .dark do <html>: sem o tema explícito os toasts ficam claros no modo escuro
export function ToasterTema() {
  const { resolvedTheme } = useTheme()
  return (
    <Toaster
      theme={resolvedTheme}
      richColors
      position="top-right"
      mobileOffset={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
    />
  )
}
