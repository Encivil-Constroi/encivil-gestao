import { describe, it, expect } from 'vitest'
import type { ObraResumoRow } from '@/features/obras/db'
import { construirDecisoes, saudacao, obrasEmRisco, consumoOrcamentoPct } from '@/app/lib/dashboard/resumo'

describe('saudacao', () => {
  it('usa a hora de Lisboa, não a do servidor', () => {
    // 2026-07-01 23:30 UTC = 00:30 em Lisboa (verão) → madrugada ainda é "Boa noite"
    expect(saudacao(new Date('2026-07-01T23:30:00Z'))).toBe('Boa noite')
    expect(saudacao(new Date('2026-07-01T08:00:00Z'))).toBe('Bom dia')     // 09:00 Lisboa
    expect(saudacao(new Date('2026-07-01T12:30:00Z'))).toBe('Boa tarde')   // 13:30 Lisboa
    expect(saudacao(new Date('2026-12-01T20:00:00Z'))).toBe('Boa noite')   // 20:00 Lisboa (inverno)
  })
})

describe('construirDecisoes', () => {
  it('só devolve o que tem contagem positiva, com plural correto', () => {
    const r = construirDecisoes({ contratosPorValidar: 1, autosPorValidar: 2, pedidosCombustivel: 0, faltasPorDecidir: 3 })
    expect(r.map(d => d.id)).toEqual(['contratos', 'autos', 'faltas'])
    expect(r[0].texto).toBe('1 contrato de subempreitada por validar')
    expect(r[1].texto).toBe('2 autos de medição por validar')
    expect(r[2].to).toBe('/colaboradores?aba=faltas')
  })
  it('fontes em falta (undefined) não geram itens', () => {
    expect(construirDecisoes({})).toEqual([])
  })
  it('pedidos de combustível levam ao separador de pedidos', () => {
    const [d] = construirDecisoes({ pedidosCombustivel: 4 })
    expect(d.texto).toBe('4 pedidos de combustível a aguardar autorização')
    expect(d.to).toBe('/abastecimento')
  })
})

const obra = (o: Partial<ObraResumoRow>) => ({ obra_id: 'x', nome: 'X', estado: 'ativa', saude: 'ok', orcamento: 100, custo_total: 10, motivos: [], ...o }) as unknown as ObraResumoRow

describe('obrasEmRisco', () => {
  it('exclui concluídas e saudáveis; críticas/acima do orçamento primeiro', () => {
    const r = obrasEmRisco([
      obra({ obra_id: 'ok' }),
      obra({ obra_id: 'atencao', saude: 'atencao', custo_total: 90 }),
      obra({ obra_id: 'estouro', custo_total: 150 }),
      obra({ obra_id: 'crit', saude: 'critico', custo_total: 50 }),
      obra({ obra_id: 'fim', estado: 'concluida', saude: 'critico' }),
    ])
    expect(r.map(o => o.obra_id)).toEqual(['estouro', 'crit', 'atencao'])
  })
  it('respeita o limite e trata orçamento ausente', () => {
    const muitas = Array.from({ length: 8 }, (_, i) => obra({ obra_id: `o${i}`, saude: 'critico', orcamento: null }))
    expect(obrasEmRisco(muitas, 5)).toHaveLength(5)
    expect(consumoOrcamentoPct(obra({ orcamento: null }))).toBeNull()
    expect(consumoOrcamentoPct(obra({ orcamento: 200, custo_total: 150 }))).toBe(75)
  })
})
