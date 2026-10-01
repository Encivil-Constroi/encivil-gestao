import { diasAte } from '@/app/lib/prazoFrota'
import type { EstadoOperacional, LinhaTempoRow, ResumoViaturaRow } from '../db'

export type ClasseViatura = 'VIATURA' | 'MAQUINA'
export type NivelPrazo = 'EXPIRADO' | 'A_VENCER' | 'OK' | 'SEM_DATA'

export const DIAS_AVISO_DOCUMENTO = 30

// Valores aceites por ck_veiculo_tipo e pelo Abastecimento (src/features/combustivel/labels.ts)
export const TIPOS_VIATURA = [
  { valor: 'viatura', rotulo: 'Viatura' },
  { valor: 'maquina', rotulo: 'Máquina' },
  { valor: 'gerador', rotulo: 'Gerador' },
  { valor: 'outro',   rotulo: 'Outro' },
]
export const COMBUSTIVEIS = [
  { valor: 'gasoleo',  rotulo: 'Gasóleo' },
  { valor: 'gasolina', rotulo: 'Gasolina' },
  { valor: 'adblue',   rotulo: 'AdBlue' },
  { valor: 'eletrico', rotulo: 'Elétrico' },
  { valor: 'outro',    rotulo: 'Outro' },
]

export function rotuloTipo(tipo: string): string {
  return TIPOS_VIATURA.find(t => t.valor === tipo)?.rotulo ?? tipo
}

export function unidadePorTipo(tipo: string): 'km' | 'horas' {
  return TIPOS_MAQUINA.has(tipo) ? 'horas' : 'km'
}

// Máquina = tipo que não anda na estrada ou contador em horas; o resto é viatura
const TIPOS_MAQUINA = new Set(['maquina', 'gerador', 'outro'])

export function classeDaViatura(v: { tipo: string; unidade_contador: string }): ClasseViatura {
  return TIPOS_MAQUINA.has(v.tipo) || v.unidade_contador === 'horas' ? 'MAQUINA' : 'VIATURA'
}

export function nivelPrazo(dataIso: string | null | undefined, hoje: Date = new Date()): NivelPrazo {
  if (!dataIso) return 'SEM_DATA'
  const dias = diasAte(dataIso, hoje)
  if (dias < 0) return 'EXPIRADO'
  return dias <= DIAS_AVISO_DOCUMENTO ? 'A_VENCER' : 'OK'
}

// A revisão segue os alertas do Postgres (itens de manutenção); sem alertas, basta haver uma revisão registada
export function nivelRevisao(v: Pick<ResumoViaturaRow, 'alertas_urgentes' | 'alertas_atencao' | 'data_ultima_revisao'>): NivelPrazo {
  if (v.alertas_urgentes > 0) return 'EXPIRADO'
  if (v.alertas_atencao > 0) return 'A_VENCER'
  return v.data_ultima_revisao ? 'OK' : 'SEM_DATA'
}

export function unidadeDe(v: { unidade_contador: string }): 'km' | 'h' {
  return v.unidade_contador === 'horas' ? 'h' : 'km'
}

export function textoLeitura(valor: number | null | undefined, unidadeContador: string): string {
  if (valor == null) return '—'
  return `${Number(valor).toLocaleString('pt-PT')} ${unidadeContador === 'horas' ? 'h' : 'km'}`
}

export const ESTADO_TEXTO: Record<EstadoOperacional, string> = { LIVRE: 'Livre', EM_USO: 'Em uso', OFICINA: 'Oficina' }

const semAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export type FiltroViaturas = {
  estado?: EstadoOperacional | null
  classe?: ClasseViatura | null
  obraId?: string | null
  pesquisa?: string
}

export function filtrarViaturas(viaturas: ResumoViaturaRow[], f: FiltroViaturas): ResumoViaturaRow[] {
  const termo = semAcentos((f.pesquisa ?? '').trim())
  return viaturas.filter(v => {
    if (f.estado && v.estado_operacional !== f.estado) return false
    if (f.classe && classeDaViatura(v) !== f.classe) return false
    if (f.obraId && v.obra_id !== f.obraId) return false
    if (!termo) return true
    return [v.identificacao, v.marca, v.modelo, v.nome, v.codigo, v.condutor_nome]
      .some(c => !!c && semAcentos(c).includes(termo))
  })
}

export function contarPorEstado(viaturas: ResumoViaturaRow[]): Record<EstadoOperacional | 'TODOS', number> {
  const n = { TODOS: viaturas.length, LIVRE: 0, EM_USO: 0, OFICINA: 0 }
  for (const v of viaturas) n[v.estado_operacional]++
  return n
}

export function estadoDeParametro(valor: string | null): EstadoOperacional | null {
  return valor === 'LIVRE' || valor === 'EM_USO' || valor === 'OFICINA' ? valor : null
}

export function rotuloViatura(v: { identificacao: string | null; codigo: string; nome: string }): string {
  return v.identificacao ?? v.codigo ?? v.nome
}

export function marcaModelo(v: { marca: string | null; modelo: string | null; nome: string }): string {
  return [v.marca, v.modelo].filter(Boolean).join(' ') || v.nome
}

export type DocumentoEmRisco = { viatura: ResumoViaturaRow; documento: 'Seguro' | 'IPO'; data: string; nivel: 'EXPIRADO' | 'A_VENCER' }

// Seguros e IPO expirados ou a vencer em ≤ 30 dias, os mais urgentes primeiro
export function documentosEmRisco(viaturas: ResumoViaturaRow[], hoje: Date = new Date()): DocumentoEmRisco[] {
  const lista: DocumentoEmRisco[] = []
  for (const viatura of viaturas) {
    const docs = [['Seguro', viatura.data_fim_seguro], ['IPO', viatura.data_proxima_ipo]] as const
    for (const [documento, data] of docs) {
      const nivel = nivelPrazo(data, hoje)
      if (data && (nivel === 'EXPIRADO' || nivel === 'A_VENCER')) lista.push({ viatura, documento, data, nivel })
    }
  }
  return lista.sort((a, b) => a.data.localeCompare(b.data))
}

export type FiltroTempo = 'TODOS' | 'ENTREGAS' | 'MANUTENCAO' | 'CHECKLISTS' | 'ABASTECIMENTOS'

export const FILTROS_TEMPO: { valor: FiltroTempo; rotulo: string; tipos: LinhaTempoRow['tipo'][] }[] = [
  { valor: 'TODOS', rotulo: 'Tudo', tipos: [] },
  { valor: 'ENTREGAS', rotulo: 'Entregas', tipos: ['ENTREGA', 'DEVOLUCAO'] },
  { valor: 'MANUTENCAO', rotulo: 'Manutenção', tipos: ['MANUTENCAO', 'EDICAO'] },
  { valor: 'CHECKLISTS', rotulo: 'Checklists', tipos: ['CHECKLIST'] },
  { valor: 'ABASTECIMENTOS', rotulo: 'Abastecimentos', tipos: ['ABASTECIMENTO'] },
]

export function filtrarLinhaTempo(eventos: LinhaTempoRow[], filtro: FiltroTempo): LinhaTempoRow[] {
  const tipos = FILTROS_TEMPO.find(f => f.valor === filtro)?.tipos ?? []
  return tipos.length === 0 ? eventos : eventos.filter(e => tipos.includes(e.tipo))
}

// Quanto andou (km) ou trabalhou (horas) desde que chegou à empresa
export function percorridoDesdeRegisto(atual: number | null, registo: number | null): number | null {
  return atual == null || registo == null ? null : Math.max(0, Number(atual) - Number(registo))
}
