import { useCallback, useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { haTrabalhoPorGuardar } from '@/app/lib/protegerSaida'

const CHECK_INTERVAL_MS = 60_000

export function UpdatePrompt() {
  // Refs para cleanup dos listeners registados em onRegisteredSW
  const swIntervalRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const swVisibilityRef  = useRef<(() => void) | null>(null)
  const swFocusRef       = useRef<(() => void) | null>(null)

  // Com trabalho por guardar não se navega: o utilizador escolhe quando atualizar
  const [avisoAtualizar, setAvisoAtualizar] = useState(false)
  const recarregar = useCallback(() => {
    if (haTrabalhoPorGuardar()) { setAvisoAtualizar(true); return }
    window.location.href = '/'
  }, [])

  useEffect(() => {
    return () => {
      if (swIntervalRef.current)   clearInterval(swIntervalRef.current)
      if (swVisibilityRef.current) document.removeEventListener('visibilitychange', swVisibilityRef.current)
      if (swFocusRef.current)      window.removeEventListener('focus', swFocusRef.current)
    }
  }, [])

  // O SW novo ativa-se sozinho (skipWaiting no install): quando passa a controlar
  // a página, recarrega para correr o bundle novo. Só se já havia SW a controlar
  // (na 1.ª instalação não há nada a atualizar) e com o mesmo guard anti-loop.
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return
    const onChange = () => {
      try {
        const lastAt = Number(sessionStorage.getItem('sw_reload_at') ?? 0)
        if (Date.now() - lastAt < 12_000) return
        sessionStorage.setItem('sw_reload_at', String(Date.now()))
      } catch { /* sessionStorage pode estar bloqueado em modo privado */ }
      recarregar()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onChange)
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onChange)
  }, [recarregar])

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

    // Guard anti-loop: se já recarregámos nos últimos 12s, não recarregar de novo.
    // Protege contra o caso em que o SW ignora SKIP_WAITING (handler em falta ou
    // versão ainda não propagada no CDN), que causava reload infinito a cada 4s.
    try {
      const lastAt = Number(sessionStorage.getItem('sw_reload_at') ?? 0)
      if (Date.now() - lastAt < 12_000) return
      sessionStorage.setItem('sw_reload_at', String(Date.now()))
    } catch { /* sessionStorage pode estar bloqueado em modo privado */ }

    // Registar controllerchange ANTES de skipWaiting para não perder o evento.
    // window.location.href em vez de reload(): no iOS Safari PWA o reload()
    // pode servir o bundle antigo do cache, enquanto uma navegação limpa
    // força o SW a responder com os assets correctos.
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      recarregar,
      { once: true },
    )
    updateServiceWorker(false)
    // Fallback: se controllerchange não disparar em 4s (iOS edge case), recarregar
    const t = setTimeout(recarregar, 4_000)
    return () => clearTimeout(t)
  }, [needRefresh, updateServiceWorker, recarregar])

  if (!avisoAtualizar) return null
  return (
    <div role="alert" className="fixed bottom-4 left-1/2 z-[100] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-sm shadow-lg">
      <span>Nova versão disponível.</span>
      <button
        type="button"
        onClick={() => { window.location.href = '/' }}
        className="rounded-lg bg-primary px-3 py-1.5 font-semibold text-primary-foreground"
      >
        Atualizar
      </button>
    </div>
  )
}
