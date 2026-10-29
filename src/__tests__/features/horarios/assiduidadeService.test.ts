import { vi, describe, it, expect, beforeEach } from 'vitest'
import { listarAssiduidadeMes, listarAssiduidadeEquipa } from '@/features/horarios/services/assiduidadeService'

const b = vi.hoisted(() => {
  const q: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const m of ['select', 'eq', 'gte', 'lte', 'order', 'range']) q[m] = vi.fn(() => q)
  ;(q as unknown as { then: unknown }).then = (res: (v: unknown) => void) => res({ data: [], error: null })
  return { q, from: vi.fn(() => q) }
})
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: b.from } }))

beforeEach(() => vi.clearAllMocks())

describe('fim de mês', () => {
  it('julho termina a 31, sem recuar para 30 por causa do UTC', async () => {
    await listarAssiduidadeMes('c1', 2026, 7)
    expect(b.q.gte).toHaveBeenCalledWith('data', '2026-07-01')
    expect(b.q.lte).toHaveBeenCalledWith('data', '2026-07-31')
  })
  it('equipa: julho termina a 31', async () => {
    await listarAssiduidadeEquipa(2026, 7)
    expect(b.q.lte).toHaveBeenCalledWith('data', '2026-07-31')
  })
})
