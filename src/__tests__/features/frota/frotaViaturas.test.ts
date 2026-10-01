import { describe, it, expect } from 'vitest'
import {
  classeDaViatura, nivelPrazo, nivelRevisao, filtrarViaturas, contarPorEstado, documentosEmRisco, estadoDeParametro,
  filtrarLinhaTempo, percorridoDesdeRegisto, unidadePorTipo, textoLeitura,
} from '@/features/frota/lib/viaturas'
import { caminhoFotoDocumento } from '@/features/frota/lib/fotosFrota'
import type { LinhaTempoRow } from '@/features/frota/db'
import { resumo, dataEm } from './frotaFixtures'

describe('classeDaViatura', () => {
  it.each([
    ['viatura', 'km', 'VIATURA'], ['maquina', 'km', 'MAQUINA'], ['gerador', 'horas', 'MAQUINA'],
    ['outro', 'km', 'MAQUINA'], ['viatura', 'horas', 'MAQUINA'],
  ])('tipo %s com contador %s é %s', (tipo, unidade_contador, esperado) => {
    expect(classeDaViatura({ tipo, unidade_contador })).toBe(esperado)
  })
  it('a unidade sugerida segue o tipo', () => {
    expect(unidadePorTipo('viatura')).toBe('km')
    expect(unidadePorTipo('maquina')).toBe('horas')
    expect(unidadePorTipo('gerador')).toBe('horas')
  })
})

describe('nivelPrazo', () => {
  const hoje = new Date(2026, 9, 10)
  it('classifica por dias até à data', () => {
    expect(nivelPrazo(null, hoje)).toBe('SEM_DATA')
    expect(nivelPrazo('2026-10-09', hoje)).toBe('EXPIRADO')
    expect(nivelPrazo('2026-10-10', hoje)).toBe('A_VENCER')
    expect(nivelPrazo('2026-11-09', hoje)).toBe('A_VENCER')
    expect(nivelPrazo('2026-11-10', hoje)).toBe('OK')
  })
  it('a revisão segue os alertas e, sem eles, o registo da última revisão', () => {
    const base = { alertas_urgentes: 0, alertas_atencao: 0, data_ultima_revisao: null }
    expect(nivelRevisao(base)).toBe('SEM_DATA')
    expect(nivelRevisao({ ...base, data_ultima_revisao: '2026-01-01' })).toBe('OK')
    expect(nivelRevisao({ ...base, alertas_atencao: 1 })).toBe('A_VENCER')
    expect(nivelRevisao({ ...base, alertas_atencao: 1, alertas_urgentes: 2 })).toBe('EXPIRADO')
  })
})

describe('filtrarViaturas e contagens', () => {
  const lista = [
    resumo({ id: 'a', identificacao: '50-AA-50', modelo: 'Hilux', estado_operacional: 'LIVRE' }),
    resumo({ id: 'b', identificacao: '11-BB-22', marca: 'Volvo', modelo: 'Camião Ação', estado_operacional: 'EM_USO', condutor_nome: 'João Silva', obra_id: 'o1', obra_nome: 'Obra Norte' }),
    resumo({ id: 'c', identificacao: null, nome: 'Giratória CAT', marca: 'CAT', modelo: '320', tipo: 'maquina', unidade_contador: 'horas', estado_operacional: 'OFICINA' }),
  ]

  it('sem filtros devolve tudo', () => expect(filtrarViaturas(lista, {})).toHaveLength(3))
  it('filtra por estado', () => expect(filtrarViaturas(lista, { estado: 'EM_USO' }).map(v => v.id)).toEqual(['b']))
  it('filtra viaturas e máquinas', () => {
    expect(filtrarViaturas(lista, { classe: 'MAQUINA' }).map(v => v.id)).toEqual(['c'])
    expect(filtrarViaturas(lista, { classe: 'VIATURA' }).map(v => v.id)).toEqual(['a', 'b'])
  })
  it('filtra por obra', () => expect(filtrarViaturas(lista, { obraId: 'o1' }).map(v => v.id)).toEqual(['b']))
  it('pesquisa por matrícula, modelo, nome e condutor, sem acentos nem maiúsculas', () => {
    expect(filtrarViaturas(lista, { pesquisa: '50-aa' }).map(v => v.id)).toEqual(['a'])
    expect(filtrarViaturas(lista, { pesquisa: 'acao' }).map(v => v.id)).toEqual(['b'])
    expect(filtrarViaturas(lista, { pesquisa: 'giratoria' }).map(v => v.id)).toEqual(['c'])
    expect(filtrarViaturas(lista, { pesquisa: 'JOAO' }).map(v => v.id)).toEqual(['b'])
    expect(filtrarViaturas(lista, { pesquisa: 'zzz' })).toEqual([])
  })
  it('combina filtros', () => {
    expect(filtrarViaturas(lista, { estado: 'LIVRE', classe: 'MAQUINA' })).toEqual([])
  })
  it('conta por estado', () => expect(contarPorEstado(lista)).toEqual({ TODOS: 3, LIVRE: 1, EM_USO: 1, OFICINA: 1 }))
  it('só aceita estados válidos no parâmetro', () => {
    expect(estadoDeParametro('EM_USO')).toBe('EM_USO')
    expect(estadoDeParametro('x')).toBeNull()
    expect(estadoDeParametro(null)).toBeNull()
  })
})

