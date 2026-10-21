import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ createClient: vi.fn(() => ({})) }))
vi.mock('@supabase/supabase-js', () => ({ createClient: m.createClient }))

beforeEach(() => { vi.resetModules(); m.createClient.mockClear() })
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

async function configurar(url: string, chave: string, dev: boolean): Promise<[string, string]> {
  vi.resetModules()
  m.createClient.mockClear()
  vi.stubEnv('DEV', dev)
  vi.stubEnv('VITE_SUPABASE_URL', url)
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', chave)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  await import('@/integrations/supabase/client')
  const [urlUsada, chaveUsada] = m.createClient.mock.calls[0] as unknown as [string, string]
  return [urlUsada, chaveUsada]
}

describe('configuração do cliente Supabase', () => {
  it.each([true, false])('mantém o par hosted publicado (DEV=%s)', async dev => {
    expect(await configurar(' https://projetoteste.supabase.co ', ' sb_publishable_teste ', dev))
      .toEqual(['https://projetoteste.supabase.co', 'sb_publishable_teste'])
  })

  it.each(['http://127.0.0.1:54321', 'http://localhost:54321', 'https://localhost:54321'])('usa %s só em desenvolvimento', async url => {
    expect(await configurar(url, 'sb_publishable_localteste', true))
      .toEqual([url, 'sb_publishable_localteste'])
  })

  it.each([
    ['http://127.0.0.1:54321', false],
    ['http://localhost:54321', false],
    ['http://projetoteste.supabase.co', false],
    ['http://servidor.example:54321', true],
    ['http://localhost.example:54321', true],
    ['http://localhost@servidor.example:54321', true],
    ['http://pessoa@localhost:54321', true],
    ['http://localhost:54321/api', true],
  ])('recusa URL %s em DEV=%s sem misturar chave local com URL fallback', async (url, dev) => {
    const fallback = await configurar('', '', dev)
    expect(await configurar(url, 'sb_publishable_localteste', dev)).toEqual(fallback)
  })

  it.each(['https://projetoteste.supabase.co', 'http://localhost:54321'])('recusa chave inválida em %s sem misturar URL configurada com chave fallback', async url => {
    const fallback = await configurar('', '', true)
    expect(await configurar(url, 'sb_' + 'secret_nao_publicavel', true)).toEqual(fallback)
  })
})
