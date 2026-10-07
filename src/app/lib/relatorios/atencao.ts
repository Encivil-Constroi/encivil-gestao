import type { ObraResumoRow, SubsPainelCeo } from '@/features/obras/db'
import type { ResumoViaturaRow } from '@/features/frota/db'

export type Gravidade = 'alta' | 'media' | 'baixa'
export type ItemAtencao = { id: string; gravidade: Gravidade; modulo: string; texto: string; to: string }

export type EntradaAtencao = {
  obras?: ObraResumoRow[]
  subs?: SubsPainelCeo
  frota?: ResumoViaturaRow[]
  artigosEmAlerta?: number
  ferramentasEmAtraso?: number
}

const PESO: Record<Gravidade, number> = { alta: 0, media: 1, baixa: 2 }
const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`

// Cada módulo que falhou a carregar simplesmente não entra: a Visão Geral nunca mente por omissão
// porque marca esses blocos como indisponíveis à parte.
export function construirAtencao(e: EntradaAtencao): ItemAtencao[] {
  const out: ItemAtencao[] = []

  for (const o of e.obras ?? []) {
    if (o.estado === 'concluida') continue
    const orc = o.orcamento != null ? Number(o.orcamento) : 0
    if (orc > 0 && Number(o.custo_total) > orc) {
      out.push({ id: `obra-orc-${o.obra_id}`, gravidade: 'alta', modulo: 'Obras', texto: `${o.nome}: custo acima do orçamento`, to: `/obras/${o.obra_id}` })
    }
    if (o.saude === 'critico') {
      out.push({ id: `obra-saude-${o.obra_id}`, gravidade: 'alta', modulo: 'Obras', texto: `${o.nome}: ${o.motivos?.[0] ?? 'estado crítico'}`, to: `/obras/${o.obra_id}` })
    } else if (o.saude === 'atencao') {
      out.push({ id: `obra-saude-${o.obra_id}`, gravidade: 'media', modulo: 'Obras', texto: `${o.nome}: ${o.motivos?.[0] ?? 'requer atenção'}`, to: `/obras/${o.obra_id}` })
    }
  }

  (e.subs?.alertas ?? []).forEach((a, i) => {
    out.push({
      id: `sub-${a.tipo}-${a.sub_id ?? a.obra_id ?? i}`,
      gravidade: a.gravidade === 'alta' ? 'alta' : a.gravidade === 'media' ? 'media' : 'baixa',
      modulo: 'Subempreitadas', texto: a.texto,
      to: a.sub_id ? `/obras/subempreitada/${a.sub_id}` : '/obras/subempreitadas',
    })
  })

  for (const v of e.frota ?? []) {
    if (v.alertas_urgentes > 0) {
      out.push({ id: `frota-urg-${v.id}`, gravidade: 'alta', modulo: 'Frota', texto: `${v.nome}: ${plural(v.alertas_urgentes, 'alerta urgente', 'alertas urgentes')}`, to: `/frota/viatura/${v.id}` })
    } else if (v.alertas_atencao > 0) {
      out.push({ id: `frota-at-${v.id}`, gravidade: 'media', modulo: 'Frota', texto: `${v.nome}: ${plural(v.alertas_atencao, 'alerta de atenção', 'alertas de atenção')}`, to: `/frota/viatura/${v.id}` })
    }
  }

  if ((e.artigosEmAlerta ?? 0) > 0) {
    out.push({ id: 'armazem-alerta', gravidade: 'media', modulo: 'Armazém', texto: `${plural(e.artigosEmAlerta!, 'artigo', 'artigos')} com stock baixo ou esgotado`, to: '/armazem' })
  }
  if ((e.ferramentasEmAtraso ?? 0) > 0) {
    out.push({ id: 'ferramentas-atraso', gravidade: 'media', modulo: 'Ferramentas', texto: `${plural(e.ferramentasEmAtraso!, 'ferramenta', 'ferramentas')} por devolver (prazo passado)`, to: '/armazem/ferramentas' })
  }

  return out.sort((a, b) => PESO[a.gravidade] - PESO[b.gravidade])
}
