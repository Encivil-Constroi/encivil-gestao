import { formatarData } from '@/app/lib/prazoFrota'
import { hojeIso } from './frota'
import type { HistoricoManutencaoRow } from '../db'

// Valor do filtro/seleção para trabalhos avulsos (sem item do catálogo)
export const TIPO_OUTRO = '__outro'

export type FiltrosLocais = { tipo: string; texto: string }

export function semAcentos(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function periodoMes(hoje: Date = new Date()): { desde: string; ate: string } {
  const p = (n: number) => String(n).padStart(2, '0')
  return { desde: `${hoje.getFullYear()}-${p(hoje.getMonth() + 1)}-01`, ate: hojeIso(hoje) }
}

export function periodoAno(hoje: Date = new Date()): { desde: string; ate: string } {
  return { desde: `${hoje.getFullYear()}-01-01`, ate: hojeIso(hoje) }
}

export function tituloManutencao(l: Pick<HistoricoManutencaoRow, 'item_rotulo' | 'descricao'>): string {
  return l.item_rotulo ?? l.descricao ?? 'Manutenção'
}

export function formatarLeitura(n: number | null | undefined, unidade: string): string {
  if (n == null) return '—'
  return `${Number(n).toLocaleString('pt-PT')} ${unidade === 'horas' ? 'h' : 'km'}`
}

// Filtros que o Postgres não faz: tipo (item do catálogo) e pesquisa livre
export function filtrarHistorico(linhas: HistoricoManutencaoRow[], { tipo, texto }: FiltrosLocais): HistoricoManutencaoRow[] {
  const termo = semAcentos(texto.trim())
  return linhas.filter(l => {
    if (tipo === TIPO_OUTRO && l.item_id !== null) return false
    if (tipo && tipo !== TIPO_OUTRO && l.item_id !== tipo) return false
    if (!termo) return true
    const palheiro = semAcentos([
      l.veiculo_nome, l.identificacao, l.item_rotulo, l.descricao, l.oficina, l.observacoes, l.registado_por, l.editado_por,
    ].filter(Boolean).join(' '))
    return palheiro.includes(termo)
  })
}

export type GrupoDia = { data: string; linhas: HistoricoManutencaoRow[]; custo: number }

export function totalCusto(linhas: { custo: number | null }[]): number {
  return linhas.reduce((s, l) => s + Number(l.custo ?? 0), 0)
}

// Dias do mais recente para o mais antigo; dentro do dia, a ordem recebida (mais recente primeiro)
export function agruparPorDia(linhas: HistoricoManutencaoRow[]): GrupoDia[] {
  const mapa = new Map<string, HistoricoManutencaoRow[]>()
  for (const l of linhas) mapa.set(l.data, [...(mapa.get(l.data) ?? []), l])
  return [...mapa.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([data, ls]) => ({ data, linhas: ls, custo: totalCusto(ls) }))
}

export function nomeDoDia(dataIso: string): string {
  const [a, m, d] = dataIso.split('-').map(Number)
  return new Date(a, m - 1, d).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatarDataHora(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-PT')} às ${d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`
}

export function linhasExportacao(linhas: HistoricoManutencaoRow[]): Record<string, unknown>[] {
  return linhas.map(l => ({
    'Data': formatarData(l.data),
    'Viatura/Máquina': l.veiculo_nome,
    'Matrícula': l.identificacao ?? '',
    'Tipo': l.item_rotulo ?? 'Outro',
    'Descrição': l.descricao ?? '',
    'Km/Horas': l.km_na_altura ?? '',
    'Unidade': l.unidade_contador === 'horas' ? 'h' : 'km',
    'Custo (€)': l.custo ?? '',
    'Oficina': l.oficina ?? '',
    'Observações': l.observacoes ?? '',
    'Registado por': l.registado_por,
    'Registado em': formatarDataHora(l.registado_em),
    'Editado por': l.editado_por ?? '',
    'Editado em': l.editado_em ? formatarDataHora(l.editado_em) : '',
  }))
}

export type Diferenca = { campo: string; antes: string; depois: string }

const CAMPOS: { chave: string; rotulo: string }[] = [
  { chave: 'item_id', rotulo: 'Tipo' },
  { chave: 'descricao', rotulo: 'Descrição' },
  { chave: 'data', rotulo: 'Data' },
  { chave: 'km_na_altura', rotulo: 'Km/Horas' },
  { chave: 'custo', rotulo: 'Custo (€)' },
  { chave: 'oficina', rotulo: 'Oficina' },
  { chave: 'observacoes', rotulo: 'Observações' },
]

// O que mudou numa correção (antes → depois), só nos campos editáveis
export function diferencas(
  antes: Record<string, unknown>, depois: Record<string, unknown>, rotuloItem: (id: string) => string,
): Diferenca[] {
  const texto = (chave: string, v: unknown): string => {
    if (v === null || v === undefined || v === '') return '—'
    if (chave === 'item_id') return rotuloItem(String(v))
    if (chave === 'data') return formatarData(String(v))
    return String(v)
  }
  return CAMPOS
    .filter(c => String(antes[c.chave] ?? '') !== String(depois[c.chave] ?? ''))
    .map(c => ({ campo: c.rotulo, antes: texto(c.chave, antes[c.chave]), depois: texto(c.chave, depois[c.chave]) }))
}
