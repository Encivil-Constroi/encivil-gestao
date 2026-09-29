import { describe, it, expect } from 'vitest'
import {
  itensChecklistDaViatura, agruparPorCategoria, estadoGeral, prazosDaViatura,
  textoIntervalo, numeroOuNulo, hojeIso, ordenar,
} from '@/features/frota/lib/frota'
import { chaveDeRotulo, caminhoFotoChecklist } from '@/features/frota/services/frotaService'
import { validarItem, type FormItem } from '@/features/frota/lib/validarItem'
import type { ItemCatalogoRow, VeiculoItemRow, Categoria, Natureza } from '@/features/frota/db'

let seq = 0
function item(o: Partial<ItemCatalogoRow> & { categoria: Categoria; natureza: Natureza }): ItemCatalogoRow {
  seq++
  return {
    id: `i${seq}`, chave: `k${seq}`, rotulo: `Item ${seq}`, intervalo_km_padrao: null, intervalo_meses_padrao: null,
    limiar_atencao_km: 2000, limiar_urgente_km: 500, limiar_atencao_dias: 30, limiar_urgente_dias: 7,
    ordem: seq, ativo: true, criado_por: null, criado_em: '', atualizado_em: '', ...o,
  }
}
function cfg(itemId: string, o: Partial<VeiculoItemRow> = {}): VeiculoItemRow {
  return {
    id: `f-${itemId}`, veiculo_id: 'v', item_id: itemId, ativo: true, intervalo_km: null, intervalo_meses: null,
    proxima_km: null, proxima_data: null, ultima_km: null, ultima_data: null, atualizado_por: null, atualizado_em: '', ...o,
  }
}

const luzes   = item({ categoria: 'INSPECAO_RAPIDA', natureza: 'CHECKLIST', rotulo: 'Luzes' })
const adblue  = item({ categoria: 'INSPECAO_RAPIDA', natureza: 'CHECKLIST', rotulo: 'AdBlue' })
const velho   = item({ categoria: 'INSPECAO_RAPIDA', natureza: 'CHECKLIST', rotulo: 'Desativado', ativo: false })
const oleo    = item({ categoria: 'REVISAO_PERIODICA', natureza: 'MANUTENCAO', rotulo: 'Óleo', intervalo_km_padrao: 15000, intervalo_meses_padrao: 12 })
const seguro  = item({ categoria: 'OBRIGACAO_LEGAL', natureza: 'MANUTENCAO', rotulo: 'Seguro', intervalo_meses_padrao: 12 })
const ipo     = item({ categoria: 'OBRIGACAO_LEGAL', natureza: 'MANUTENCAO', rotulo: 'IPO', intervalo_meses_padrao: 12 })
const catalogo = [ipo, luzes, oleo, velho, seguro, adblue]

describe('checklist da viatura', () => {
  it('por omissão todos os itens de checklist ativos; o mecânico exclui os que não se aplicam', () => {
    expect(itensChecklistDaViatura(catalogo, []).map(i => i.rotulo)).toEqual(['Luzes', 'AdBlue'])
    expect(itensChecklistDaViatura(catalogo, [cfg(adblue.id, { ativo: false })]).map(i => i.rotulo)).toEqual(['Luzes'])
  })

  it('itens de manutenção e itens desativados no catálogo não entram no checklist', () => {
    const r = itensChecklistDaViatura(catalogo, [cfg(oleo.id)]).map(i => i.id)
    expect(r).not.toContain(oleo.id)
    expect(r).not.toContain(velho.id)
  })

  it('estado geral é o pior item (igual à regra do Postgres)', () => {
    expect(estadoGeral(['OK', 'OK'])).toBe('OK')
    expect(estadoGeral(['OK', 'ATENCAO'])).toBe('ATENCAO')
    expect(estadoGeral(['ATENCAO', 'MAU', 'OK'])).toBe('MAU')
  })

  it('agrupa pela ordem das categorias e omite categorias vazias', () => {
    const g = agruparPorCategoria(ordenar(catalogo))
    expect(g.map(x => x.categoria)).toEqual(['INSPECAO_RAPIDA', 'REVISAO_PERIODICA', 'OBRIGACAO_LEGAL'])
  })
})

