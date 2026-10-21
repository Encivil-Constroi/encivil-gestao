import { vi, describe, it, expect, beforeEach } from 'vitest'
import { listarPicagensDia, listarPicagensObraDia } from '@/features/picagens/services/picagensService'

const b = vi.hoisted(() => {
  const q: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const m of ['select', 'eq', 'gte', 'lt', 'lte', 'order']) q[m] = vi.fn(() => q)
  ;(q as unknown as { then: unknown }).then = (res: (v: unknown) => void) => res({ data: [], error: null })
  return { q, from: vi.fn(() => q) }
})
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: b.from } }))

beforeEach(() => vi.clearAllMocks())

describe('limites do dia de Lisboa', () => {
  it('verão: dia vai de 00:00+01:00 a 00:00+01:00 do dia seguinte (exclusivo)', async () => {
    await listarPicagensDia('c1', '2026-07-15')
    expect(b.q.gte).toHaveBeenCalledWith('timestamp_dispositivo', '2026-07-15T00:00:00+01:00')
    expect(b.q.lt).toHaveBeenCalledWith('timestamp_dispositivo', '2026-07-16T00:00:00+01:00')
    expect(b.q.lte).not.toHaveBeenCalled()
  })
  it('obra: inverno usa +00:00', async () => {
    await listarPicagensObraDia('o1', '2026-12-01')
    expect(b.q.gte).toHaveBeenCalledWith('timestamp_dispositivo', '2026-12-01T00:00:00+00:00')
    expect(b.q.lt).toHaveBeenCalledWith('timestamp_dispositivo', '2026-12-02T00:00:00+00:00')
  })
})
