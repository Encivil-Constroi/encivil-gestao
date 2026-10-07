import { rpcSemTipos } from '@/app/lib/rpcSemTipos'
import { listarObras } from '@/features/obras/services/obrasService'
import { certificado, retencao } from '@/features/obras/lib/medicao'
import { listarSubempreiteirosComExecutado } from '@/features/subempreiteiros/services/subempreiteirosService'
import { custosMateriaisCombustivelPorObra } from '@/features/custos/custosService'
import {
  contabDb,
  type ColaboradorExportRow,
  type DadosLaboraisEmbed,
  type FaturaExportRow,
  type LinhaMapaAssiduidade,
} from './db'
import { limitesLisboa, mesAtual } from './lib/periodo'

export type FiltrosExport = {
  dataInicio?: string  // YYYY-MM-DD
  dataFim?: string     // YYYY-MM-DD
  obraId?: string
}

export type ExportRow = Record<string, string | number>
export type FolhaExport = { nome: string; linhas: ExportRow[] }

// ─── Formatadores ─────────────────────────────────────────────────────────────

const PT_DATE = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
function fmtData(v: string | Date | null | undefined): string {
  if (!v) return ''
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? '' : PT_DATE.format(d)
}
function num2(v: number): number { return Math.round(v * 100) / 100 }

// ─── 1. Saídas de materiais ────────────────────────────────────────────────────

type MatRow = {
  created_at: string
  tipo: string
  quantidade: number
  responsavel: string
  destino_obra: string | null
  produtos: { nome: string; codigo: string; unidade: string; custo_unitario: number } | null
  obras: { nome: string } | null
}

export async function exportarMateriais(filtros: FiltrosExport = {}): Promise<ExportRow[]> {
  let query = contabDb
    .from('movimentos_stock')
    .select('created_at, tipo, quantidade, responsavel, destino_obra, produtos(nome, codigo, unidade, custo_unitario), obras(nome)')
    .eq('tipo', 'saida')
    .order('created_at', { ascending: true })

  // created_at é timestamptz: o dia civil é o de Lisboa, não o UTC.
  const { desde, ate } = limitesLisboa(filtros.dataInicio, filtros.dataFim)
  if (desde)          query = query.gte('created_at', desde)
  if (ate)            query = query.lt('created_at', ate)
  if (filtros.obraId) query = query.eq('obra_id', filtros.obraId)

  const { data, error } = await query
  if (error) throw new Error(`Materiais: ${error.message}`)

  return ((data as MatRow[] | null) ?? []).map(r => {
    const custo = Number(r.produtos?.custo_unitario ?? 0)
    const qtd   = Number(r.quantidade)
    return {
      'Data':              fmtData(r.created_at),
      'Produto':           r.produtos?.nome ?? '',
      'Código':            r.produtos?.codigo ?? '',
      'Quantidade':        qtd,
      'Unidade':           r.produtos?.unidade ?? '',
      'Custo Unitário (€)': num2(custo),
      'Custo Total (€)':   num2(custo * qtd),
      'Responsável':       r.responsavel,
      'Obra':              r.obras?.nome ?? r.destino_obra ?? '',
    }
  })
}

// ─── 2. Abastecimentos de combustível ─────────────────────────────────────────

type FuelRow = {
  data: string
  litros: number
  custo_total: number
  responsavel: string
  local: string | null
  observacoes: string | null
  comb_veiculos: { nome: string; codigo: string } | null
  obras: { nome: string } | null
}

export async function exportarCombustivel(filtros: FiltrosExport = {}): Promise<ExportRow[]> {
  let query = contabDb
    .from('comb_abastecimentos')
    .select('data, litros, custo_total, responsavel, local, observacoes, comb_veiculos(nome, codigo), obras(nome)')
    .order('data', { ascending: true })

  if (filtros.dataInicio) query = query.gte('data', filtros.dataInicio)
  if (filtros.dataFim)    query = query.lte('data', filtros.dataFim)
  if (filtros.obraId)     query = query.eq('obra_id', filtros.obraId)

  const { data, error } = await query
  if (error) throw new Error(`Combustível: ${error.message}`)

  return ((data as FuelRow[] | null) ?? []).map(r => {
    const litros = Number(r.litros)
    const custo  = Number(r.custo_total)
    return {
      'Data':              fmtData(r.data),
      'Viatura':           r.comb_veiculos?.nome ?? '',
      'Código Viatura':    r.comb_veiculos?.codigo ?? '',
      'Litros':            litros,
      'Custo/Litro (€)':   litros > 0 ? num2(custo / litros) : 0,
      'Custo Total (€)':   num2(custo),
      'Responsável':       r.responsavel,
      'Obra':              r.obras?.nome ?? '',
      'Local':             r.local ?? '',
      'Observações':       r.observacoes ?? '',
    }
  })
}

