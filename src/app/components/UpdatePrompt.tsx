import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

const CHECK_INTERVAL_MS = 60_000

export function UpdatePrompt() {
  // Refs para cleanup dos listeners registados em onRegisteredSW
  const swIntervalRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const swVisibilityRef  = useRef<(() => void) | null>(null)
  const swFocusRef       = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => {
      if (swIntervalRef.current)   clearInterval(swIntervalRef.current)
      if (swVisibilityRef.current) document.removeEventListener('visibilitychange', swVisibilityRef.current)
      if (swFocusRef.current)      window.removeEventListener('focus', swFocusRef.current)
    }
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
      const onVisibility = () => { if (document.visibilityState === 'visible') check() }
      swIntervalRef.current   = setInterval(check, CHECK_INTERVAL_MS)
      swVisibilityRef.current = onVisibility
      swFocusRef.current      = check
      document.addEventListener('visibilitychange', onVisibility)
      window.addEventListener('focus', check)
    },
  })

  useEffect(() => {
    if (!needRefresh) return

    // Atualização silenciosa — sem toast, sem interação do utilizador.
    // Registar controllerchange ANTES de skipWaiting para não perder o evento.
    // window.location.href em vez de reload(): no iOS Safari PWA o reload()
    // pode servir o bundle antigo do cache, enquanto uma navegação limpa
    // força o SW a responder com os assets correctos.
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => { window.location.href = '/' },
      { once: true },
    )
    updateServiceWorker(false)
    // Fallback: se controllerchange não disparar em 4s (iOS edge case), recarregar
    const t = setTimeout(() => { window.location.href = '/' }, 4_000)
    return () => clearTimeout(t)
  }, [needRefresh, updateServiceWorker])

  return null
}
