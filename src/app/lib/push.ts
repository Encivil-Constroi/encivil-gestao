import { supabase } from '@/integrations/supabase/client'

// Subscrição Web Push do dispositivo, guardada em push_subscriptions. Quem
// recebe o quê decide-se no servidor (notificar-abastecimento, send-push-frota).
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export type EstadoPush = 'indisponivel' | 'instalar-ios' | 'bloqueado' | 'por-pedir' | 'ativo'

function ehIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function modoApp(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function estadoPush(): EstadoPush {
  if (!VAPID_PUBLIC_KEY) return 'indisponivel'
  // No iPhone as notificações só existem com a app no ecrã principal (iOS 16.4+)
  if (ehIOS() && !modoApp()) return 'instalar-ios'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') return 'indisponivel'
  if (Notification.permission === 'denied') return 'bloqueado'
  if (Notification.permission === 'granted') return 'ativo'
  return 'por-pedir'
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64     = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}

async function guardarSubscricao(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON()
  const keys = json.keys as Record<string, string> | undefined
  if (!json.endpoint || !keys?.p256dh || !keys?.auth) return

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id: user.id, endpoint: json.endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: navigator.userAgent.slice(0, 255) },
    { onConflict: 'endpoint' }
  )
  if (error) throw error
}

export async function subscreverSeNecessario(): Promise<void> {
  if (!VAPID_PUBLIC_KEY) return
  const reg = await navigator.serviceWorker.ready
  let sub   = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }
  await guardarSubscricao(sub)
}

// Tem de correr dentro de um toque do utilizador (o iPhone recusa pedidos sem gesto)
export async function pedirNotificacoes(): Promise<boolean> {
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return false
  await subscreverSeNecessario()
  return true
}
