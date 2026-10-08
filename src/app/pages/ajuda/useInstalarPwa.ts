import { useCallback, useSyncExternalStore } from 'react'
import {
  consumirEventoInstalacao, iniciarCapturaInstalacao, obterEventoInstalacao, subscrever,
} from '@/app/lib/pwaInstalacao'

export function useInstalarPwa(): { podeInstalar: boolean; instalar: () => Promise<void> } {
  // Normalmente já iniciado em main.tsx; idempotente
  iniciarCapturaInstalacao()
  const evento = useSyncExternalStore(subscrever, obterEventoInstalacao, () => null)

  const instalar = useCallback(async () => {
    const e = consumirEventoInstalacao()
    if (!e) return
    try {
      await e.prompt()
      await e.userChoice
    } catch { /* o utilizador fechou ou o navegador recusou */ }
  }, [])

  return { podeInstalar: evento !== null, instalar }
}
