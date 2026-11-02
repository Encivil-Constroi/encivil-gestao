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
    'http://127.0.0.1:54321',
    'http://localhost:54321',
    'http://projetoteste.supabase.co',
  ])('recusa URL %s em produção (DEV=false) e usa o fallback', async url => {
    const fallback = await configurar('', '', false)
    expect(await configurar(url, 'sb_publishable_localteste', false)).toEqual(fallback)
  })

  it.each([
    'http://servidor.example:54321',
    'http://localhost.example:54321',
    'http://localhost@servidor.example:54321',
    'http://pessoa@localhost:54321',
    'http://localhost:54321/api',
    '',
  ])('em dev lança com URL %j inválida e chave válida', async url => {
    await expect(configurar(url, 'sb_publishable_localteste', true))
      .rejects.toThrow(/Configuração Supabase local inválida/)
  })

  it.each(['https://projetoteste.supabase.co', 'http://localhost:54321'])('em dev lança com chave inválida em %s', async url => {
    await expect(configurar(url, 'sb_' + 'secret_nao_publicavel', true))
      .rejects.toThrow(/Configuração Supabase local inválida/)
  })

  it('em produção chave inválida usa o fallback completo', async () => {
    const fallback = await configurar('', '', false)
    expect(await configurar('https://projetoteste.supabase.co', 'sb_' + 'secret_nao_publicavel', false)).toEqual(fallback)
  })

  it('em dev com URL e chave vazias mantém o fallback', async () => {
    const [url, chave] = await configurar('', '', true)
    expect(url).toMatch(/^https:\/\/.+\.supabase\.co$/)
    expect(chave).toMatch(/^sb_publishable_/)
  })

  it('a mensagem de erro não contém os valores recebidos', async () => {
    const segredo = 'sb_' + 'secret_valor_unico_123'
    const erro = await configurar('http://servidor.example:54321', segredo, true).catch((e: Error) => e)
    expect(erro).toBeInstanceOf(Error)
    expect((erro as Error).message).not.toContain(segredo)
    expect((erro as Error).message).not.toContain('servidor.example')
  })
})