// ─── 3. Autos de medição validados ────────────────────────────────────────────
// Retenção e líquido calculados sobre o certificado (bruto − glosas).

type AutoRow = {
  numero: number
  data_medicao: string
  valor_periodo: number
  valor_glosado?: number | null
  estado: string
  estado_pagamento: string
  data_pagamento: string | null
  referencia_pagamento: string | null
  validado_em: string | null
  subempreiteiros: {
    nome: string
    percentagem_retencao: number
    obra_id?: string
    obras: { nome: string } | null
  } | null
}

export async function exportarAutos(filtros: FiltrosExport = {}): Promise<ExportRow[]> {
  let query = contabDb
    .from('autos_medicao')
    .select('numero, data_medicao, valor_periodo, valor_glosado, estado, estado_pagamento, data_pagamento, referencia_pagamento, validado_em, subempreiteiros!inner(nome, percentagem_retencao, obra_id, obras(nome))')
    .eq('estado', 'validado')
    .order('data_medicao', { ascending: true })

  if (filtros.dataInicio) query = query.gte('data_medicao', filtros.dataInicio)
  if (filtros.dataFim)    query = query.lte('data_medicao', filtros.dataFim)
  if (filtros.obraId)     query = query.eq('subempreiteiros.obra_id', filtros.obraId)

  const { data, error } = await query
  if (error) throw new Error(`Autos: ${error.message}`)

  const rows = (data as AutoRow[] | null) ?? []

  const ESTADO_PAG: Record<string, string> = {
    por_pagar: 'Por pagar',
    pago: 'Pago',
    em_atraso: 'Em atraso',
  }

  return rows.map(r => {
    const bruto    = Number(r.valor_periodo)
    const glosado  = Number(r.valor_glosado ?? 0)
    const cert     = certificado(bruto, glosado)
    const pct      = Number(r.subempreiteiros?.percentagem_retencao ?? 0)
    const retido   = retencao(cert, pct)
    const liquido  = cert - retido
    return {
      'Nº Auto':           r.numero,
      'Data Medição':      fmtData(r.data_medicao),
      'Subempreiteiro':    r.subempreiteiros?.nome ?? '',
      'Obra':              r.subempreiteiros?.obras?.nome ?? '',
      'Valor Bruto (€)':   num2(bruto),
      'Glosado (€)':       num2(glosado),
      'Valor Certificado (€)': num2(cert),
      'Retenção (%)':      pct,
      'Valor Retido (€)':  num2(retido),
      'Valor Líquido (€)': num2(liquido),
      'Estado Pagamento':  ESTADO_PAG[r.estado_pagamento] ?? r.estado_pagamento,
      'Data Pagamento':    fmtData(r.data_pagamento),
      'Ref. Pagamento':    r.referencia_pagamento ?? '',
      'Validado Em':       fmtData(r.validado_em),
    }
  })
}

// ─── 4. P&L Resumo por obra ────────────────────────────────────────────────────
// Nota: este export agrega todos os custos históricos (sem filtro por data)
// porque o P&L de uma obra é por natureza acumulado.

export async function exportarPLObras(): Promise<ExportRow[]> {
  const [obras, custosMap, todosSubsComExec] = await Promise.all([
    listarObras(false),        // false = inclui concluídas
    custosMateriaisCombustivelPorObra(),
    listarSubempreiteirosComExecutado(),  // sem obraId = todas as obras
  ])

  // Agrupa subs executado por obraId
  const execPorObra: Record<string, number> = {}
  todosSubsComExec.forEach(s => {
    execPorObra[s.obraId] = (execPorObra[s.obraId] ?? 0) + s.executed
  })

  return obras
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(o => {
      const mat  = custosMap[o.id]?.materiais    ?? 0
      const comb = custosMap[o.id]?.combustivel  ?? 0
      const subs = execPorObra[o.id]             ?? 0
      const total = mat + comb + subs
      const margem = o.budget != null ? o.budget - total : null
      const margemPct = o.budget != null && o.budget > 0 ? ((margem! / o.budget) * 100) : null
      return {
        'Obra':             o.name,
        'Cliente':          o.client ?? '',
        'Local':            o.location ?? '',
        'Estado':           o.status === 'concluida' ? 'Concluída' : 'Ativa',
        'Orçamento (€)':    o.budget != null ? num2(o.budget) : '',
        'Materiais (€)':    num2(mat),
        'Subempreiteiros (€)': num2(subs),
        'Combustível (€)':  num2(comb),
        'Custo Total (€)':  num2(total),
        'Margem (€)':       margem != null ? num2(margem) : '',
        'Margem (%)':       margemPct != null ? Math.round(margemPct * 10) / 10 : '',
      }
    })
}

