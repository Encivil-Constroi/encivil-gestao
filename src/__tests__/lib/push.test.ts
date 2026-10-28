import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const m = vi.hoisted(() => ({ rpc: vi.fn(), upsert: vi.fn(), eq: vi.fn(), del: vi.fn() }))
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'U1' } } }) },
    rpc: m.rpc,
    from: () => ({ upsert: m.upsert, delete: m.del }),
  },
}))

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

describe('subscrição por dispositivo', () => {
  const SUB = { endpoint: 'https://fcm.googleapis.com/x', toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'P', auth: 'A' } }) }

  function comSubscricao(sub: unknown) {
    ambiente({ permissao: 'granted' })
    vi.stubGlobal('navigator', {
      userAgent: ANDROID, platform: 'Linux', maxTouchPoints: 5,
      serviceWorker: {
        ready: Promise.resolve({ pushManager: { getSubscription: async () => sub } }),
        getRegistration: async () => ({ pushManager: { getSubscription: async () => sub } }),
      },
    })
  }

  beforeEach(() => {
    m.rpc.mockReset().mockResolvedValue({ data: null, error: null })
    m.upsert.mockReset().mockResolvedValue({ error: null })
    m.eq.mockReset().mockResolvedValue({ error: null })
    m.del.mockReset().mockReturnValue({ eq: m.eq })
  })

  it('guarda pela RPC registar_subscricao_push (o endpoint passa para o utilizador atual)', async () => {
    comSubscricao(SUB)
    await carregar()
    const push = await import('@/app/lib/push')
    await push.subscreverSeNecessario()
    expect(m.rpc).toHaveBeenCalledWith('registar_subscricao_push', expect.objectContaining({
      p_endpoint: SUB.endpoint, p_p256dh: 'P', p_auth: 'A',
    }))
    expect(m.upsert).not.toHaveBeenCalled()
  })

  it.each(['PGRST202', '42883'])('RPC inexistente (%s): cai no upsert antigo', async code => {
    comSubscricao(SUB)
    m.rpc.mockResolvedValue({ data: null, error: { message: 'x', code } })
    await carregar()
    const push = await import('@/app/lib/push')
    await push.subscreverSeNecessario()
    expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'U1', endpoint: SUB.endpoint }), { onConflict: 'endpoint' })
  })

  it('outro erro da RPC não é engolido', async () => {
    comSubscricao(SUB)
    m.rpc.mockResolvedValue({ data: null, error: { message: 'boom', code: '42501' } })
    await carregar()
    const push = await import('@/app/lib/push')
    await expect(push.subscreverSeNecessario()).rejects.toMatchObject({ code: '42501' })
    expect(m.upsert).not.toHaveBeenCalled()
  })

  it('removerSubscricaoDoDispositivo apaga a linha do endpoint atual', async () => {
    comSubscricao(SUB)
    await carregar()
    const push = await import('@/app/lib/push')
    await push.removerSubscricaoDoDispositivo()
    expect(m.del).toHaveBeenCalled()
    expect(m.eq).toHaveBeenCalledWith('endpoint', SUB.endpoint)
  })

  it('sem subscrição neste dispositivo: não apaga nada', async () => {
    comSubscricao(null)
    await carregar()
    const push = await import('@/app/lib/push')
    await push.removerSubscricaoDoDispositivo()
    expect(m.del).not.toHaveBeenCalled()
  })
})
