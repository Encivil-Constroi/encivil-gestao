import type { SubtipoEntrada, SubtipoSaida, SubtipoMovimento } from '@/app/lib/armazemDb'
import type { MovementType } from '@/app/types'
import type { ArtigoArmazem, EmprestimoAtivo, GarantiaFerramenta, MaterialObra } from './services/armazemService'

export type OpcaoSubtipo<S extends SubtipoMovimento> = { valor: S; rotulo: string; descricao: string }

export const SUBTIPOS_ENTRADA: OpcaoSubtipo<SubtipoEntrada | 'INVENTARIO'>[] = [
  { valor: 'COMPRA', rotulo: 'Compra a fornecedor', descricao: 'Material comprado, com fornecedor e fatura' },
  { valor: 'DEVOLUCAO_OBRA', rotulo: 'Devolução de obra', descricao: 'Material que voltou de uma obra' },
  { valor: 'PROPRIO_ENCIVIL', rotulo: 'Stock próprio ENCIVIL', descricao: 'Material da empresa, sem compra' },
  { valor: 'ACERTO', rotulo: 'Acerto', descricao: 'Correção a mais encontrada no armazém' },
  { valor: 'INVENTARIO', rotulo: 'Contagem de inventário', descricao: 'Define o stock pelo que foi contado' },
]

export const SUBTIPOS_SAIDA: OpcaoSubtipo<SubtipoSaida>[] = [
  { valor: 'OBRA', rotulo: 'Para obra', descricao: 'Material enviado para uma obra em execução' },
  { valor: 'VENDA', rotulo: 'Venda comercial', descricao: 'Vendido a um cliente' },
  { valor: 'QUEBRA', rotulo: 'Quebra / perda', descricao: 'Partido, estragado ou perdido' },
]

const ROTULO: Record<SubtipoMovimento, string> = {
  COMPRA: 'Compra', DEVOLUCAO_OBRA: 'Devolução de obra', PROPRIO_ENCIVIL: 'Stock próprio', ACERTO: 'Acerto',
  INVENTARIO: 'Inventário', OBRA: 'Saída para obra', VENDA: 'Venda', QUEBRA: 'Quebra / perda',
}

export function rotuloMovimento(tipo: MovementType, subtipo: SubtipoMovimento | null): string {
  if (subtipo) return ROTULO[subtipo]
  return tipo === 'entrada' ? 'Entrada' : tipo === 'saida' ? 'Saída' : 'Correção'
}

export function tipoDoSubtipo(s: SubtipoMovimento): MovementType {
  if (s === 'INVENTARIO') return 'ajuste'
  return (['OBRA', 'VENDA', 'QUEBRA'] as SubtipoMovimento[]).includes(s) ? 'saida' : 'entrada'
}

export function ehSubtipoEntrada(v: string | null): v is SubtipoEntrada | 'INVENTARIO' {
  return SUBTIPOS_ENTRADA.some(o => o.valor === v)
}
export function ehSubtipoSaida(v: string | null): v is SubtipoSaida {
  return SUBTIPOS_SAIDA.some(o => o.valor === v)
}

// INVENTARIO: a quantidade é o stock contado (substitui), não uma diferença
export function stockDepois(subtipo: SubtipoMovimento, atual: number, quantidade: number): number {
  const t = tipoDoSubtipo(subtipo)
  if (t === 'ajuste') return quantidade
  return t === 'entrada' ? atual + quantidade : atual - quantidade
}

// ── Datas (YYYY-MM-DD em hora local) ─────────────────────────────────────────

function inicioDoDia(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }

export function diasAte(dataIso: string, hoje = new Date()): number {
  const [a, m, d] = dataIso.slice(0, 10).split('-').map(Number)
  return Math.round((new Date(a, m - 1, d).getTime() - inicioDoDia(hoje).getTime()) / 86_400_000)
}

export const DIAS_AVISO_GARANTIA = 30

export function estadoGarantia(garantiaAte: string, hoje = new Date()): 'expirada' | 'a-terminar' | 'ok' {
  const dias = diasAte(garantiaAte, hoje)
  if (dias < 0) return 'expirada'
  return dias <= DIAS_AVISO_GARANTIA ? 'a-terminar' : 'ok'
}

