import { describe, it, expect } from 'vitest'
import {
  periodoDoPreset, periodoAnterior, granularidadeAuto, porPeriodo, consumoL100, porViatura, porMotorista, porFonte,
  metricasAprovacao, analisar, totais, diasEntre,
} from '@/features/combustivel/lib/analise'
import type { AbastecimentoAnaliseRow, PedidoRow } from '@/features/combustivel/db'

let seq = 0
function ab(o: Partial<AbastecimentoAnaliseRow> = {}): AbastecimentoAnaliseRow {
  return {
    id: `a${++seq}`, veiculo_id: 'v1', data: '2026-09-10', litros: 40, custo_total: 60, contador: null,
    responsavel: 'Rui', tipo_fonte: 'POLO2', tipo_combustivel: 'gasoleo', solicitante_id: null, colaborador_id: null,
    pedido_id: null, comb_veiculos: { nome: 'Carrinha 1', codigo: 'V1', unidade_contador: 'km' }, ...o,
  }
}
function ped(o: Partial<PedidoRow> = {}): PedidoRow {
  return {
    id: `p${++seq}`, veiculo_id: 'v1', veiculo_nome: 'Carrinha 1', funcionario_nome: 'Rui', data: '2026-09-10',
    tipo_fonte: 'POLO2', tipo_combustivel: 'gasoleo', estado: 'CONCLUIDO', contador: null, km_anterior: null,
    km_suspeito: false, foto_km_path: null, observacoes: null, local: null, solicitante_id: null, colaborador_id: null,
    criado_em: '2026-09-10T08:00:00Z', autorizado_em: null, decisao_em: null, motivo_recusa: null, contador_inicial: null,
    contador_inicial_origem: null, foto_contador_inicial_path: null, bomba_ligada_em: null, pump_auth_expires_at: null,
    pump_activated_at: null, pump_max_seconds: 600, contador_final: null, contador_final_origem: null, foto_final_path: null,
    litros: null, custo_total: null, preco_litro: null, concluido_em: null, cancelado_em: null, abastecimento_id: null,
    foto_url: null, foto_medidor_url: null, litros_gemini: null, custo_gemini: null, ...o,
  }
}

describe('períodos', () => {
  it('esta semana começa à segunda', () => {
    expect(periodoDoPreset('semana', '2026-09-30')).toEqual({ inicio: '2026-09-28', fim: '2026-09-30' })   // quarta
    expect(periodoDoPreset('semana', '2026-09-28')).toEqual({ inicio: '2026-09-28', fim: '2026-09-28' })   // segunda
    expect(periodoDoPreset('semana', '2026-10-04')).toEqual({ inicio: '2026-09-28', fim: '2026-10-04' })   // domingo
  })
  it('mês, 30 e 90 dias, ano', () => {
    expect(periodoDoPreset('mes', '2026-09-30')).toEqual({ inicio: '2026-09-01', fim: '2026-09-30' })
    expect(diasEntre(periodoDoPreset('30d', '2026-09-30').inicio, '2026-09-30')).toBe(29)
    expect(diasEntre(periodoDoPreset('90d', '2026-09-30').inicio, '2026-09-30')).toBe(89)
    expect(periodoDoPreset('ano', '2026-09-30')).toEqual({ inicio: '2026-01-01', fim: '2026-09-30' })
  })
  it('período anterior tem o mesmo número de dias e acaba na véspera', () => {
    expect(periodoAnterior({ inicio: '2026-09-01', fim: '2026-09-30' })).toEqual({ inicio: '2026-08-02', fim: '2026-08-31' })
    expect(periodoAnterior({ inicio: '2026-03-30', fim: '2026-03-30' })).toEqual({ inicio: '2026-03-29', fim: '2026-03-29' })
  })
  it('agrupamento automático pelo tamanho', () => {
    expect(granularidadeAuto({ inicio: '2026-09-28', fim: '2026-09-30' })).toBe('dia')
    expect(granularidadeAuto({ inicio: '2026-09-01', fim: '2026-09-30' })).toBe('semana')
    expect(granularidadeAuto({ inicio: '2026-01-01', fim: '2026-09-30' })).toBe('mes')
  })
})

