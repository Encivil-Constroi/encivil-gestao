import { vi, describe, it, expect, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({ order: vi.fn(), range: vi.fn() }))
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => {
        const q = { order: (c: string) => { m.order(c); return q }, range: (de: number, ate: number) => m.range(de, ate) }
        return q
      },
    }),
  },
}))

import { paginar } from '@/features/backup/backupService'

beforeEach(() => vi.clearAllMocks())

describe('backup: paginar', () => {
  it('ordena por id (ordem estável entre páginas)', async () => {
    m.range.mockResolvedValue({ data: [], error: null })
    await paginar('obras', '*')
    expect(m.order.mock.calls).toEqual([['id']])
  })

  it('tabelas sem id ordenam pela chave primária', async () => {
    m.range.mockResolvedValue({ data: [], error: null })
    await paginar('horario_colaborador', '*')
    expect(m.order.mock.calls).toEqual([['colaborador_id'], ['valido_de']])
  })

  it('com max_rows de 500 continua até vir uma página vazia', async () => {
    const pag = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }))
    m.range.mockResolvedValueOnce({ data: pag(500), error: null })
      .mockResolvedValueOnce({ data: pag(500), error: null })
      .mockResolvedValueOnce({ data: [], error: null })
    expect(await paginar('obras', '*')).toHaveLength(1000)
    expect(m.range.mock.calls).toEqual([[0, 999], [500, 1499], [1000, 1999]])
  })
})