describe('documentosEmRisco', () => {
  it('lista seguros e IPO expirados ou a vencer, do mais antigo para o mais recente', () => {
    const lista = [
      resumo({ id: 'a', data_fim_seguro: dataEm(10), data_proxima_ipo: dataEm(200) }),
      resumo({ id: 'b', data_proxima_ipo: dataEm(-3) }),
      resumo({ id: 'c', data_fim_seguro: dataEm(90) }),
    ]
    const r = documentosEmRisco(lista)
    expect(r.map(d => [d.viatura.id, d.documento, d.nivel])).toEqual([['b', 'IPO', 'EXPIRADO'], ['a', 'Seguro', 'A_VENCER']])
  })
})

describe('linha do tempo e leituras', () => {
  const ev = (tipo: LinhaTempoRow['tipo']): LinhaTempoRow => ({ quando: '2026-10-01T10:00:00Z', tipo, titulo: tipo, detalhe: null, leitura: null, utilizador: null, ref_id: tipo })
  const todos = (['REGISTO', 'ENTREGA', 'DEVOLUCAO', 'MANUTENCAO', 'EDICAO', 'CHECKLIST', 'ABASTECIMENTO'] as const).map(ev)

  it('filtra por grupo de tipos', () => {
    expect(filtrarLinhaTempo(todos, 'TODOS')).toHaveLength(7)
    expect(filtrarLinhaTempo(todos, 'ENTREGAS').map(e => e.tipo)).toEqual(['ENTREGA', 'DEVOLUCAO'])
    expect(filtrarLinhaTempo(todos, 'MANUTENCAO').map(e => e.tipo)).toEqual(['MANUTENCAO', 'EDICAO'])
    expect(filtrarLinhaTempo(todos, 'CHECKLISTS').map(e => e.tipo)).toEqual(['CHECKLIST'])
    expect(filtrarLinhaTempo(todos, 'ABASTECIMENTOS').map(e => e.tipo)).toEqual(['ABASTECIMENTO'])
  })
  it('calcula o percorrido e formata a unidade', () => {
    expect(percorridoDesdeRegisto(12500, 10000)).toBe(2500)
    expect(percorridoDesdeRegisto(null, 10000)).toBeNull()
    expect(textoLeitura(1200, 'horas')).toMatch(/h$/)
    expect(textoLeitura(1200, 'km')).toMatch(/km$/)
  })
})

describe('caminhoFotoDocumento', () => {
  it('segue o padrão aceite pela política do bucket frota-docs', () => {
    const id = '0b1c2d3e-0000-4000-8000-000000000001'
    expect(caminhoFotoDocumento(id, 'seguro', 'image/png', 123).caminho).toBe(`viaturas/${id}/seguro_123.png`)
    expect(caminhoFotoDocumento(id, 'ipo', 'image/xyz', 5)).toEqual({ caminho: `viaturas/${id}/ipo_5.jpg`, contentType: 'image/jpeg' })
  })
})
