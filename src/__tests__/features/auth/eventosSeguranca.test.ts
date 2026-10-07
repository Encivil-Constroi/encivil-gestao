import { describe, it, expect, vi, beforeEach } from 'vitest'

type Resultado = { data?: unknown; count?: number | null; error: { code?: string; message: string } | null }

const m = vi.hoisted(() => {
  const chamadas: { metodo: string; args: unknown[] }[] = []
  const estado = { resultado: { data: [], error: null } as Resultado }
  const builder: Record<string, unknown> = {}
  for (const metodo of ['select', 'order', 'limit', 'eq', 'gte']) {
    builder[metodo] = (...args: unknown[]) => { chamadas.push({ metodo, args }); return builder }
  }
  builder.then = (ok: (r: Resultado) => unknown) => Promise.resolve(estado.resultado).then(ok)
  return { rpc: vi.fn(), chamadas, estado, builder, from: vi.fn(() => builder) }
})
const { rpc } = m

vi.mock('@/app/lib/rpcSemTipos', () => ({ rpcSemTipos: (...a: unknown[]) => m.rpc(...a) }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: m.from, auth: { mfa: {} } } }))

import {
  registarEvento, registarLoginFalhado, fetchEventosSeguranca, contarLoginsFalhados24h,
} from '@/features/auth/services/eventosSegurancaService'

beforeEach(() => {
  rpc.mockReset()
  m.from.mockClear()
  m.chamadas.length = 0
  m.estado.resultado = { data: [], error: null }
})

const chamada = (metodo: string) => m.chamadas.filter(c => c.metodo === metodo)

describe('eventos de segurança (melhor esforço)', () => {
  it('regista o evento', async () => {
    rpc.mockResolvedValue(undefined)
    await registarEvento('login_ok')
    expect(rpc).toHaveBeenCalledWith('registar_evento_seguranca', { p_tipo: 'login_ok', p_detalhe: {} })
  })
  it('nunca lança (RPC inexistente ou rede em baixo não bloqueiam o login)', async () => {
    rpc.mockRejectedValue(new Error('PGRST202'))
    await expect(registarEvento('mfa_falhado')).resolves.toBeUndefined()
    await expect(registarLoginFalhado('a@b.pt')).resolves.toBeUndefined()
  })
  it('login falhado envia o email', async () => {
    rpc.mockResolvedValue(undefined)
    await registarLoginFalhado('a@b.pt')
    expect(rpc).toHaveBeenCalledWith('registar_login_falhado', { p_email: 'a@b.pt' })
  })
})

describe('fetchEventosSeguranca', () => {
  it('lê os 200 mais recentes e traduz as colunas', async () => {
    m.estado.resultado = { data: [
      { id: 'e1', tipo: 'login_falhado', utilizador_id: null, email: 'a@b.pt', detalhe: null, criado_em: '2026-10-06T10:00:00Z' },
    ], error: null }
    const r = await fetchEventosSeguranca({})
    expect(m.from).toHaveBeenCalledWith('eventos_seguranca')
    expect(chamada('order')[0].args).toEqual(['criado_em', { ascending: false }])
    expect(chamada('limit')[0].args).toEqual([200])
    expect(chamada('eq')).toHaveLength(0)
    expect(r).toEqual([{ id: 'e1', tipo: 'login_falhado', utilizadorId: null, email: 'a@b.pt', detalhe: {}, criadoEm: '2026-10-06T10:00:00Z' }])
  })
  it('aplica os filtros de tipo e data', async () => {
    await fetchEventosSeguranca({ tipo: 'rate_limit', desde: '2026-10-01T00:00:00Z' })
    expect(chamada('eq')[0].args).toEqual(['tipo', 'rate_limit'])
    expect(chamada('gte')[0].args).toEqual(['criado_em', '2026-10-01T00:00:00Z'])
  })
  it('devolve [] se a tabela ainda não existir (site antes da migration)', async () => {
    m.estado.resultado = { data: null, error: { code: '42P01', message: 'relation does not exist' } }
    expect(await fetchEventosSeguranca({})).toEqual([])
  })
  it('propaga outros erros', async () => {
    m.estado.resultado = { data: null, error: { code: '42501', message: 'sem permissão' } }
    await expect(fetchEventosSeguranca({})).rejects.toBeTruthy()
  })
})

describe('contarLoginsFalhados24h', () => {
  it('conta logins falhados nas últimas 24 h', async () => {
    m.estado.resultado = { data: null, count: 12, error: null }
    const antes = Date.now()
    expect(await contarLoginsFalhados24h()).toBe(12)
    expect(chamada('eq')[0].args).toEqual(['tipo', 'login_falhado'])
    const desde = new Date(chamada('gte')[0].args[1] as string).getTime()
    expect(antes - desde).toBeGreaterThanOrEqual(24 * 3600_000 - 1000)
    expect(antes - desde).toBeLessThanOrEqual(24 * 3600_000 + 1000)
  })
  it('devolve 0 se a tabela ainda não existir', async () => {
    m.estado.resultado = { data: null, count: null, error: { code: 'PGRST205', message: 'not found' } }
    expect(await contarLoginsFalhados24h()).toBe(0)
  })
})
