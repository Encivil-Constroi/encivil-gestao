import { vi, describe, it, expect, beforeEach } from 'vitest'
import { supabase } from '@/integrations/supabase/client'
import { listarAuditoria } from '@/app/pages/auditoria/dados'

const q = vi.hoisted(() => {
  const b: Record<string, ReturnType<typeof vi.fn>> & { then?: unknown } = {}
  for (const m of ['select', 'order', 'range', 'gte', 'lt', 'like', 'eq', 'or']) b[m] = vi.fn(() => b)
  b.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], count: 0, error: null }).then(ok)
  return b
})
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }))

beforeEach(() => {
  vi.mocked(supabase.from).mockReturnValue(q as never)
  for (const m of ['select', 'order', 'range', 'gte', 'lt', 'like', 'eq', 'or']) q[m].mockClear()
})

describe('listarAuditoria', () => {
  it('aplica todos os filtros e a página 1', async () => {
    await listarAuditoria({ atorId: 'a', tabela: 'obras', operacao: 'update', desde: '2026-10-01', ate: '2026-10-07' }, 1)
    expect(q.eq).toHaveBeenCalledWith('actor_id', 'a')
    expect(q.like).toHaveBeenCalledWith('action', 'obras.update')
    expect(q.gte).toHaveBeenCalledWith('created_at', '2026-09-30T23:00:00.000Z')
    expect(q.lt).toHaveBeenCalledWith('created_at', '2026-10-07T23:00:00.000Z')
    expect(q.range).toHaveBeenCalledWith(50, 99)
  })
  it('só operação', async () => {
    await listarAuditoria({ operacao: 'update' }, 0)
    expect(q.like).toHaveBeenCalledWith('action', '%.update')
  })
  it('só tabela', async () => {
    await listarAuditoria({ tabela: 'obras' }, 0)
    expect(q.like).toHaveBeenCalledWith('action', 'obras.%')
  })
  it('Eliminação apanha também as ações antigas delete_*', async () => {
    await listarAuditoria({ operacao: 'delete' }, 0)
    expect(q.or).toHaveBeenCalledWith('action.like.%.delete,action.like.delete_%')
    expect(q.like).not.toHaveBeenCalled()
  })
  it('módulo com eliminação antiga (autos de medição)', async () => {
    await listarAuditoria({ tabela: 'autos_medicao' }, 0)
    expect(q.or).toHaveBeenCalledWith('action.like.autos_medicao.%,action.eq.delete_autos_medicao')
    await listarAuditoria({ tabela: 'comb_abastecimentos', operacao: 'delete' }, 0)
    expect(q.or).toHaveBeenCalledWith('action.like.comb_abastecimentos.delete,action.eq.delete_comb_abastecimentos')
    q.or.mockClear()
    await listarAuditoria({ tabela: 'subempreiteiros', operacao: 'update' }, 0)
    expect(q.like).toHaveBeenCalledWith('action', 'subempreiteiros.update')
    expect(q.or).not.toHaveBeenCalled()
  })
})
