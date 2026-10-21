import { vi, describe, it, expect, beforeEach } from 'vitest'
import { carregarNotificacoes } from '@/features/notificacoes/services/notificacoesService'

const b = vi.hoisted(() => {
  const lt = vi.fn()
  const chain: Record<string, unknown> = {}
  const q = { select: vi.fn(() => q), eq: vi.fn(() => q), not: vi.fn(() => q), in: vi.fn(() => q), lt }
  Object.assign(chain, q)
  return { q, lt, from: vi.fn(() => q), rpc: vi.fn() }
})
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: b.from, rpc: b.rpc } }))

const base = { podeValidar: false, podeCombustivel: false }
beforeEach(() => {
  vi.clearAllMocks()
  b.rpc.mockResolvedValue({ data: [], error: null })
  b.lt.mockResolvedValue({ data: [], error: null })
})

describe('carregarNotificacoes', () => {
  it('"hoje" é a data de Lisboa: 00:30 de verão (23:30 UTC do dia anterior) conta como o dia novo', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-14T23:30:00Z'))
    await carregarNotificacoes(base)
    vi.useRealTimers()
    expect(b.lt).toHaveBeenCalledWith('data_prevista_devolucao', '2026-07-15')
  })

  it('fonte secundária com erro é ignorada e as restantes devolvem-se', async () => {
    b.rpc.mockResolvedValue({ data: [{ id: 'p1', nome: 'Cimento', unidade: 'saco', stock_atual: 1, stock_minimo: 5 }], error: null })
    b.lt.mockResolvedValue({ data: null, error: { message: 'falhou' } })
    const r = await carregarNotificacoes(base)
    expect(r.map(n => n.id)).toEqual(['stock-p1'])
  })

  it('erro no alerta de stock propaga (fica visível, não é engolido)', async () => {
    b.rpc.mockResolvedValue({ data: null, error: { message: 'falhou' } })
    await expect(carregarNotificacoes(base)).rejects.toBeTruthy()
  })

  it('gera notificação de stock baixo', async () => {
    b.rpc.mockResolvedValue({ data: [{ id: 'p1', nome: 'Cimento', unidade: 'saco', stock_atual: 0, stock_minimo: 5 }], error: null })
    const r = await carregarNotificacoes(base)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ id: 'stock-p1', severity: 'danger', link: '/armazem/produto/p1' })
  })
})
