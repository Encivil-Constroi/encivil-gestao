import type {
  DanoMarcado, EntregaRow, NivelAdblue, NivelCombustivel, NivelLimpeza, NivelOleo, NivelPneus, VistaDano,
} from '../db'

export const MAX_DANOS = 60

type Opcao<T extends string> = { valor: T; rotulo: string }

export const OPCOES_COMBUSTIVEL: Opcao<NivelCombustivel>[] = [
  { valor: 'RESERVA', rotulo: 'Reserva' }, { valor: 'QUARTO', rotulo: '1/4' }, { valor: 'METADE', rotulo: '1/2' },
  { valor: 'TRES_QUARTOS', rotulo: '3/4' }, { valor: 'CHEIO', rotulo: 'Cheio' },
]
export const OPCOES_ADBLUE: Opcao<NivelAdblue>[] = [
  { valor: 'NA', rotulo: 'N/A' }, { valor: 'VAZIO', rotulo: 'Vazio' }, { valor: 'BAIXO', rotulo: 'Baixo' }, { valor: 'OK', rotulo: 'OK' },
]
export const OPCOES_OLEO: Opcao<NivelOleo>[] = [
  { valor: 'NA', rotulo: 'N/A' }, { valor: 'BAIXO', rotulo: 'Baixo' }, { valor: 'OK', rotulo: 'OK' },
]
export const OPCOES_PNEUS: Opcao<NivelPneus>[] = [
  { valor: 'NA', rotulo: 'N/A' }, { valor: 'GASTOS', rotulo: 'Gastos' }, { valor: 'BAIXO', rotulo: 'Baixo' }, { valor: 'OK', rotulo: 'OK' },
]
export const OPCOES_LIMPEZA: Opcao<NivelLimpeza>[] = [
  { valor: 'NA', rotulo: 'N/A' }, { valor: 'LIMPAR', rotulo: 'Limpar' }, { valor: 'OK', rotulo: 'OK' },
]

export const VISTAS: { vista: VistaDano; rotulo: string }[] = [
  { vista: 'frente', rotulo: 'Frente' },
  { vista: 'lado_esq', rotulo: 'Lado esquerdo' },
  { vista: 'tras', rotulo: 'Trás' },
  { vista: 'lado_dir', rotulo: 'Lado direito' },
  { vista: 'cima', rotulo: 'Cima' },
]
export const ROTULO_VISTA: Record<VistaDano, string> = Object.fromEntries(VISTAS.map(v => [v.vista, v.rotulo])) as Record<VistaDano, string>

export const ROTULO_COMBUSTIVEL: Record<NivelCombustivel, string> =
  Object.fromEntries(OPCOES_COMBUSTIVEL.map(o => [o.valor, o.rotulo])) as Record<NivelCombustivel, string>

export const ITENS_INVENTARIO = [
  { chave: 'colete', rotulo: 'Colete refletor presente?' },
  { chave: 'triangulo', rotulo: 'Triângulo presente?' },
  { chave: 'documentos', rotulo: 'Documentos / Seguros?' },
  { chave: 'macaco', rotulo: 'Macaco e chave de rodas?' },
] as const

export function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatarData(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export function diasDesde(iso: string, hoje: string = hojeISO()): number {
  const ms = Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)
  return Math.max(0, Math.round(ms / 86_400_000))
}

export function parseNumero(texto: string): number | null {
  const limpo = texto.trim().replace(/\s/g, '').replace(',', '.')
  if (limpo === '') return null
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

export function formatarContador(n: number | null | undefined, unidade: string): string {
  return n == null ? '—' : `${Number(n).toLocaleString('pt-PT')} ${unidade === 'horas' ? 'h' : 'km'}`
}

export type EntradaValidacao = {
  tipo: 'ENTREGA' | 'DEVOLUCAO'
  veiculoId: string
  colaboradorId: string
  data: string
  km: string
  kmMinimo: number | null
  unidade: string
  combustivel: NivelCombustivel | null
  hoje?: string
}

export function validarEntrega(e: EntradaValidacao): string | null {
  const unidade = e.unidade === 'horas' ? 'horas' : 'km'
  if (!e.veiculoId) return e.tipo === 'ENTREGA' ? 'Escolha a viatura a entregar' : 'Escolha a viatura a devolver'
  if (e.tipo === 'ENTREGA' && !e.colaboradorId) return 'Escolha quem vai conduzir'
  if (!e.data) return 'Indique a data'
  if (e.data > (e.hoje ?? hojeISO())) return `A data da ${e.tipo === 'ENTREGA' ? 'entrega' : 'devolução'} não pode ser futura`
  const n = parseNumero(e.km)
  if (n == null || n < 0) return `Indique os ${unidade} atuais`
  if (e.kmMinimo != null && n < e.kmMinimo) return `Os ${unidade} não podem ser inferiores ao último registo (${e.kmMinimo.toLocaleString('pt-PT')})`
  if (!e.combustivel) return 'Indique o nível de combustível'
  return null
}

// A devolução grava todos os danos (os da entrega primeiro, depois os novos)
export function danosNovos(devolucao: EntregaRow, entrega: EntregaRow | null | undefined): DanoMarcado[] {
  return devolucao.danos.slice(entrega?.danos.length ?? 0)
}

export function agruparPorDia(linhas: EntregaRow[]): { dia: string; linhas: EntregaRow[] }[] {
  const grupos = new Map<string, EntregaRow[]>()
  for (const l of linhas) {
    const g = grupos.get(l.data)
    if (g) g.push(l); else grupos.set(l.data, [l])
  }
  return [...grupos.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([dia, ls]) => ({ dia, linhas: ls }))
}

// Entrega ainda sem devolução = a que está "em curso" para a viatura
export function entregaEmCurso(linhas: EntregaRow[]): EntregaRow | null {
  const devolvidas = new Set(linhas.filter(l => l.tipo === 'DEVOLUCAO' && l.entrega_ref).map(l => l.entrega_ref))
  return linhas.find(l => l.tipo === 'ENTREGA' && !devolvidas.has(l.id)) ?? null
}
