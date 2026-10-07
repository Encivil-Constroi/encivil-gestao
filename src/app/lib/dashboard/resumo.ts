import type { ObraResumoRow } from '@/features/obras/db'

const acimaDoOrcamento = (o: ObraResumoRow) => o.orcamento != null && Number(o.orcamento) > 0 && Number(o.custo_total) > Number(o.orcamento)
const consumo = (o: ObraResumoRow) => (o.orcamento != null && Number(o.orcamento) > 0 ? Number(o.custo_total) / Number(o.orcamento) : 0)
const gravidadeObra = (o: ObraResumoRow) => (o.saude === 'critico' || acimaDoOrcamento(o) ? 0 : o.saude === 'atencao' ? 1 : 2)

// Concluídas não entram; mais graves primeiro, depois as que mais gastaram do orçamento.
export function obrasEmRisco(obras: ObraResumoRow[], limite = 5): ObraResumoRow[] {
  return obras
    .filter(o => o.estado !== 'concluida' && gravidadeObra(o) < 2)
    .sort((a, b) => gravidadeObra(a) - gravidadeObra(b) || consumo(b) - consumo(a))
    .slice(0, limite)
}

export const consumoOrcamentoPct = (o: ObraResumoRow): number | null =>
  o.orcamento != null && Number(o.orcamento) > 0 ? Math.round(consumo(o) * 100) : null

export type DecisoesFonte = {
  contratosPorValidar?: number
  autosPorValidar?: number
  pedidosCombustivel?: number
  faltasPorDecidir?: number
}

export type Decisao = { id: string; n: number; texto: string; to: string }

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`

// Fonte indisponível (undefined) não entra: o ecrã assinala o módulo em falha à parte.
export function construirDecisoes(f: DecisoesFonte): Decisao[] {
  const out: Decisao[] = []
  const add = (id: string, n: number | undefined, texto: (n: number) => string, to: string) => {
    if (n != null && n > 0) out.push({ id, n, texto: texto(n), to })
  }
  add('contratos', f.contratosPorValidar, n => `${plural(n, 'contrato', 'contratos')} de subempreitada por validar`, '/subempreiteiros')
  add('autos', f.autosPorValidar, n => `${plural(n, 'auto', 'autos')} de medição por validar`, '/subempreiteiros')
  add('combustivel', f.pedidosCombustivel, n => `${plural(n, 'pedido', 'pedidos')} de combustível a aguardar autorização`, '/abastecimento')
  add('faltas', f.faltasPorDecidir, n => `${plural(n, 'falta', 'faltas')} por decidir`, '/colaboradores?aba=faltas')
  return out
}

export function saudacao(agora: Date): string {
  const h = Number(new Intl.DateTimeFormat('pt-PT', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Lisbon' }).format(agora))
  return h >= 6 && h < 13 ? 'Bom dia' : h >= 13 && h < 20 ? 'Boa tarde' : 'Boa noite'
}
