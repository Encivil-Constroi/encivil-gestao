import type { AbastecimentoAnaliseRow, PedidoRow, TipoFonte } from '../db'

// ── Períodos ─────────────────────────────────────────────────────────────────
export type Preset = 'semana' | 'mes' | '30d' | '90d' | 'ano'
export type Granularidade = 'dia' | 'semana' | 'mes'
export type Periodo = { inicio: string; fim: string }   // YYYY-MM-DD, inclusivo

export const ROTULO_PRESET: Record<Preset, string> = {
  semana: 'Esta semana', mes: 'Este mês', '30d': 'Últimos 30 dias', '90d': 'Últimos 90 dias', ano: 'Este ano',
}

const DIA_MS = 86_400_000

// Datas "de calendário" em UTC para não haver saltos de hora de verão
export function isoDia(d: Date): string { return d.toISOString().slice(0, 10) }
function dia(iso: string): Date { return new Date(`${iso}T00:00:00Z`) }
function somarDias(iso: string, n: number): string { return isoDia(new Date(dia(iso).getTime() + n * DIA_MS)) }
export function diasEntre(a: string, b: string): number { return Math.round((dia(b).getTime() - dia(a).getTime()) / DIA_MS) }

export function periodoDoPreset(p: Preset, hoje: string): Periodo {
  const d = dia(hoje)
  switch (p) {
    case 'semana': {
      const desdeSegunda = (d.getUTCDay() + 6) % 7
      return { inicio: somarDias(hoje, -desdeSegunda), fim: hoje }
    }
    case 'mes': return { inicio: `${hoje.slice(0, 8)}01`, fim: hoje }
    case '30d': return { inicio: somarDias(hoje, -29), fim: hoje }
    case '90d': return { inicio: somarDias(hoje, -89), fim: hoje }
    case 'ano': return { inicio: `${hoje.slice(0, 4)}-01-01`, fim: hoje }
  }
}

// O período imediatamente antes, com o mesmo número de dias (para comparar)
export function periodoAnterior(p: Periodo): Periodo {
  const n = diasEntre(p.inicio, p.fim) + 1
  return { inicio: somarDias(p.inicio, -n), fim: somarDias(p.inicio, -1) }
}

export function granularidadeAuto(p: Periodo): Granularidade {
  const n = diasEntre(p.inicio, p.fim) + 1
  if (n <= 14) return 'dia'
  if (n <= 92) return 'semana'
  return 'mes'
}

