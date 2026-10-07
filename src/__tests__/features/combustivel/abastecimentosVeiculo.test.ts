import { describe, it, expect, vi, beforeEach } from 'vitest'

const q = vi.hoisted(() => ({ filtros: [] as [string, ...unknown[]][], tabela: '', linhas: [] as unknown[] }))

vi.mock('@/integrations/supabase/client', () => {
  const cadeia = {
    select: () => cadeia,
    eq: (c: string, v: unknown) => { q.filtros.push(['eq', c, v]); return cadeia },
    gte: (c: string, v: unknown) => { q.filtros.push(['gte', c, v]); return cadeia },
    order: () => cadeia,
    limit: () => Promise.resolve({ data: q.linhas, error: null }),
  }
  return { supabase: { from: (t: string) => { q.tabela = t; return cadeia } } }
})

import { listarAbastecimentosVeiculo } from '@/features/combustivel/services/pedidosService'

beforeEach(() => { q.filtros = []; q.tabela = ''; q.linhas = [] })

describe('listarAbastecimentosVeiculo', () => {
  it('filtra pela viatura e pela data e converte os numéricos', async () => {
    q.linhas = [{ id: 'a', veiculo_id: 'v1', data: '2026-10-01', litros: '40.5', custo_total: '60', contador: '1000', comb_veiculos: null }]
    const r = await listarAbastecimentosVeiculo('v1', '2026-07-09')
    expect(q.tabela).toBe('comb_abastecimentos')
    expect(q.filtros).toEqual([['eq', 'veiculo_id', 'v1'], ['gte', 'data', '2026-07-09']])
    expect(r[0]).toMatchObject({ litros: 40.5, custo_total: 60, contador: 1000 })
  })
})
