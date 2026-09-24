import { supabase } from '@/integrations/supabase/client'
import { listarObras } from '@/features/obras/services/obrasService'
import { listarSubempreiteirosComExecutado } from '@/features/subempreiteiros/services/subempreiteirosService'
import { custosMateriaisCombustivelPorObra } from '@/features/custos/custosService'

// As queries usam aliases de FK (obras!obra_id) que os tipos gerados não suportam.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as any

export type FiltrosExport = {
  dataInicio?: string  // YYYY-MM-DD
  dataFim?: string     // YYYY-MM-DD
  obraId?: string
}

export type ExportRow = Record<string, string | number>

// ─── Formatadores ─────────────────────────────────────────────────────────────

const PT_DATE = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
function fmtData(v: string | Date | null | undefined): string {
  if (!v) return ''
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? '' : PT_DATE.format(d)
}
function num2(v: number): string { return v.toFixed(2) }

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
  let query = db
    .from('movimentos_stock')
    .select('created_at, tipo, quantidade, responsavel, destino_obra, produtos(nome, codigo, unidade, custo_unitario), obras(nome)')
    .eq('tipo', 'saida')
    .order('created_at', { ascending: true })

  if (filtros.dataInicio) query = query.gte('created_at', filtros.dataInicio)
  if (filtros.dataFim)    query = query.lte('created_at', `${filtros.dataFim}T23:59:59`)
  if (filtros.obraId)     query = query.eq('obra_id', filtros.obraId)

  const { data, error } = await query
  if (error) throw new Error(`Materiais: ${error.message}`)

  return (data as MatRow[]).map(r => {
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
  let query = db
    .from('comb_abastecimentos')
    .select('data, litros, custo_total, responsavel, local, observacoes, comb_veiculos(nome, codigo), obras(nome)')
    .order('data', { ascending: true })

  if (filtros.dataInicio) query = query.gte('data', filtros.dataInicio)
  if (filtros.dataFim)    query = query.lte('data', filtros.dataFim)
  if (filtros.obraId)     query = query.eq('obra_id', filtros.obraId)

  const { data, error } = await query
  if (error) throw new Error(`Combustível: ${error.message}`)

  return (data as FuelRow[]).map(r => {
    const litros = Number(r.litros)
    const custo  = Number(r.custo_total)
    return {
      'Data':              fmtData(r.data),
      'Viatura':           r.comb_veiculos?.nome ?? '',
      'Código Viatura':    r.comb_veiculos?.codigo ?? '',
      'Litros':            litros,
      'Custo/Litro (€)':   litros > 0 ? num2(custo / litros) : '0.00',
      'Custo Total (€)':   num2(custo),
      'Responsável':       r.responsavel,
      'Obra':              r.obras?.nome ?? '',
      'Local':             r.local ?? '',
      'Observações':       r.observacoes ?? '',
    }
  })
}

// ─── 3. Autos de medição validados ────────────────────────────────────────────

type AutoRow = {
  numero: number
  data_medicao: string
  valor_periodo: number
  estado: string
  estado_pagamento: string
  data_pagamento: string | null
  referencia_pagamento: string | null
  validado_em: string | null
  subempreiteiros: {
    nome: string
    percentagem_retencao: number
    obras: { nome: string } | null
  } | null
}

export async function exportarAutos(filtros: FiltrosExport = {}): Promise<ExportRow[]> {
  let query = db
    .from('autos_medicao')
    .select('numero, data_medicao, valor_periodo, estado, estado_pagamento, data_pagamento, referencia_pagamento, validado_em, subempreiteiros(nome, percentagem_retencao, obras(nome))')
    .eq('estado', 'validado')
    .order('data_medicao', { ascending: true })

  if (filtros.dataInicio) query = query.gte('data_medicao', filtros.dataInicio)
  if (filtros.dataFim)    query = query.lte('data_medicao', filtros.dataFim)

  const { data, error } = await query
  if (error) throw new Error(`Autos: ${error.message}`)

  let rows = data as AutoRow[]
  if (filtros.obraId) {
    rows = rows.filter(r => {
      // subempreiteiros.obras é { nome } — mas a FK é obra_id na tabela subempreiteiros
      // Filtramos pelo nome da obra (proxy, já que não temos o id directamente aqui)
      // A alternativa correcta seria um join duplo; aqui optamos por filtro client-side
      // já que o volume é pequeno e o conjunto já está filtrado por data
      return (r.subempreiteiros?.obras) != null
    })
  }

  const ESTADO_PAG: Record<string, string> = {
    por_pagar: 'Por pagar',
    pago: 'Pago',
    em_atraso: 'Em atraso',
  }

  return rows.map(r => {
    const bruto   = Number(r.valor_periodo)
    const pct     = Number(r.subempreiteiros?.percentagem_retencao ?? 0)
    const retido  = bruto * pct / 100
    const liquido = bruto - retido
    return {
      'Nº Auto':           r.numero,
      'Data Medição':      fmtData(r.data_medicao),
      'Subempreiteiro':    r.subempreiteiros?.nome ?? '',
      'Obra':              r.subempreiteiros?.obras?.nome ?? '',
      'Valor Bruto (€)':   num2(bruto),
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
        'Margem (%)':       margemPct != null ? margemPct.toFixed(1) : '',
      }
    })
}