// ─── 5. Mapa de assiduidade (processamento salarial) ──────────────────────────

function periodoDe(f: FiltrosExport): { dataInicio: string; dataFim: string } {
  const base = mesAtual()
  return { dataInicio: f.dataInicio ?? base.dataInicio, dataFim: f.dataFim ?? base.dataFim }
}

async function buscarMapa(f: FiltrosExport): Promise<LinhaMapaAssiduidade[]> {
  const { dataInicio, dataFim } = periodoDe(f)
  const rows = await rpcSemTipos<LinhaMapaAssiduidade[] | null>('contabilidade_mapa_assiduidade', {
    p_inicio: dataInicio,
    p_fim: dataFim,
  })
  return rows ?? []
}

function linhasMapa(rows: LinhaMapaAssiduidade[]): ExportRow[] {
  return rows.map(r => ({
    'Nº Mecanográfico':                r.numero_mecan,
    'Nome':                            r.nome,
    'NIF':                             r.nif ?? '',
    'NISS':                            r.niss ?? '',
    'Cargo':                           r.cargo ?? '',
    'Dias Trabalhados':                Number(r.dias_trabalhados),
    'Horas Normais':                   Number(r.horas_normais),
    'Extra Dia Útil +25% (h)':         Number(r.horas_extra_util_25),
    'Extra Dia Útil +37,5% (h)':       Number(r.horas_extra_util_375),
    'Extra Descanso/Feriado +50% (h)': Number(r.horas_extra_descanso_50),
    'Total Horas Extra':               Number(r.horas_extra_total),
    'Dias Subsídio Alimentação':       Number(r.dias_subsidio_alimentacao),
    'Faltas Justificadas (dias)':      Number(r.faltas_justificadas_dias),
    'Faltas Injustificadas (dias)':    Number(r.faltas_injustificadas_dias),
    'Faltas Descontáveis (dias)':      Number(r.faltas_descontaveis_dias),
  }))
}

function linhasFaltas(rows: LinhaMapaAssiduidade[]): ExportRow[] {
  return rows.flatMap(r =>
    (r.faltas_detalhe ?? []).map(d => ({
      'Nº Mecanográfico': r.numero_mecan,
      'Nome':             r.nome,
      'Tipo de Falta':    d.tipo,
      'Estado':           d.estado,
      'Dias':             Number(d.dias),
    })),
  )
}

export async function exportarMapaAssiduidade(f: FiltrosExport = {}): Promise<ExportRow[]> {
  return linhasMapa(await buscarMapa(f))
}

export async function exportarFaltas(f: FiltrosExport = {}): Promise<ExportRow[]> {
  return linhasFaltas(await buscarMapa(f))
}

// ─── 6. Dados laborais (RGPD — só admin/gestor, garantido pela RLS) ───────────

const TIPO_CONTRATO: Record<string, string> = {
  SEM_TERMO: 'Sem termo',
  TERMO_CERTO: 'A termo certo',
  TERMO_INCERTO: 'A termo incerto',
  TEMPORARIO: 'Trabalho temporário',
  ESTAGIO: 'Estágio',
  OUTRO: 'Outro',
}

export async function exportarDadosLaborais(): Promise<ExportRow[]> {
  const { data, error } = await contabDb
    .from('colaboradores')
    .select('numero_mecan, nome, nif, cargo, ativo, colaboradores_dados_laborais(niss, iban, data_admissao, tipo_contrato, data_fim_contrato, categoria_profissional)')
    .order('nome', { ascending: true })
  if (error) throw new Error(`Dados laborais: ${error.message}`)

  return ((data as ColaboradorExportRow[] | null) ?? []).map(c => {
    const emb = c.colaboradores_dados_laborais
    const dl: DadosLaboraisEmbed | null = Array.isArray(emb) ? (emb[0] ?? null) : emb
    return {
      'Nº Mecanográfico':       c.numero_mecan,
      'Nome':                   c.nome,
      'NIF':                    c.nif ?? '',
      'NISS':                   dl?.niss ?? '',
      'IBAN':                   dl?.iban ?? '',
      'Cargo':                  c.cargo ?? '',
      'Categoria Profissional': dl?.categoria_profissional ?? '',
      'Data Admissão':          fmtData(dl?.data_admissao),
      'Tipo Contrato':          dl?.tipo_contrato ? (TIPO_CONTRATO[dl.tipo_contrato] ?? dl.tipo_contrato) : '',
      'Fim Contrato':           fmtData(dl?.data_fim_contrato),
      'Ativo':                  c.ativo ? 'Sim' : 'Não',
    }
  })
}