describe('linha do tempo', () => {
  it('um balde por dia, incluindo os vazios, com somas certas', () => {
    const b = porPeriodo([ab({ data: '2026-09-28' }), ab({ data: '2026-09-28', litros: 10, custo_total: 15 }), ab({ data: '2026-09-30' })],
      { inicio: '2026-09-28', fim: '2026-09-30' }, 'dia')
    expect(b.map(x => [x.chave, x.litros, x.custo, x.n])).toEqual([
      ['2026-09-28', 50, 75, 2], ['2026-09-29', 0, 0, 0], ['2026-09-30', 40, 60, 1],
    ])
    expect(b[0].rotulo).toBe('28 set')
  })
  it('semanas começam à segunda; meses no dia 1; fora do período não conta', () => {
    const sem = porPeriodo([ab({ data: '2026-09-02' }), ab({ data: '2026-09-07' }), ab({ data: '2026-10-01' })],
      { inicio: '2026-09-01', fim: '2026-09-14' }, 'semana')
    expect(sem.map(x => [x.chave, x.n])).toEqual([['2026-08-31', 1], ['2026-09-07', 1], ['2026-09-14', 0]])
    const mes = porPeriodo([ab({ data: '2026-01-15' }), ab({ data: '2026-03-02' })], { inicio: '2026-01-01', fim: '2026-03-31' }, 'mes')
    expect(mes.map(x => [x.chave, x.n, x.rotulo])).toEqual([['2026-01-01', 1, 'jan 26'], ['2026-02-01', 0, 'fev 26'], ['2026-03-01', 1, 'mar 26']])
  })
})

describe('consumo L/100 km', () => {
  it('litros depois da 1.ª leitura ÷ km percorridos', () => {
    // 1000 km → 2000 km com 30 + 50 L depois da primeira = 8 L/100
    expect(consumoL100([ab({ contador: 1000, litros: 99 }), ab({ contador: 1500, litros: 30 }), ab({ contador: 2000, litros: 50 })])).toBe(8)
  })
  it('ordem de registo não importa (usa a ordem dos km)', () => {
    expect(consumoL100([ab({ contador: 2000, litros: 50 }), ab({ contador: 1000, litros: 99 }), ab({ contador: 1500, litros: 30 })])).toBe(8)
  })
  it('menos de duas leituras, km parados, máquinas em horas ou valor absurdo: sem número', () => {
    expect(consumoL100([ab({ contador: 1000 })])).toBeNull()
    expect(consumoL100([ab({ contador: 1000 }), ab({ contador: 1000 })])).toBeNull()
    const horas = { nome: 'Giratória', codigo: 'M1', unidade_contador: 'horas' }
    // Em km dava 5 L/100 — em horas não se calcula
    expect(consumoL100([ab({ contador: 1000 }), ab({ contador: 2000, litros: 50 })])).toBe(5)
    expect(consumoL100([ab({ contador: 1000, comb_veiculos: horas }), ab({ contador: 2000, litros: 50, comb_veiculos: horas })])).toBeNull()
    expect(consumoL100([ab({ contador: 1000 }), ab({ contador: 1010, litros: 500 })])).toBeNull()
  })
})

describe('agregações', () => {
  it('totais e preço médio', () => {
    expect(totais([ab(), ab({ litros: 10, custo_total: 20 })])).toEqual({ litros: 50, custo: 80, n: 2, precoMedio: 1.6 })
    expect(totais([]).precoMedio).toBeNull()
    expect(totais([ab({ custo_total: 0 })]).precoMedio).toBeNull()
  })
  it('por viatura: ordenado pelo custo, com km e consumo', () => {
    const v = porViatura([
      ab({ veiculo_id: 'v1', custo_total: 10, contador: 100 }), ab({ veiculo_id: 'v1', custo_total: 10, contador: 600, litros: 40 }),
      ab({ veiculo_id: 'v2', custo_total: 50, comb_veiculos: { nome: 'Hilux', codigo: 'V2', unidade_contador: 'km' } }),
    ])
    expect(v.map(x => [x.id, x.custo, x.km])).toEqual([['v2', 50, null], ['v1', 20, 500]])
    expect(v[1].l100).toBe(8)
  })
  it('por motorista: agrupa pela conta/colaborador mesmo com nomes diferentes; sem conta, pelo nome sem maiúsculas', () => {
    const m = porMotorista([
      ab({ colaborador_id: 'c1', responsavel: 'Zé Gaitas' }), ab({ colaborador_id: 'c1', responsavel: 'Zé', veiculo_id: 'v2' }),
      ab({ responsavel: 'rui costa' }), ab({ responsavel: 'Rui Costa ' }), ab({ responsavel: null }),
    ])
    expect(m.map(x => [x.nome, x.n, x.viaturas])).toEqual([['Zé Gaitas', 2, 2], ['rui costa', 2, 1], ['Sem nome', 1, 1]])
  })
  it('por origem: sem tipo = registo manual; só origens com dados', () => {
    expect(porFonte([ab(), ab({ tipo_fonte: null }), ab({ tipo_fonte: 'POSTO_RUA' })]).map(f => f.fonte)).toEqual(['POLO2', 'POSTO_RUA', 'MANUAL'])
  })
})

