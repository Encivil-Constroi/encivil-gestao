import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { toast } from 'sonner'

const CHECK_INTERVAL_MS = 60_000

export function UpdatePrompt() {
  // Rastreia se o app esteve em background desde o último foco.
  // Se sim, a atualização aplica-se silenciosamente — o utilizador não vai
  // reparar num reload enquanto o app estava minimizado.
  const wasHiddenRef = useRef(false)

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') wasHiddenRef.current = true
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      const check = () => {
        if (registration.installing || !navigator.onLine) return
        registration.update().catch(() => {})
      }
      // Verifica a cada minuto e sempre que o app ganhar visibilidade/foco
      setInterval(check, CHECK_INTERVAL_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
      window.addEventListener('focus', check)
    },
  })

  useEffect(() => {
    if (!needRefresh) return

    if (wasHiddenRef.current) {
      // App estava em background — recarrega imediatamente sem interrupção
      updateServiceWorker(true)
      return
    }

    // App em uso — avisa brevemente e atualiza sozinho
    toast.loading('A atualizar para nova versão…', { duration: 3000 })
    const t = setTimeout(() => updateServiceWorker(true), 3000)
    return () => clearTimeout(t)
  }, [needRefresh, updateServiceWorker])

  return null
}
