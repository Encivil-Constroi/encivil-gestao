// Pede permissão de notificações push ao admin/gestor e guarda a subscrição
// no Supabase para que o `send-push` Edge Function as possa usar.
// Integrado no MainLayout — apenas corre para utilizadores autenticados.
import { useEffect, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useRole } from '@/features/auth/useRole'
import { toast } from 'sonner'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64     = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(b64)
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

async function guardarSubscricao(sub: PushSubscription): Promise<void> {
  const json   = sub.toJSON()
  const keys   = json.keys as Record<string, string> | undefined
  if (!json.endpoint || !keys?.p256dh || !keys?.auth) return

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id: user.id, endpoint: json.endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: navigator.userAgent.slice(0, 255) },
    { onConflict: 'endpoint' }
  )
  if (error) throw error
}

export function PushSetup() {
  const { role } = useRole()
  const tentouRef = useRef(false)

  useEffect(() => {
    // Apenas para admin e gestor (quem autoriza abastecimentos)
    if (role !== 'admin' && role !== 'gestor') return
    if (!VAPID_PUBLIC_KEY) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (tentouRef.current) return
    tentouRef.current = true

    // Se já foi rejeitado explicitamente, não perguntar de novo nesta sessão
    if (Notification.permission === 'denied') return

    // Se já está autorizado → subscrever silenciosamente (e.g. após reinstalar SW)
    if (Notification.permission === 'granted') {
      subscribeIfNeeded().catch(() => {})
      return
    }

    // 'default' → perguntar com um toast não intrusivo depois de 5s
    const t = setTimeout(() => {
      toast('Ativar notificações de abastecimento?', {
        duration: 10_000,
        action: {
          label: 'Ativar',
          onClick: () => {
            Notification.requestPermission().then(perm => {
              if (perm === 'granted') subscribeIfNeeded().catch(() => {})
            })
          },
        },
        cancel: { label: 'Agora não', onClick: () => {} },
      })
    }, 5_000)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role])

  return null
}

async function subscribeIfNeeded() {
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