describe('prazos da viatura', () => {
  const hoje = new Date(2026, 8, 29)

  it('só itens de manutenção ligados e ativos; severidade vem dos alertas', () => {
    const config = [
      cfg(oleo.id, { proxima_km: 24700 }),
      cfg(seguro.id, { proxima_data: '2026-10-04' }),
      cfg(ipo.id, { ativo: false, proxima_data: '2026-10-01' }),
      cfg(luzes.id),
    ]
    const p = prazosDaViatura(catalogo, config, new Map([[`f-${seguro.id}`, 'URGENTE']]), 20000, hoje)
    expect(p.map(x => x.item.rotulo)).toEqual(['Seguro', 'Óleo'])  // urgente primeiro
    expect(p[0].severidade).toBe('URGENTE')
    expect(p[0].textoData).toBe('04/10/2026 — vence em 5 dias')
    expect(p[1].textoKm).toBe(`${(24700).toLocaleString('pt-PT')} km — faltam ${(4700).toLocaleString('pt-PT')} km`)
  })

  it('sem km conhecido mostra só o prazo', () => {
    const [p] = prazosDaViatura(catalogo, [cfg(oleo.id, { proxima_km: 24700 })], new Map(), null, hoje)
    expect(p.textoKm).toBe(`${(24700).toLocaleString('pt-PT')} km`)
  })

  it('intervalo da viatura vence o do catálogo', () => {
    const [p] = prazosDaViatura(catalogo, [cfg(oleo.id, { intervalo_km: 8000 })], new Map(), null, hoje)
    expect(p.intervaloKm).toBe(8000)
    expect(p.intervaloMeses).toBe(12)
  })

  it('mesma severidade: ordem das categorias do catálogo', () => {
    const p = prazosDaViatura(catalogo, [cfg(ipo.id), cfg(oleo.id), cfg(seguro.id)], new Map(), null, hoje)
    // revisão periódica antes de obrigações legais; dentro da categoria, pela ordem (seguro 5, IPO 6)
    expect(p.map(x => x.item.rotulo)).toEqual(['Óleo', 'Seguro', 'IPO'])
  })
})

describe('utilitários', () => {
  it.each([
    [15000, 12, `a cada ${(15000).toLocaleString('pt-PT')} km ou 12 meses`],
    [null, 1, 'a cada 1 mês'],
    [null, null, 'sem intervalo (data definida à mão)'],
  ])('intervalo %s km / %s meses', (km, m, t) => expect(textoIntervalo(km, m)).toBe(t))

  it('número de formulário: vazio, vírgula decimal, inválido', () => {
    expect(numeroOuNulo('')).toBeNull()
    expect(numeroOuNulo(' 85,5 ')).toBe(85.5)
    expect(numeroOuNulo('abc')).toBeNaN()
  })

  it('data de hoje local em AAAA-MM-DD', () => expect(hojeIso(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05'))

  it('chave estável a partir do rótulo', () => {
    expect(chaveDeRotulo('Óleo da caixa (substituir)')).toBe('oleo_da_caixa_substituir')
    expect(chaveDeRotulo('***')).toBe('item')
  })

  it('caminho da foto no formato aceite pela política do storage', () => {
    const v = '11111111-1111-4111-8111-111111111111'
    const id = '22222222-2222-4222-8222-222222222222'
    expect(caminhoFotoChecklist(v, 'image/jpeg', id)).toBe(`${v}/${id}.jpg`)
    expect(caminhoFotoChecklist(v, 'image/gif', id)).toBe(`${v}/${id}.jpg`)
    expect(caminhoFotoChecklist(v, 'image/webp')).toMatch(new RegExp(`^${v}/[0-9a-f-]{36}\\.webp$`))
  })
})


describe('validarItem (catálogo)', () => {
  const base: FormItem = {
    rotulo: 'Óleo da grua', categoria: 'REVISAO_PERIODICA', natureza: 'MANUTENCAO', intervaloKm: '5000', intervaloMeses: '12',
    limiarAtencaoKm: '2000', limiarUrgenteKm: '500', limiarAtencaoDias: '30', limiarUrgenteDias: '7', ativo: true,
  }

  it('item de manutenção válido', () => {
    expect(validarItem(base)).toMatchObject({ rotulo: 'Óleo da grua', intervaloKm: 5000, intervaloMeses: 12, limiarUrgenteKm: 500 })
  })

  it('item de checklist ignora prazos e limiares (a base de dados recusa prazos em checklist)', () => {
    const r = validarItem({ ...base, natureza: 'CHECKLIST', limiarAtencaoKm: 'lixo' })
    expect(r).toMatchObject({ natureza: 'CHECKLIST', intervaloKm: null, intervaloMeses: null })
  })

  it.each([
    ['nome curto', { rotulo: 'x' }],
    ['intervalo km zero', { intervaloKm: '0' }],
    ['intervalo km texto', { intervaloKm: 'abc' }],
    ['meses decimais', { intervaloMeses: '1,5' }],
    ['aviso vazio', { limiarAtencaoDias: '' }],
    ['urgente maior que atenção (km)', { limiarUrgenteKm: '3000' }],
    ['urgente maior que atenção (dias)', { limiarUrgenteDias: '40' }],
    ['dias decimais', { limiarAtencaoDias: '10,5' }],
    ['aviso negativo', { limiarUrgenteKm: '-1' }],
  ])('recusa %s', (_n, mudanca) => {
    expect(typeof validarItem({ ...base, ...mudanca })).toBe('string')
  })

  it('intervalos vazios são permitidos (prazo definido à mão, ex.: cartão de transportador)', () => {
    expect(validarItem({ ...base, intervaloKm: '', intervaloMeses: '' })).toMatchObject({ intervaloKm: null, intervaloMeses: null })
  })
})
