import { describe, it, expect } from 'vitest'
import { diaLisboa, intervaloDatas, getPeriodConfig } from '@/app/lib/relatorios/periodo'
import { calcTrend } from '@/app/lib/relatorios/tendencia'
import { analiseObras, margemPctDe, saudeMargem, ordenarPortefolio } from '@/app/lib/relatorios/obrasAnalise'
import { construirAtencao } from '@/app/lib/relatorios/atencao'
import type { ObraResumoRow, SubsPainelCeo } from '@/features/obras/db'
import type { ResumoViaturaRow } from '@/features/frota/db'

const obra = (p: Partial<ObraResumoRow>): ObraResumoRow => ({
  obra_id: 'o1', nome: 'Obra 1', estado: 'ativa', saude: 'ok', motivos: [],
  orcamento: 1000, custo_total: 500, ...p,
} as ObraResumoRow)

const viatura = (p: Partial<ResumoViaturaRow>): ResumoViaturaRow => ({
  id: 'v1', nome: 'Hilux', alertas_urgentes: 0, alertas_atencao: 0, ...p,
} as ResumoViaturaRow)

describe('periodo', () => {
  it('dia de Lisboa: 23:30 UTC no verão já é o dia seguinte', () => {
    expect(diaLisboa(new Date('2026-07-10T23:30:00Z'))).toBe('2026-07-11')
  })
  it('dia de Lisboa: no inverno UTC e Lisboa coincidem', () => {
    expect(diaLisboa(new Date('2026-01-10T23:30:00Z'))).toBe('2026-01-10')
  })
  it('virada de mês: 23:30 UTC de 31/07 já é 01/08 em Lisboa', () => {
    expect(diaLisboa(new Date('2026-07-31T23:30:00Z'))).toBe('2026-08-01')
  })
  it('intervalo "hoje" começa e acaba no mesmo dia', () => {
    const now = new Date('2026-10-06T12:00:00Z')
    expect(intervaloDatas('hoje', now)).toEqual({ ini: '2026-10-06', fim: '2026-10-06' })
  })
  it('período anterior termina antes do atual começar', () => {
    const c = getPeriodConfig('semana', new Date('2026-10-06T12:00:00Z'))
    expect(c.prevTo.getTime()).toBeLessThanOrEqual(c.currFrom.getTime())
  })
})

describe('tendencia', () => {
  it('sem período anterior não há tendência', () => expect(calcTrend(5, 0)).toBeNull())
  it('sobe, desce e estabiliza', () => {
    expect(calcTrend(150, 100)).toEqual({ pct: 50, dir: 'up' })
    expect(calcTrend(50, 100)).toEqual({ pct: 50, dir: 'down' })
    expect(calcTrend(100.5, 100)).toEqual({ pct: 1, dir: 'neutral' })
  })
})

describe('obrasAnalise', () => {
  it('margem e saúde pela percentagem do orçamento', () => {
    expect(margemPctDe(obra({ orcamento: 1000, custo_total: 800 }))).toBe(20)
    expect(saudeMargem(obra({ orcamento: 1000, custo_total: 800 }))).toBe('ok')
    expect(saudeMargem(obra({ orcamento: 1000, custo_total: 900 }))).toBe('atencao')
    expect(saudeMargem(obra({ orcamento: 1000, custo_total: 1100 }))).toBe('critico')
    expect(saudeMargem(obra({ orcamento: null }))).toBe('sem-dados')
    expect(saudeMargem(obra({ orcamento: 0 }))).toBe('sem-dados')
  })
  it('margem global só compara obras com orçamento (sem misturar custos sem orçamento)', () => {
    const a = analiseObras([
      obra({ obra_id: 'a', orcamento: 1000, custo_total: 600 }),
      obra({ obra_id: 'b', orcamento: null, custo_total: 9999 }),
    ])
    expect(a.totalMargem).toBe(400)
    expect(a.totalCusto).toBe(10599)
    expect(a.margemPct).toBe(40)
  })
  it('classifica prejuízo e risco de estouro', () => {
    const a = analiseObras([
      obra({ obra_id: 'a', orcamento: 1000, custo_total: 1200 }),
      obra({ obra_id: 'b', orcamento: 1000, custo_total: 900 }),
      obra({ obra_id: 'c', orcamento: 1000, custo_total: 100 }),
    ])
    expect(a.noVermelho.map(o => o.obra_id)).toEqual(['a'])
    expect(a.emRisco.map(o => o.obra_id)).toEqual(['b'])
    expect(a.melhor.o.obra_id).toBe('c')
    expect(a.pior?.o.obra_id).toBe('a')
  })
  it('lista vazia não rebenta', () => {
    const a = analiseObras([])
    expect(a.margemPct).toBeNull()
    expect(a.melhor).toBeUndefined()
  })
  it('ativas primeiro, depois maior custo', () => {
    const r = ordenarPortefolio([
      obra({ obra_id: 'c', estado: 'concluida', custo_total: 9000 }),
      obra({ obra_id: 'a', estado: 'ativa', custo_total: 10 }),
      obra({ obra_id: 'b', estado: 'ativa', custo_total: 50 }),
    ])
    expect(r.map(o => o.obra_id)).toEqual(['b', 'a', 'c'])
  })
})

describe('construirAtencao', () => {
  it('ordena por gravidade e liga ao módulo', () => {
    const subs = { alertas: [{ tipo: 'DOC', sub_id: 's1', obra_id: 'o1', texto: 'Seguro expirado', gravidade: 'alta' }] } as unknown as SubsPainelCeo
    const r = construirAtencao({
      obras: [obra({ saude: 'atencao', motivos: ['Sem relatório há 5 dias'] })],
      subs,
      frota: [viatura({ alertas_urgentes: 2 })],
      artigosEmAlerta: 3,
    })
    expect(r.map(i => i.gravidade)).toEqual(['alta', 'alta', 'media', 'media'])
    expect(r.find(i => i.modulo === 'Frota')).toMatchObject({ texto: 'Hilux: 2 alertas urgentes', to: '/frota/viatura/v1' })
    expect(r.find(i => i.modulo === 'Subempreitadas')?.to).toBe('/obras/subempreitada/s1')
  })
  it('obra com custo acima do orçamento é alta; concluída é ignorada', () => {
    const r = construirAtencao({ obras: [
      obra({ obra_id: 'a', custo_total: 2000 }),
      obra({ obra_id: 'b', estado: 'concluida', custo_total: 2000 }),
    ] })
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ gravidade: 'alta', to: '/obras/a' })
  })
  it('módulos em falta (undefined) não geram itens nem erros', () => {
    expect(construirAtencao({})).toEqual([])
  })
  it('singular e plural', () => {
    const r = construirAtencao({ artigosEmAlerta: 1, ferramentasEmAtraso: 2 })
    expect(r[0].texto).toBe('1 artigo com stock baixo ou esgotado')
    expect(r[1].texto).toBe('2 ferramentas por devolver (prazo passado)')
  })
})
