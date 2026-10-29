import { vi, describe, it, expect, beforeEach } from 'vitest'

const b = vi.hoisted(() => {
  const q: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const k of ['order', 'gte', 'lt', 'eq', 'or']) q[k] = vi.fn(() => q)
  q.range = vi.fn(() => Promise.resolve({ data: [], error: null, count: 123 }))
  q.select = vi.fn(() => q)
  return q
})

vi.mock('@/app/lib/armazemDb', () => ({ armazemDb: { from: () => b } }))

import { listarMovimentosArmazem } from '@/features/movimentos/services/armazemService'

beforeEach(() => { b.select.mockClear() })

describe('listarMovimentosArmazem: contagem', () => {
  it('a 1.ª página pede count exato', async () => {
    const r = await listarMovimentosArmazem({}, 0, 50)
    expect(b.select.mock.calls[0][1]).toEqual({ count: 'exact' })
    expect(r.total).toBe(123)
  })

  it('a 2.ª página não pede count e reutiliza o total conhecido', async () => {
    const r = await listarMovimentosArmazem({}, 1, 50, 123)
    expect(b.select.mock.calls[0][1]).toBeUndefined()
    expect(r.total).toBe(123)
  })

  it('sem total conhecido, a 2.ª página pede count (ex.: abertura direta)', async () => {
    await listarMovimentosArmazem({}, 1, 50)
    expect(b.select.mock.calls[0][1]).toEqual({ count: 'exact' })
  })
})
