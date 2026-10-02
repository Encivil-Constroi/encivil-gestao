import type { DocsEstadoGlobal, EstadoDocSub, SubDocEstadoRow, TipoDocSub } from '../db'

export type DocumentoMin = {
  tipo: TipoDocSub
  validade: string | null
  emitidoEm?: string | null
  criadoEm?: string | null
  id?: string | null
  referencia?: string | null
}

const DIA_MS = 86_400_000

function diasEntre(deISO: string, ateISO: string): number {
  const de = Date.parse(`${deISO.slice(0, 10)}T00:00:00Z`)
  const ate = Date.parse(`${ateISO.slice(0, 10)}T00:00:00Z`)
  return Math.round((ate - de) / DIA_MS)
}

/** Sem validade conta como em dia; expira quando a validade é anterior a hoje. */
export function estadoDocumento(
  validade: string | null, hoje: string, avisoDias: number,
): { estado: Exclude<EstadoDocSub, 'em_falta'>; diasRestantes: number | null } {
  if (!validade) return { estado: 'ok', diasRestantes: null }
  const dias = diasEntre(hoje, validade)
  if (dias < 0) return { estado: 'expirado', diasRestantes: dias }
  if (dias <= avisoDias) return { estado: 'a_expirar', diasRestantes: dias }
  return { estado: 'ok', diasRestantes: dias }
}

function chaveRecencia(d: DocumentoMin): string {
  return `${d.emitidoEm ?? ''}|${d.criadoEm ?? ''}`
}

/** Documento mais recente por tipo (emissão, depois criação). */
export function maisRecentePorTipo(docs: DocumentoMin[]): Map<TipoDocSub, DocumentoMin> {
  const mapa = new Map<TipoDocSub, DocumentoMin>()
  for (const d of docs) {
    const atual = mapa.get(d.tipo)
    if (!atual || chaveRecencia(d) >= chaveRecencia(atual)) mapa.set(d.tipo, d)
  }
  return mapa
}

/** Espelha `sub_docs_estado`: obrigatórios primeiro, depois os restantes tipos presentes. */
export function estadoDocs(
  docs: DocumentoMin[], obrigatorios: TipoDocSub[], hoje: string, avisoDias: number,
): SubDocEstadoRow[] {
  const recentes = maisRecentePorTipo(docs)
  const tipos: TipoDocSub[] = [...obrigatorios]
  for (const t of recentes.keys()) if (!tipos.includes(t)) tipos.push(t)
  return tipos.map(tipo => {
    const doc = recentes.get(tipo)
    const obrigatorio = obrigatorios.includes(tipo)
    if (!doc) {
      return { tipo, obrigatorio, estado: 'em_falta' as const, validade: null, dias_restantes: null, doc_id: null, referencia: null }
    }
    const { estado, diasRestantes } = estadoDocumento(doc.validade, hoje, avisoDias)
    return {
      tipo, obrigatorio, estado, validade: doc.validade,
      dias_restantes: diasRestantes, doc_id: doc.id ?? null, referencia: doc.referencia ?? null,
    }
  })
}

/** Tipos obrigatórios em falta ou expirados (espelha `_sub_docs_bloqueio`). */
export function tiposEmFaltaOuExpirados(estados: SubDocEstadoRow[]): TipoDocSub[] {
  return estados
    .filter(e => e.obrigatorio && (e.estado === 'em_falta' || e.estado === 'expirado'))
    .map(e => e.tipo)
}

export function resumoDocs(estados: SubDocEstadoRow[]): DocsEstadoGlobal {
  if (tiposEmFaltaOuExpirados(estados).length > 0) return 'critico'
  if (estados.some(e => e.obrigatorio && e.estado === 'a_expirar')) return 'a_expirar'
  return 'ok'
}

export const ROTULO_DOC: Record<TipoDocSub, string> = {
  CERT_SS: 'Certidão da Segurança Social',
  CERT_AT: 'Certidão das Finanças (AT)',
  ALVARA: 'Alvará / título IMPIC',
  SEGURO_AT: 'Seguro de acidentes de trabalho',
  SEGURO_RC: 'Seguro de responsabilidade civil',
  OUTRO: 'Outro documento',
}

export function mensagemDocsEmFalta(tipos: TipoDocSub[]): string | null {
  if (tipos.length === 0) return null
  return `Documentos em falta ou expirados: ${tipos.map(t => ROTULO_DOC[t]).join(', ')}.`
}
