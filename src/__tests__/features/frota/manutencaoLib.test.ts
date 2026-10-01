import { describe, it, expect } from 'vitest'
import {
  TIPO_OUTRO, filtrarHistorico, agruparPorDia, totalCusto, diferencas, periodoMes, periodoAno, linhasExportacao, formatarLeitura,
} from '@/features/frota/lib/manutencao'
import type { HistoricoManutencaoRow } from '@/features/frota/db'

function linha(o: Partial<HistoricoManutencaoRow>): HistoricoManutencaoRow {
  return {
    id: 'm', veiculo_id: 'v1', veiculo_nome: 'Carrinha', identificacao: '00-AA-00', unidade_contador: 'km',
    item_id: null, item_rotulo: null, descricao: null, data: '2026-09-10', km_na_altura: null, custo: null,
    oficina: null, observacoes: null, condutor_nome: null, registado_por: 'Carlos', registado_em: '2026-09-10T10:00:00Z',
    editado_por: null, editado_em: null, ...o,
  }
}

const a = linha({ id: 'a', item_id: 'i-oleo', item_rotulo: 'Óleo', custo: 80, oficina: 'Polo 2' })
const b = linha({ id: 'b', veiculo_id: 'v2', identificacao: '11-BB-11', veiculo_nome: 'Grua', descricao: 'Lâmpada do farol', custo: 12.5, data: '2026-09-12' })
const c = linha({ id: 'c', item_id: 'i-oleo', item_rotulo: 'Óleo', custo: null, data: '2026-09-10', observacoes: 'Filtro Mann' })

describe('filtrarHistorico', () => {
  it('por tipo do catálogo e por "outro"', () => {
    expect(filtrarHistorico([a, b, c], { tipo: 'i-oleo', texto: '' }).map(l => l.id)).toEqual(['a', 'c'])
    expect(filtrarHistorico([a, b, c], { tipo: TIPO_OUTRO, texto: '' }).map(l => l.id)).toEqual(['b'])
  })
  it('pesquisa livre ignora acentos e maiúsculas, e procura em oficina/observações/matrícula', () => {
    expect(filtrarHistorico([a, b, c], { tipo: '', texto: 'POLO' }).map(l => l.id)).toEqual(['a'])
    expect(filtrarHistorico([a, b, c], { tipo: '', texto: 'lampada' }).map(l => l.id)).toEqual(['b'])
    expect(filtrarHistorico([a, b, c], { tipo: '', texto: 'mann' }).map(l => l.id)).toEqual(['c'])
    expect(filtrarHistorico([a, b, c], { tipo: '', texto: '11-bb' }).map(l => l.id)).toEqual(['b'])
  })
})

describe('agruparPorDia e totais', () => {
  it('dias do mais recente para o mais antigo, com o custo do dia', () => {
    const g = agruparPorDia([a, b, c])
    expect(g.map(d => d.data)).toEqual(['2026-09-12', '2026-09-10'])
    expect(g[1].linhas.map(l => l.id)).toEqual(['a', 'c'])
    expect(g[1].custo).toBe(80)
    expect(totalCusto([a, b, c])).toBe(92.5)
  })
})

describe('períodos', () => {
  it('mês e ano até hoje', () => {
    const hoje = new Date(2026, 8, 15)
    expect(periodoMes(hoje)).toEqual({ desde: '2026-09-01', ate: '2026-09-15' })
    expect(periodoAno(hoje)).toEqual({ desde: '2026-01-01', ate: '2026-09-15' })
  })
})

describe('diferencas', () => {
  it('só os campos que mudaram, com o rótulo do item', () => {
    const d = diferencas(
      { item_id: 'i1', descricao: null, data: '2026-09-10', km_na_altura: 100, custo: 50, oficina: 'X', observacoes: null },
      { item_id: 'i2', descricao: null, data: '2026-09-10', km_na_altura: 110, custo: 50, oficina: 'X', observacoes: 'ok' },
      id => (id === 'i1' ? 'Óleo' : 'Travões'),
    )
    expect(d).toEqual([
      { campo: 'Tipo', antes: 'Óleo', depois: 'Travões' },
      { campo: 'Km/Horas', antes: '100', depois: '110' },
      { campo: 'Observações', antes: '—', depois: 'ok' },
    ])
  })
})

describe('exportação e leituras', () => {
  it('uma linha por intervenção, com quem registou e quem corrigiu', () => {
    const [x] = linhasExportacao([linha({ item_rotulo: 'Óleo', custo: 80, editado_por: 'Ana', editado_em: '2026-09-11T09:00:00Z' })])
    expect(x).toMatchObject({ 'Data': '10/09/2026', 'Tipo': 'Óleo', 'Custo (€)': 80, 'Registado por': 'Carlos', 'Editado por': 'Ana' })
  })
  it('horas nas máquinas', () => {
    expect(formatarLeitura(1500, 'horas')).toMatch(/h$/)
    expect(formatarLeitura(null, 'km')).toBe('—')
  })
})
