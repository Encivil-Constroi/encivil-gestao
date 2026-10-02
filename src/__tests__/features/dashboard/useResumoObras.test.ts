import { vi, describe, it, expect, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  fetcher: null as null | (() => Promise<unknown>),
  autos: { data: [] as unknown[], error: null as null | { message: string } },
}))

vi.mock('@/app/lib/useAsync', () => ({
  useAsync: (fn: () => Promise<unknown>) => {
    h.fetcher = fn
    return { data: undefined, loading: false, error: null, reload: vi.fn() }
  },
}))
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(() => ({ select: vi.fn(() => Promise.resolve(h.autos)) })) },
}))
vi.mock('@/features/obras/services/obrasService', () => ({
  listarObras: vi.fn().mockResolvedValue([
    { id: 'o1', active: true, status: 'ativa', budget: 100000 },
    { id: 'o2', active: true, status: 'concluida', budget: 50000 },
  ]),
}))
vi.mock('@/features/subempreiteiros/services/subempreiteirosService', () => ({
  listarSubempreiteiros: vi.fn().mockResolvedValue([{ status: 'rascunho' }, { status: 'validado' }]),
}))
vi.mock('@/features/custos/custosService', () => ({
  custosMateriaisCombustivelPorObra: vi.fn().mockResolvedValue({
    o1: { materiais: 1000, combustivel: 200 },
    o2: { materiais: 500, combustivel: 100 },
  }),
}))

import { useResumoObras } from '@/features/dashboard/hooks/useResumoObras'

type Resumo = { custoReal: number; margem: number; autosPorValidar: number; contratosPorValidar: number; obrasAtivas: number; totalOrcamento: number }
const correr = async () => { useResumoObras(); return (await h.fetcher!()) as Resumo }

beforeEach(() => { h.autos = { data: [], error: null } })

describe('useResumoObras — custo real com subempreitadas certificadas', () => {
  it('soma o certificado (valor − glosas) dos autos validados', async () => {
    h.autos.data = [
      { valor_periodo: 10000, valor_glosado: 1000, estado: 'validado' },
      { valor_periodo: 4000,  valor_glosado: 0,    estado: 'validado' },
      { valor_periodo: 9999,  valor_glosado: 0,    estado: 'rascunho' },
    ]
    const r = await correr()
    // materiais 1500 + combustível 300 + certificado 13000
    expect(r.custoReal).toBe(14800)
    expect(r.margem).toBe(150000 - 14800)
    expect(r.autosPorValidar).toBe(1)
  })

  it('trata a ausência de valor_glosado (dados antigos) como 0', async () => {
    h.autos.data = [{ valor_periodo: 2500, estado: 'validado' }]
    const r = await correr()
    expect(r.custoReal).toBe(1500 + 300 + 2500)
  })

  it('glosa total não custa nada', async () => {
    h.autos.data = [{ valor_periodo: 700, valor_glosado: 700, estado: 'validado' }]
    expect((await correr()).custoReal).toBe(1800)
  })

  it('conta obras ativas e contratos por validar', async () => {
    const r = await correr()
    expect(r.obrasAtivas).toBe(1)
    expect(r.contratosPorValidar).toBe(1)
    expect(r.totalOrcamento).toBe(150000)
  })

  it('propaga erro da consulta de autos', async () => {
    h.autos = { data: [], error: { message: 'falhou' } }
    await expect(correr()).rejects.toMatchObject({ message: 'falhou' })
  })
})
