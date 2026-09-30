import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }))

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) Chrome/128 Mobile'

function ambiente({ ua = ANDROID, standalone = false, permissao = 'default' as NotificationPermission, push = true } = {}) {
  vi.stubGlobal('navigator', { userAgent: ua, platform: 'Linux', maxTouchPoints: 5, standalone, serviceWorker: {} })
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: standalone && q.includes('standalone') }))
  window.matchMedia = (q: string) => ({ matches: standalone && q.includes('standalone') }) as MediaQueryList
  if (push) vi.stubGlobal('PushManager', function PushManager() {})
  else Reflect.deleteProperty(globalThis, 'PushManager')
  vi.stubGlobal('Notification', { permission: permissao })
}

async function carregar(vapid = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U') {
  vi.resetModules()
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', vapid)
  return (await import('@/app/lib/push')).estadoPush
}

beforeEach(() => { vi.unstubAllGlobals() })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('estado das notificações', () => {
  it('sem chave VAPID: indisponível', async () => {
    ambiente()
    expect((await carregar(''))()).toBe('indisponivel')
  })

  it('iPhone no Safari (fora do ecrã principal): pede para instalar a app', async () => {
    ambiente({ ua: IPHONE })
    expect((await carregar())()).toBe('instalar-ios')
  })

  it('iPhone com a app no ecrã principal: pode pedir', async () => {
    ambiente({ ua: IPHONE, standalone: true })
    expect((await carregar())()).toBe('por-pedir')
  })

  it.each([['default', 'por-pedir'], ['granted', 'ativo'], ['denied', 'bloqueado']] as const)(
    'Android com permissão %s → %s', async (permissao, esperado) => {
      ambiente({ permissao })
      expect((await carregar())()).toBe(esperado)
    })

  it('browser sem push: indisponível', async () => {
    ambiente({ push: false })
    expect((await carregar())()).toBe('indisponivel')
  })
})