export function diasEmAtraso(prevista: string | null, hoje = new Date()): number {
  if (!prevista) return 0
  return Math.max(0, -diasAte(prevista, hoje))
}

// ── O que está em cada obra ──────────────────────────────────────────────────

export type ObraBase = { id: string; name: string; status: string; client?: string; location?: string }

export type ObraComArmazem = {
  obra: ObraBase
  materiais: MaterialObra[]
  valorMateriais: number
  ferramentas: EmprestimoAtivo[]
}

export function agruparPorObra(obras: ObraBase[], materiais: MaterialObra[], emprestimos: EmprestimoAtivo[]): ObraComArmazem[] {
  const porObra = new Map<string, ObraComArmazem>(obras.map(o => [o.id, { obra: o, materiais: [], valorMateriais: 0, ferramentas: [] }]))
  for (const m of materiais) {
    const g = porObra.get(m.obraId)
    if (!g || m.liquido <= 0) continue
    g.materiais.push(m)
    g.valorMateriais += m.valor
  }
  for (const e of emprestimos) {
    if (e.obraId) porObra.get(e.obraId)?.ferramentas.push(e)
  }
  const lista = [...porObra.values()]
  for (const g of lista) g.materiais.sort((a, b) => b.valor - a.valor || a.produtoNome.localeCompare(b.produtoNome))
  return lista.sort((a, b) =>
    Number(b.obra.status === 'ativa') - Number(a.obra.status === 'ativa')
    || b.valorMateriais - a.valorMateriais
    || a.obra.name.localeCompare(b.obra.name))
}

// ── Visão geral ──────────────────────────────────────────────────────────────

export type ResumoArmazem = {
  artigos: number
  valorStock: number
  stockBaixo: ArtigoArmazem[]       // baixo + sem stock, os sem stock primeiro
  semStock: number
  emprestadas: number
  emAtraso: EmprestimoAtivo[]
  garantiasATerminar: GarantiaFerramenta[]
  garantiasExpiradas: GarantiaFerramenta[]
}

export function resumirArmazem(
  artigos: ArtigoArmazem[], emprestimos: EmprestimoAtivo[], garantias: GarantiaFerramenta[], hoje = new Date(),
): ResumoArmazem {
  const baixo = artigos.filter(a => a.stockAtual <= a.stockMinimo || a.stockAtual <= 0)
    .sort((a, b) => a.stockAtual - b.stockAtual || a.nome.localeCompare(b.nome))
  return {
    artigos: artigos.length,
    valorStock: artigos.reduce((s, a) => s + Math.max(0, a.stockAtual) * a.custoUnitario, 0),
    stockBaixo: baixo,
    semStock: baixo.filter(a => a.stockAtual <= 0).length,
    emprestadas: emprestimos.length,
    emAtraso: emprestimos.filter(e => diasEmAtraso(e.previstaDevolucao, hoje) > 0)
      .sort((a, b) => diasEmAtraso(b.previstaDevolucao, hoje) - diasEmAtraso(a.previstaDevolucao, hoje)),
    garantiasATerminar: garantias.filter(g => estadoGarantia(g.garantiaAte, hoje) === 'a-terminar'),
    garantiasExpiradas: garantias.filter(g => estadoGarantia(g.garantiaAte, hoje) === 'expirada'),
  }
}

export type ObraTop = { obraId: string; obraNome: string; valor: number; artigos: number }

export function obrasComMaisMaterial(materiais: MaterialObra[], limite = 5): ObraTop[] {
  const m = new Map<string, ObraTop>()
  for (const x of materiais) {
    if (x.obraEstado !== 'ativa' || x.liquido <= 0) continue
    const o = m.get(x.obraId) ?? { obraId: x.obraId, obraNome: x.obraNome, valor: 0, artigos: 0 }
    o.valor += x.valor
    o.artigos += 1
    m.set(x.obraId, o)
  }
  return [...m.values()].sort((a, b) => b.valor - a.valor).slice(0, limite)
}
