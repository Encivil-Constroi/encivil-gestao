import { describe, it, expect } from 'vitest'
import {
  progressoEsperado, desvioProgresso, classificarRitmo, textoDesvio, textoPrazo, estadoPrazo, diasParaFim,
  percentagemOrcamento, estadoOrcamento, textoUltimoRelatorio, limitarPct, hojeISO, diasEntre,
} from '@/features/obras/lib/progresso'
import { calcularKpis, ordenarPorSaude, precisaAtencao, piorSaude, rotuloEstado, SAUDE_INFO } from '@/features/obras/lib/saude'
import { rotuloClima, climaAdverso, CLIMAS } from '@/features/obras/lib/clima'
import { caminhoFotoObra, caminhoContrato } from '@/features/obras/lib/fotosObras'
import { obraFixture } from './obrasFixtures'

describe('progresso esperado', () => {
  it('é linear entre início e fim previstos', () => {
    expect(progressoEsperado('2026-01-01', '2026-01-11', '2026-01-06')).toBe(50)
    expect(progressoEsperado('2026-01-01', '2026-01-11', '2026-01-01')).toBe(0)
    expect(progressoEsperado('2026-01-01', '2026-01-11', '2026-01-11')).toBe(100)
  })
  it('limita a 0–100 antes do início e depois do fim', () => {
    expect(progressoEsperado('2026-03-01', '2026-04-01', '2026-02-01')).toBe(0)
    expect(progressoEsperado('2026-03-01', '2026-04-01', '2026-06-01')).toBe(100)
  })
  it('é nulo se faltar uma das datas', () => {
    expect(progressoEsperado(null, '2026-04-01', '2026-02-01')).toBeNull()
    expect(progressoEsperado('2026-03-01', null, '2026-02-01')).toBeNull()
  })
  it('não se perde com a mudança de hora (dias em UTC)', () => {
    expect(diasEntre('2026-03-28', '2026-03-30')).toBe(2)
    expect(diasEntre('2026-10-24', '2026-10-26')).toBe(2)
  })
  it('hojeISO formata a data local', () => {
    expect(hojeISO(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('desvio e ritmo', () => {
  it('desvio em pontos percentuais', () => {
    expect(desvioProgresso(40, 50)).toBe(-10)
    expect(desvioProgresso(60, 50)).toBe(10)
    expect(desvioProgresso(null, 50)).toBeNull()
    expect(desvioProgresso(50, null)).toBeNull()
  })
  it('classifica com os limiares da saúde (8 e 20 pontos)', () => {
    expect(classificarRitmo(70, 50)).toBe('adiantado')
    expect(classificarRitmo(52, 50)).toBe('no_prazo')
    expect(classificarRitmo(43, 50)).toBe('no_prazo')
    expect(classificarRitmo(42, 50)).toBe('atrasado')
    expect(classificarRitmo(31, 50)).toBe('atrasado')
    expect(classificarRitmo(30, 50)).toBe('muito_atrasado')
    expect(classificarRitmo(null, 50)).toBe('sem_dados')
  })
  it('textos de apresentação', () => {
    expect(textoDesvio(40, 50)).toBe('10 pontos atrás do previsto')
    expect(textoDesvio(60, 50)).toBe('10 pontos à frente do previsto')
    expect(textoDesvio(50, 50)).toBe('Em linha com o previsto')
    expect(textoDesvio(null, 50)).toBeNull()
  })
  it('limitarPct', () => {
    expect(limitarPct(150)).toBe(100)
    expect(limitarPct(-5)).toBe(0)
    expect(limitarPct(null)).toBeNull()
    expect(limitarPct(NaN)).toBeNull()
  })
})

describe('prazo', () => {
  const hoje = '2026-05-10'
  it('texto e estado', () => {
    expect(textoPrazo('2026-05-25', hoje)).toBe('Faltam 15 dias')
    expect(textoPrazo('2026-05-11', hoje)).toBe('Falta 1 dia')
    expect(textoPrazo('2026-05-10', hoje)).toBe('Termina hoje')
    expect(textoPrazo('2026-05-05', hoje)).toBe('Prazo ultrapassado há 5 dias')
    expect(textoPrazo('2026-05-09', hoje)).toBe('Prazo ultrapassado há 1 dia')
    expect(textoPrazo(null, hoje)).toBe('Sem prazo definido')
    expect(diasParaFim('2026-05-12', hoje)).toBe(2)
    expect(estadoPrazo('2026-06-30', hoje)).toBe('folga')
    expect(estadoPrazo('2026-05-20', hoje)).toBe('curto')
    expect(estadoPrazo('2026-05-09', hoje)).toBe('vencido')
    expect(estadoPrazo(null, hoje)).toBe('sem_prazo')
  })
})

describe('orçamento', () => {
  it('percentagem e estado (90 % = perto, > 100 % = excedido)', () => {
    expect(percentagemOrcamento(50, 100)).toBe(50)
    expect(percentagemOrcamento(10, null)).toBeNull()
    expect(percentagemOrcamento(10, 0)).toBeNull()
    expect(estadoOrcamento(50, 100)).toBe('ok')
    expect(estadoOrcamento(90, 100)).toBe('perto')
    expect(estadoOrcamento(100, 100)).toBe('perto')
    expect(estadoOrcamento(101, 100)).toBe('excedido')
    expect(estadoOrcamento(5, null)).toBe('sem_orcamento')
  })
  it('último relatório', () => {
    expect(textoUltimoRelatorio(null, null)).toBe('Sem relatórios')
    expect(textoUltimoRelatorio(0, '2026-05-10')).toBe('Relatório de hoje')
    expect(textoUltimoRelatorio(1, '2026-05-09')).toBe('Último relatório ontem')
    expect(textoUltimoRelatorio(4, '2026-05-06')).toBe('Último relatório há 4 dias')
  })
})

describe('saúde (apresentação e agregados)', () => {
  it('cada nível tem texto, ícone e cor (nunca só cor)', () => {
    for (const s of ['ok', 'atencao', 'critico'] as const) {
      expect(SAUDE_INFO[s].rotulo.length).toBeGreaterThan(0)
      expect(SAUDE_INFO[s].icone).toBeTruthy()
      expect(SAUDE_INFO[s].cls).toMatch(/text-/)
    }
    expect(piorSaude('ok', 'critico')).toBe('critico')
    expect(piorSaude('atencao', 'ok')).toBe('atencao')
    expect(rotuloEstado('concluida')).toBe('Concluída')
  })

  it('ordena do mais grave para o menos grave, depois por nome', () => {
    const l = ordenarPorSaude([
      obraFixture({ nome: 'B', saude: 'ok' }), obraFixture({ nome: 'A', saude: 'ok' }),
      obraFixture({ nome: 'C', saude: 'critico' }), obraFixture({ nome: 'D', saude: 'atencao' }),
    ])
    expect(l.map(o => o.nome)).toEqual(['C', 'D', 'A', 'B'])
  })

  it('só as obras ativas e não saudáveis precisam de atenção', () => {
    expect(precisaAtencao({ estado: 'ativa', saude: 'atencao' })).toBe(true)
    expect(precisaAtencao({ estado: 'ativa', saude: 'ok' })).toBe(false)
    expect(precisaAtencao({ estado: 'suspensa', saude: 'critico' })).toBe(false)
  })

  it('KPIs contam só as obras em curso', () => {
    const k = calcularKpis([
      obraFixture({ estado: 'ativa', saude: 'critico', progresso_pct: 20, orcamento: 1000, custo_total: 500, ocorrencias_abertas: 2, dias_sem_relatorio: 5 }),
      obraFixture({ estado: 'ativa', saude: 'atencao', progresso_pct: 60, orcamento: 3000, custo_total: 1000, ocorrencias_abertas: 1, dias_sem_relatorio: 0 }),
      obraFixture({ estado: 'ativa', saude: 'ok', progresso_pct: null, orcamento: null, custo_total: 70, dias_sem_relatorio: null }),
      obraFixture({ estado: 'concluida', saude: 'ok', progresso_pct: 100, orcamento: 9999, custo_total: 9999, ocorrencias_abertas: 9 }),
    ])
    expect(k.emCurso).toBe(3)
    expect(k.criticas).toBe(1)
    expect(k.atencao).toBe(1)
    expect(k.progressoMedio).toBe(40)
    expect(k.orcamentoTotal).toBe(4000)
    expect(k.custoTotal).toBe(1500)
    expect(k.ocorrenciasAbertas).toBe(3)
    expect(k.semRelatorio).toBe(2)
  })

  it('KPIs sem obras', () => {
    expect(calcularKpis([])).toMatchObject({ emCurso: 0, progressoMedio: null, orcamentoTotal: 0 })
  })
})

describe('clima', () => {
  it('tem os nove valores do desenho e rótulos em português', () => {
    expect(CLIMAS.map(c => c.valor)).toEqual(['SOL', 'NUBLADO', 'CHUVA_FRACA', 'CHUVA_FORTE', 'VENTO', 'NEVOEIRO', 'CALOR_EXTREMO', 'FRIO', 'TEMPESTADE'])
    expect(rotuloClima('CHUVA_FORTE')).toBe('Chuva forte')
    expect(rotuloClima(null)).toBe('—')
    expect(climaAdverso('TEMPESTADE')).toBe(true)
    expect(climaAdverso('SOL')).toBe(false)
  })
})

describe('caminhos de armazenamento', () => {
  it('fotos: <obra>/<pasta>/<ts>-<rand>.<ext>', () => {
    expect(caminhoFotoObra('o1', 'galeria', 'image/png', 1700, 'abc')).toEqual({ caminho: 'o1/galeria/1700-abc.png', contentType: 'image/png' })
    expect(caminhoFotoObra('o1', 'relatorios', 'image/xyz', 1, 'q')).toEqual({ caminho: 'o1/relatorios/1-q.jpg', contentType: 'image/jpeg' })
  })
  it('contratos: <subempreiteiro>/contrato-<ts>.<ext>', () => {
    expect(caminhoContrato('s1', 'application/pdf', 5)).toEqual({ caminho: 's1/contrato-5.pdf', contentType: 'application/pdf' })
    expect(caminhoContrato('s1', 'image/jpeg', 5).caminho).toBe('s1/contrato-5.jpg')
  })
})
