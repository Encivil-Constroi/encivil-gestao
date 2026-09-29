import { textoFaltamKm, textoFaltamDias, diasAte, formatarData } from '@/app/lib/prazoFrota'
import type { ItemCatalogoRow, VeiculoItemRow, Categoria, EstadoItem } from '../db'

export const CATEGORIAS: { valor: Categoria; rotulo: string; descricao: string }[] = [
  { valor: 'INSPECAO_RAPIDA',   rotulo: 'Inspeção rápida',    descricao: 'Semanal, ou antes de sair' },
  { valor: 'REVISAO_PERIODICA', rotulo: 'Revisão periódica',  descricao: 'Oficina, por km ou tempo' },
  { valor: 'LONGO_PRAZO',       rotulo: 'Longo prazo',        descricao: 'Correia de distribuição, FAP, AC…' },
  { valor: 'OBRIGACAO_LEGAL',   rotulo: 'Obrigações legais',  descricao: 'IPO, seguro, IUC, tacógrafo…' },
]

export const rotuloCategoria = (c: Categoria) => CATEGORIAS.find(x => x.valor === c)?.rotulo ?? c

export const ESTADOS_ITEM: { valor: EstadoItem; rotulo: string }[] = [
  { valor: 'OK', rotulo: 'OK' },
  { valor: 'ATENCAO', rotulo: 'Atenção' },
  { valor: 'MAU', rotulo: 'Mau' },
]

// Itens de checklist de uma viatura: por omissão todos os ativos do catálogo;
// o mecânico exclui os que não se aplicam (linha em frota_veiculo_itens com ativo = false)
export function itensChecklistDaViatura(catalogo: ItemCatalogoRow[], config: VeiculoItemRow[]): ItemCatalogoRow[] {
  const excluidos = new Set(config.filter(c => !c.ativo).map(c => c.item_id))
  return ordenar(catalogo.filter(i => i.ativo && i.natureza === 'CHECKLIST' && !excluidos.has(i.id)))
}

const posCategoria = (c: Categoria) => CATEGORIAS.findIndex(x => x.valor === c)

export function compararItens(a: ItemCatalogoRow, b: ItemCatalogoRow): number {
  return posCategoria(a.categoria) - posCategoria(b.categoria) || a.ordem - b.ordem || a.rotulo.localeCompare(b.rotulo, 'pt')
}

export function ordenar(itens: ItemCatalogoRow[]): ItemCatalogoRow[] {
  return [...itens].sort(compararItens)
}

export function agruparPorCategoria<T extends { categoria: Categoria }>(itens: T[]): { categoria: Categoria; itens: T[] }[] {
  return CATEGORIAS
    .map(c => ({ categoria: c.valor, itens: itens.filter(i => i.categoria === c.valor) }))
    .filter(g => g.itens.length > 0)
}

// Igual à regra do Postgres (registar_checklist): o pior item manda
export function estadoGeral(estados: EstadoItem[]): EstadoItem {
  if (estados.includes('MAU')) return 'MAU'
  if (estados.includes('ATENCAO')) return 'ATENCAO'
  return 'OK'
}

export type Severidade = 'URGENTE' | 'ATENCAO' | null

export type PrazoDaViatura = {
  config: VeiculoItemRow
  item: ItemCatalogoRow
  severidade: Severidade
  intervaloKm: number | null
  intervaloMeses: number | null
  textoKm: string | null
  textoData: string | null
}

// Prazos acompanhados numa viatura (itens de manutenção ligados e ativos).
// A severidade vem dos alertas do Postgres — a única fonte da verdade.
export function prazosDaViatura(
  catalogo: ItemCatalogoRow[],
  config: VeiculoItemRow[],
  severidades: Map<string, Severidade>,
  kmAtual: number | null,
  hoje: Date = new Date(),
): PrazoDaViatura[] {
  const porId = new Map(catalogo.map(i => [i.id, i]))
  const peso = (s: Severidade) => (s === 'URGENTE' ? 0 : s === 'ATENCAO' ? 1 : 2)
  return config
    .filter(c => c.ativo && porId.get(c.item_id)?.natureza === 'MANUTENCAO' && porId.get(c.item_id)?.ativo)
    .map(c => {
      const item = porId.get(c.item_id)!
      const textoKm = c.proxima_km == null ? null
        : `${Number(c.proxima_km).toLocaleString('pt-PT')} km` +
          (kmAtual == null ? '' : ` — ${textoFaltamKm(Number(c.proxima_km) - kmAtual)}`)
      const textoData = c.proxima_data == null ? null
        : `${formatarData(c.proxima_data)} — ${textoFaltamDias(diasAte(c.proxima_data, hoje))}`
      return {
        config: c, item, severidade: severidades.get(c.id) ?? null,
        intervaloKm: c.intervalo_km ?? item.intervalo_km_padrao,
        intervaloMeses: c.intervalo_meses ?? item.intervalo_meses_padrao,
        textoKm, textoData,
      }
    })
    .sort((a, b) => peso(a.severidade) - peso(b.severidade) || compararItens(a.item, b.item))
}

export function textoIntervalo(km: number | null, meses: number | null): string {
  const partes = []
  if (km) partes.push(`${km.toLocaleString('pt-PT')} km`)
  if (meses) partes.push(meses === 1 ? '1 mês' : `${meses} meses`)
  return partes.length ? `a cada ${partes.join(' ou ')}` : 'sem intervalo (data definida à mão)'
}

// Converte um campo de formulário: vazio → null; número inválido → NaN (o formulário recusa)
export function numeroOuNulo(v: string): number | null {
  const t = v.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

export function hojeIso(hoje: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${hoje.getFullYear()}-${p(hoje.getMonth() + 1)}-${p(hoje.getDate())}`
}