// ─── 7. Faturas de fornecedor ─────────────────────────────────────────────────

const ESTADO_FATURA: Record<string, string> = {
  RECEBIDA: 'Recebida',
  EXTRAIDA: 'Extraída',
  CLASSIFICADA: 'Classificada',
  LANCADA: 'Lançada',
}

export async function exportarFaturas(f: FiltrosExport = {}): Promise<ExportRow[]> {
  let query = contabDb
    .from('faturas_fornecedor')
    .select('numero_fatura, fornecedor, nif_fornecedor, data_fatura, data_recepcao, base_tributavel, valor_iva, total_fatura, estado, lancado_em, obras(nome)')
    .order('data_recepcao', { ascending: true })

  // Período por data_fatura; sem ela (extração por fazer) cai para data_recepcao.
  // Ambas são DATE: sem conversão de fuso.
  if (f.dataInicio || f.dataFim) {
    const lim = (col: string) => [
      f.dataInicio ? `${col}.gte.${f.dataInicio}` : null,
      f.dataFim ? `${col}.lte.${f.dataFim}` : null,
    ].filter(Boolean).join(',')
    query = query.or(`and(${lim('data_fatura')}),and(data_fatura.is.null,${lim('data_recepcao')})`)
  }
  if (f.obraId)     query = query.eq('obra_id', f.obraId)

  const { data, error } = await query
  if (error) throw new Error(`Faturas: ${error.message}`)

  return ((data as FaturaExportRow[] | null) ?? []).map(r => ({
    'Nº Fatura':           r.numero_fatura ?? '',
    'Fornecedor':          r.fornecedor,
    'NIF Fornecedor':      r.nif_fornecedor ?? '',
    'Data Fatura':         fmtData(r.data_fatura),
    'Data Receção':        fmtData(r.data_recepcao),
    'Base Tributável (€)': r.base_tributavel != null ? num2(Number(r.base_tributavel)) : '',
    'IVA (€)':             r.valor_iva != null ? num2(Number(r.valor_iva)) : '',
    'Total (€)':           r.total_fatura != null ? num2(Number(r.total_fatura)) : '',
    'Obra':                r.obras?.nome ?? '',
    'Estado':              ESTADO_FATURA[r.estado] ?? r.estado,
    'Lançada Em':          fmtData(r.lancado_em),
  }))
}

// ─── 8. Fecho do mês (um ficheiro, várias folhas) ─────────────────────────────

export const NOTAS_LEGAIS: ExportRow[] = [
  { 'Tema': 'Horas extra', 'Regra': 'Trabalho suplementar em dia útil: 1.ª hora +25 %, horas seguintes +37,5 %; em dia de descanso ou feriado +50 % (Código do Trabalho, art. 268.º). Só contam horas extra validadas.' },
  { 'Tema': 'Subsídio de alimentação', 'Regra': 'Conta o dia com pelo menos 50 % das horas previstas efetuadas, ou com trabalho em dia de descanso/feriado.' },
  { 'Tema': 'Faltas', 'Regra': 'Só se contam faltas em dias úteis (sem fins de semana, feriados nem pontes da empresa) dentro do período. Faltas pendentes de decisão não descontam.' },
  { 'Tema': 'Faltas descontáveis', 'Regra': 'Injustificadas e justificadas de tipo descontável (sem retribuição).' },
  { 'Tema': 'Dados pessoais', 'Regra': 'NIF, NISS e IBAN são dados pessoais (RGPD): circulação restrita ao contabilista e à gestão; não reencaminhar.' },
]

export async function exportarFechoMes(f: FiltrosExport = {}): Promise<FolhaExport[]> {
  const filtros: FiltrosExport = { ...f, ...periodoDe(f) }
  const [mapa, laborais, faturas, materiais, combustivel, autos, pl] = await Promise.all([
    buscarMapa(filtros),
    exportarDadosLaborais(),
    exportarFaturas(filtros),
    exportarMateriais(filtros),
    exportarCombustivel(filtros),
    exportarAutos(filtros),
    exportarPLObras(),
  ])
  return [
    { nome: 'Assiduidade',    linhas: linhasMapa(mapa) },
    { nome: 'Faltas',         linhas: linhasFaltas(mapa) },
    { nome: 'Dados laborais', linhas: laborais },
    { nome: 'Faturas',        linhas: faturas },
    { nome: 'Materiais',      linhas: materiais },
    { nome: 'Combustível',    linhas: combustivel },
    { nome: 'Autos',          linhas: autos },
    { nome: 'P&L',            linhas: pl },
    { nome: 'Notas',          linhas: NOTAS_LEGAIS },
  ]
}