describe('aprovação', () => {
  it('tempo de resposta: média e mediana, recusas, mais de 1 h, a aguardar', () => {
    const m = metricasAprovacao([
      ped({ decisao_em: '2026-09-10T08:10:00Z' }), ped({ decisao_em: '2026-09-10T08:20:00Z', estado: 'REJEITADO' }),
      ped({ decisao_em: '2026-09-10T09:30:00Z' }), ped({ estado: 'AGUARDA_AUTORIZACAO' }),
    ])
    expect(m).toEqual({ decididos: 3, mediaMin: 40, medianaMin: 20, recusados: 1, mais1h: 1, aguardam: 1 })
    expect(metricasAprovacao([ped({ decisao_em: '2026-09-10T08:10:00Z' }), ped({ decisao_em: '2026-09-10T08:30:00Z' })]).medianaMin).toBe(20)
    expect(metricasAprovacao([]).mediaMin).toBeNull()
  })
})

describe('o analista', () => {
  const ids = (i: ReturnType<typeof analisar>) => i.map(x => x.id)

  it('sem dados: diz isso e mais nada', () => {
    expect(ids(analisar([], [], []))).toEqual(['vazio'])
  })

  it('custo a subir: atenção a partir de 15%, crítico a partir de 40%', () => {
    expect(analisar([ab({ custo_total: 115 })], [ab({ custo_total: 100 })], []).find(i => i.id === 'custo-sobe')?.nivel).toBe('atencao')
    expect(analisar([ab({ custo_total: 139 })], [ab({ custo_total: 100 })], []).find(i => i.id === 'custo-sobe')?.nivel).toBe('atencao')
    expect(analisar([ab({ custo_total: 150 })], [ab({ custo_total: 100 })], []).find(i => i.id === 'custo-sobe')?.nivel).toBe('critico')
    expect(ids(analisar([ab({ custo_total: 110 })], [ab({ custo_total: 100 })], []))).not.toContain('custo-sobe')
    expect(analisar([ab({ custo_total: 80 })], [ab({ custo_total: 100 })], []).find(i => i.id === 'custo-desce')?.nivel).toBe('bom')
  })

  it('viatura a gastar muito acima da mediana da frota', () => {
    const viat = (id: string, l: number) => [
      ab({ veiculo_id: id, contador: 1000, data: '2026-09-01' }),
      ab({ veiculo_id: id, contador: 2000, litros: l, data: '2026-09-05', comb_veiculos: { nome: id, codigo: id, unidade_contador: 'km' } }),
    ].map(r => ({ ...r, comb_veiculos: { nome: id, codigo: id, unidade_contador: 'km' } }))
    const i = analisar([...viat('A', 80), ...viat('B', 80), ...viat('C', 120)], [], [])
    expect(i.find(x => x.id === 'consumo-C')).toMatchObject({ nivel: 'atencao', titulo: 'C gasta 12 L/100 km' })
    expect(ids(i)).not.toContain('consumo-A')
    expect(analisar([...viat('A', 80), ...viat('B', 80), ...viat('C', 200)], [], []).find(x => x.id === 'consumo-C')?.nivel).toBe('critico')
  })

  it('mesma viatura duas vezes no mesmo dia', () => {
    const i = analisar([ab({ data: '2026-09-10' }), ab({ data: '2026-09-10', litros: 20 })], [], [])
    expect(i.find(x => x.id === 'repetidos')?.detalhe).toMatch(/10\/09\/2026/)
  })

  it('km suspeitos, aprovação lenta, recusas repetidas', () => {
    const pedidos = [
      ped({ km_suspeito: true }),
      ped({ decisao_em: '2026-09-10T09:30:00Z' }), ped({ decisao_em: '2026-09-10T08:05:00Z' }), ped({ decisao_em: '2026-09-10T08:06:00Z' }),
      ...Array.from({ length: 3 }, () => ped({ estado: 'REJEITADO', funcionario_nome: 'Tó' })),
    ]
    const i = analisar([ab()], [], pedidos)
    expect(ids(i)).toEqual(expect.arrayContaining(['km', 'aprovacao-lenta', 'recusas-Tó']))
  })

  it('aprovação rápida é boa notícia', () => {
    const pedidos = [1, 2, 3].map(m => ped({ decisao_em: `2026-09-10T08:0${m}:00Z` }))
    expect(analisar([ab()], [], pedidos).find(i => i.id === 'aprovacao-rapida')?.nivel).toBe('bom')
  })

  it('posto de rua mais caro do que a bomba da empresa', () => {
    const i = analisar([
      ab({ tipo_fonte: 'POLO2', litros: 100, custo_total: 150 }),
      ab({ tipo_fonte: 'POSTO_RUA', litros: 100, custo_total: 180, data: '2026-09-11' }),
    ], [], [])
    expect(i.find(x => x.id === 'posto')?.titulo).toMatch(/30,00/)
  })

  it('nada de errado: diz que está tudo normal; problemas vêm primeiro', () => {
    expect(ids(analisar([ab()], [], []))).toEqual(['tudo-ok'])
    const i = analisar([ab({ data: '2026-09-10' }), ab({ data: '2026-09-10', litros: 1 })], [ab({ custo_total: 200 })], [])
    expect(i[0].nivel).toBe('atencao')
    expect(i.at(-1)?.nivel).toBe('bom')
  })
})