function inicioDoBalde(iso: string, g: Granularidade): string {
  if (g === 'dia') return iso
  if (g === 'mes') return `${iso.slice(0, 8)}01`
  const desdeSegunda = (dia(iso).getUTCDay() + 6) % 7
  return somarDias(iso, -desdeSegunda)
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function rotuloBalde(chave: string, g: Granularidade): string {
  const [a, m, d] = chave.split('-').map(Number)
  if (g === 'mes') return `${MESES[m - 1]} ${String(a).slice(2)}`
  return `${d} ${MESES[m - 1]}`
}

// ── Agregações ───────────────────────────────────────────────────────────────
export type Totais = { litros: number; custo: number; n: number; precoMedio: number | null }

export function totais(rows: AbastecimentoAnaliseRow[]): Totais {
  let litros = 0, custo = 0
  for (const r of rows) { litros += Number(r.litros); custo += Number(r.custo_total) }
  return { litros, custo, n: rows.length, precoMedio: litros > 0 && custo > 0 ? custo / litros : null }
}

export type Balde = { chave: string; rotulo: string; litros: number; custo: number; n: number }

// Todos os baldes do período, incluindo os vazios (a linha do tempo não salta)
export function porPeriodo(rows: AbastecimentoAnaliseRow[], p: Periodo, g: Granularidade): Balde[] {
  const baldes = new Map<string, Balde>()
  let cursor = inicioDoBalde(p.inicio, g)
  for (let i = 0; cursor <= p.fim && i < 800; i++) {
    baldes.set(cursor, { chave: cursor, rotulo: rotuloBalde(cursor, g), litros: 0, custo: 0, n: 0 })
    cursor = g === 'dia' ? somarDias(cursor, 1)
      : g === 'semana' ? somarDias(cursor, 7)
      : isoDia(new Date(Date.UTC(dia(cursor).getUTCFullYear(), dia(cursor).getUTCMonth() + 1, 1)))
  }
  for (const r of rows) {
    const b = baldes.get(inicioDoBalde(r.data, g))
    if (!b) continue
    b.litros += Number(r.litros); b.custo += Number(r.custo_total); b.n++
  }
  return [...baldes.values()]
}

// L/100 km: litros depois da 1.ª leitura ÷ km percorridos entre a 1.ª e a última.
// Só viaturas em km e com pelo menos duas leituras (máquinas em horas ficam de fora).
export function consumoL100(rows: AbastecimentoAnaliseRow[]): number | null {
  const comKm = rows
    .filter(r => r.contador != null && (r.comb_veiculos?.unidade_contador ?? 'km') === 'km')
    .sort((a, b) => Number(a.contador) - Number(b.contador))
  if (comKm.length < 2) return null
  const km = Number(comKm[comKm.length - 1].contador) - Number(comKm[0].contador)
  if (km <= 0) return null
  const litros = comKm.slice(1).reduce((s, r) => s + Number(r.litros), 0)
  const l100 = (litros / km) * 100
  // Contadores errados dão valores absurdos: melhor não mostrar do que enganar
  return l100 > 0 && l100 < 200 ? l100 : null
}

export type LinhaViatura = {
  id: string; nome: string; codigo: string; litros: number; custo: number; n: number; km: number | null; l100: number | null
}

export function porViatura(rows: AbastecimentoAnaliseRow[]): LinhaViatura[] {
  const grupos = new Map<string, AbastecimentoAnaliseRow[]>()
  for (const r of rows) grupos.set(r.veiculo_id, [...(grupos.get(r.veiculo_id) ?? []), r])
  return [...grupos.entries()].map(([id, lista]) => {
    const t = totais(lista)
    const kms = lista.filter(r => r.contador != null).map(r => Number(r.contador))
    const km = kms.length >= 2 ? Math.max(...kms) - Math.min(...kms) : null
    return {
      id, nome: lista[0].comb_veiculos?.nome ?? 'Viatura', codigo: lista[0].comb_veiculos?.codigo ?? '',
      litros: t.litros, custo: t.custo, n: t.n, km, l100: consumoL100(lista),
    }
  }).sort((a, b) => b.custo - a.custo || b.litros - a.litros)
}

export type LinhaMotorista = { chave: string; nome: string; litros: number; custo: number; n: number; viaturas: number }

// O mesmo motorista pode ter vários nomes escritos à mão: agrupa pela conta/colaborador quando há
export function porMotorista(rows: AbastecimentoAnaliseRow[]): LinhaMotorista[] {
  const grupos = new Map<string, { nome: string; lista: AbastecimentoAnaliseRow[] }>()
  for (const r of rows) {
    const nome = (r.responsavel ?? '').trim() || 'Sem nome'
    const chave = r.colaborador_id ?? r.solicitante_id ?? `nome:${nome.toLocaleLowerCase('pt-PT')}`
    const g = grupos.get(chave) ?? { nome, lista: [] }
    g.lista.push(r)
    grupos.set(chave, g)
  }
  return [...grupos.entries()].map(([chave, g]) => {
    const t = totais(g.lista)
    return { chave, nome: g.nome, litros: t.litros, custo: t.custo, n: t.n, viaturas: new Set(g.lista.map(r => r.veiculo_id)).size }
  }).sort((a, b) => b.custo - a.custo || b.litros - a.litros)
}

export type Fonte = TipoFonte | 'MANUAL'
export const ROTULO_FONTE_ANALISE: Record<Fonte, string> = {
  POLO2: 'Bomba Polo 2', CARRINHA: 'Carrinha', POSTO_RUA: 'Posto de rua', MANUAL: 'Registo manual',
}

export function porFonte(rows: AbastecimentoAnaliseRow[]): { fonte: Fonte; litros: number; custo: number; n: number }[] {
  const ordem: Fonte[] = ['POLO2', 'CARRINHA', 'POSTO_RUA', 'MANUAL']
  const acc = new Map<Fonte, { litros: number; custo: number; n: number }>(ordem.map(f => [f, { litros: 0, custo: 0, n: 0 }]))
  for (const r of rows) {
    const a = acc.get(r.tipo_fonte ?? 'MANUAL')!
    a.litros += Number(r.litros); a.custo += Number(r.custo_total); a.n++
  }
  return ordem.map(f => ({ fonte: f, ...acc.get(f)! })).filter(f => f.n > 0)
}

export type MetricasAprovacao = {
  decididos: number; mediaMin: number | null; medianaMin: number | null
  recusados: number; mais1h: number; aguardam: number
}

export function metricasAprovacao(pedidos: PedidoRow[]): MetricasAprovacao {
  const tempos = pedidos
    .filter(p => p.decisao_em)
    .map(p => (new Date(p.decisao_em!).getTime() - new Date(p.criado_em).getTime()) / 60_000)
    .filter(m => m >= 0)
    .sort((a, b) => a - b)
  const media = tempos.length ? tempos.reduce((s, m) => s + m, 0) / tempos.length : null
  const mediana = tempos.length
    ? (tempos.length % 2 ? tempos[(tempos.length - 1) / 2] : (tempos[tempos.length / 2 - 1] + tempos[tempos.length / 2]) / 2)
    : null
  return {
    decididos: tempos.length, mediaMin: media, medianaMin: mediana,
    recusados: pedidos.filter(p => p.estado === 'REJEITADO').length,
    mais1h: tempos.filter(m => m >= 60).length,
    aguardam: pedidos.filter(p => p.estado === 'AGUARDA_AUTORIZACAO').length,
  }
}

// ── O analista: regras que transformam os números em conclusões ─────────────
export type NivelInsight = 'critico' | 'atencao' | 'bom' | 'info'
export type Insight = { id: string; nivel: NivelInsight; titulo: string; detalhe: string }

const euros = (n: number) => n.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
const num = (n: number, c = 1) => n.toLocaleString('pt-PT', { maximumFractionDigits: c })
const pct = (n: number) => `${n > 0 ? '+' : ''}${Math.round(n * 100)}%`

function mediana(v: number[]): number {
  const s = [...v].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

export function analisar(rows: AbastecimentoAnaliseRow[], anteriores: AbastecimentoAnaliseRow[], pedidos: PedidoRow[]): Insight[] {
  const out: Insight[] = []
  const t = totais(rows)
  const ta = totais(anteriores)

  if (rows.length === 0) {
    return [{ id: 'vazio', nivel: 'info', titulo: 'Sem abastecimentos neste período', detalhe: 'Escolha um período maior para ver a análise.' }]
  }

  // 1. Tendência do custo
  if (ta.custo > 0) {
    const v = (t.custo - ta.custo) / ta.custo
    if (v >= 0.15) out.push({ id: 'custo-sobe', nivel: v >= 0.4 ? 'critico' : 'atencao',
      titulo: `Custo ${pct(v)} face ao período anterior`,
      detalhe: `${euros(t.custo)} agora contra ${euros(ta.custo)} antes (${num(t.litros, 0)} L vs ${num(ta.litros, 0)} L).` })
    else if (v <= -0.15) out.push({ id: 'custo-desce', nivel: 'bom',
      titulo: `Custo ${pct(v)} face ao período anterior`,
      detalhe: `Poupança de ${euros(ta.custo - t.custo)}.` })
  }

  // 2. Consumo fora do padrão da frota
  const viaturas = porViatura(rows)
  const comConsumo = viaturas.filter(v => v.l100 != null)
  if (comConsumo.length >= 3) {
    const med = mediana(comConsumo.map(v => v.l100!))
    for (const v of comConsumo) {
      if (v.l100! > med * 1.3) out.push({ id: `consumo-${v.id}`, nivel: v.l100! > med * 1.6 ? 'critico' : 'atencao',
        titulo: `${v.nome} gasta ${num(v.l100!)} L/100 km`,
        detalhe: `${Math.round((v.l100! / med - 1) * 100)}% acima da mediana da frota (${num(med)} L/100 km). Verificar condução, avarias ou fugas.` })
    }
  }

  // 3. Mesma viatura abastecida mais de uma vez no mesmo dia
  const porDia = new Map<string, AbastecimentoAnaliseRow[]>()
  for (const r of rows) {
    const k = `${r.veiculo_id}|${r.data}`
    porDia.set(k, [...(porDia.get(k) ?? []), r])
  }
  const repetidos = [...porDia.values()].filter(l => l.length > 1)
  if (repetidos.length) {
    const ex = repetidos[0]
    out.push({ id: 'repetidos', nivel: 'atencao',
      titulo: repetidos.length === 1 ? '1 viatura abasteceu 2 vezes no mesmo dia' : `${repetidos.length} casos de viatura abastecida mais de uma vez no mesmo dia`,
      detalhe: `Ex.: ${ex[0].comb_veiculos?.nome ?? 'viatura'} a ${ex[0].data.split('-').reverse().join('/')} (${ex.map(r => `${num(Number(r.litros))} L`).join(' + ')}). Confirmar se é legítimo.` })
  }

  // 4. Km suspeitos nos pedidos
  const suspeitos = pedidos.filter(p => p.km_suspeito)
  if (suspeitos.length) out.push({ id: 'km', nivel: 'atencao',
    titulo: `${suspeitos.length} pedido${suspeitos.length > 1 ? 's' : ''} com km fora do normal`,
    detalhe: `Km abaixo do último registo ou salto de mais de 3000 km — ${[...new Set(suspeitos.map(p => p.veiculo_nome))].slice(0, 3).join(', ')}.` })

  // 5. Rapidez da aprovação
  const ap = metricasAprovacao(pedidos)
  if (ap.decididos >= 3 && ap.medianaMin != null) {
    if (ap.mais1h > 0) out.push({ id: 'aprovacao-lenta', nivel: ap.mais1h / ap.decididos > 0.25 ? 'atencao' : 'info',
      titulo: `${ap.mais1h} pedido${ap.mais1h > 1 ? 's' : ''} esperou mais de 1 hora pela decisão`,
      detalhe: `Tempo típico de resposta: ${num(ap.medianaMin, 0)} min. Motoristas parados custam horas de trabalho.` })
    else out.push({ id: 'aprovacao-rapida', nivel: 'bom',
      titulo: `Aprovação rápida: ${num(ap.medianaMin, 0)} min em média`,
      detalhe: `Nenhum dos ${ap.decididos} pedidos esperou mais de 1 hora.` })
  }

  // 6. Posto de rua mais caro do que o combustível da empresa
  const fontes = porFonte(rows)
  const posto = fontes.find(f => f.fonte === 'POSTO_RUA')
  const interno = fontes.filter(f => f.fonte === 'POLO2' || f.fonte === 'CARRINHA').reduce(
    (a, f) => ({ litros: a.litros + f.litros, custo: a.custo + f.custo }), { litros: 0, custo: 0 })
  if (posto && posto.litros > 0 && interno.litros > 0 && interno.custo > 0) {
    const pPosto = posto.custo / posto.litros
    const pInterno = interno.custo / interno.litros
    const extra = (pPosto - pInterno) * posto.litros
    if (pPosto > pInterno * 1.05 && extra >= 20) out.push({ id: 'posto', nivel: 'info',
      titulo: `Posto de rua custou ${euros(extra)} a mais`,
      detalhe: `${num(posto.litros, 0)} L a ${euros(pPosto)}/L contra ${euros(pInterno)}/L na bomba da empresa.` })
  }

  // 7. Concentração do gasto
  if (viaturas.length >= 3 && t.custo > 0 && viaturas[0].custo / t.custo >= 0.4) out.push({ id: 'concentracao', nivel: 'info',
    titulo: `${viaturas[0].nome} concentra ${Math.round(viaturas[0].custo / t.custo * 100)}% do gasto`,
    detalhe: `${euros(viaturas[0].custo)} de ${euros(t.custo)} no período.` })

  // 8. Recusas por motorista
  const recusas = new Map<string, number>()
  for (const p of pedidos.filter(x => x.estado === 'REJEITADO')) recusas.set(p.funcionario_nome, (recusas.get(p.funcionario_nome) ?? 0) + 1)
  for (const [nome, n] of recusas) {
    if (n >= 3) out.push({ id: `recusas-${nome}`, nivel: 'info', titulo: `${nome}: ${n} pedidos recusados`, detalhe: 'Pode valer a pena conversar sobre as regras de abastecimento.' })
  }

  if (!out.some(i => i.nivel === 'critico' || i.nivel === 'atencao')) {
    out.push({ id: 'tudo-ok', nivel: 'bom', titulo: 'Nada fora do normal', detalhe: 'Consumos, frequência e km dentro do esperado neste período.' })
  }
  const peso: Record<NivelInsight, number> = { critico: 0, atencao: 1, info: 2, bom: 3 }
  return out.sort((a, b) => peso[a.nivel] - peso[b.nivel])
}
