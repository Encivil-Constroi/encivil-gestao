import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { toast } from 'sonner'

const CHECK_INTERVAL_MS = 60_000

export function UpdatePrompt() {
  const wasHiddenRef = useRef(false)

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') wasHiddenRef.current = true
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

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

    const apply = () => {
      // Registar o controllerchange ANTES de chamar skipWaiting para não perder o evento.
      // Usar window.location.href em vez de reload() — no iOS Safari PWA o reload()
      // pode servir o bundle antigo do cache do browser, enquanto uma navegação
      // limpa força o novo SW a responder com os assets correctos.
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => { window.location.href = '/' },
        { once: true },
      )

      // Envia SKIP_WAITING ao SW em espera (reloadPage=false: reload é nosso)
      updateServiceWorker(false)

      // Fallback: se controllerchange não disparar em 4s (iOS edge case), recarregar
      setTimeout(() => { window.location.href = '/' }, 4_000)
    }

    if (wasHiddenRef.current) {
      apply()
      return
    }

    toast.loading('Nova versão — a atualizar…', { duration: 2500 })
    const t = setTimeout(apply, 2500)
    return () => clearTimeout(t)
  }, [needRefresh, updateServiceWorker])

  return null
}
