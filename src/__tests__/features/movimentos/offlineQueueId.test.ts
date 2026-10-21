import { describe, it, expect, vi, afterEach } from 'vitest'
import { novoIdRegisto } from '@/features/movimentos/offlineQueue'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => vi.unstubAllGlobals())

describe('novoIdRegisto (client_id da fila offline)', () => {
  it('usa crypto.randomUUID quando existe', () => {
    vi.stubGlobal('crypto', { randomUUID: () => '11111111-2222-4333-8444-555555555555' })
    expect(novoIdRegisto()).toBe('11111111-2222-4333-8444-555555555555')
  })

  it('sem crypto.randomUUID gera mesmo assim um UUID v4 válido (vai para uma coluna uuid)', () => {
    vi.stubGlobal('crypto', {})
    const ids = Array.from({ length: 50 }, novoIdRegisto)
    for (const id of ids) expect(id).toMatch(UUID_V4)
    expect(new Set(ids).size).toBe(50)
  })
})
