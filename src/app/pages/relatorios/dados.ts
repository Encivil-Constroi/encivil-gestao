import { supabase } from '@/integrations/supabase/client'
import { listarColaboradores } from '@/features/colaboradores/services/colaboradoresService'
import { listarAlertasAtivos } from '@/features/alertas/services/alertasService'
import { listarPainel } from '@/features/obras/services/obrasService'
import { buscarPainelCeo } from '@/features/obras/services/subsControloService'
import { listarResumoViaturas } from '@/features/frota/services/frotaService'
import { listarEmprestimos } from '@/features/ferramentas/services/emprestimosService'
import type { ObraResumoRow, SubsPainelCeo } from '@/features/obras/db'
import type { ResumoViaturaRow } from '@/features/frota/db'
import type { Alerta } from '@/app/types'

export type PessoasResumo = {
  colaboradoresAtivos: number
  horasPrevistas: number
  horasEfetivas: number
  horasSuplPropostas: number
  horasSuplValidadas: number
  diasRegistados: number
  faltas: { total: number; injustificadas: number; semDecisao: number }
  alertasRh: Alerta[]
}

const TIPOS_RH = new Set(['EPI_VALIDADE', 'FORMACAO_VALIDADE', 'VALIDADE_DOC'])

// Composição de vários módulos (RH + alertas): vive na camada de páginas, não em `features/`.
export async function carregarPessoas(ini: string, fim: string): Promise<PessoasResumo> {
  const [colabs, alertas, assid, faltas] = await Promise.all([
    listarColaboradores(true),
    listarAlertasAtivos(),
    supabase.from('resumo_assiduidade_dia')
      .select('horas_previstas, horas_efetivas, horas_supl_propostas, horas_supl_validadas')
      .gte('data', ini).lte('data', fim),
    supabase.from('faltas').select('estado').lte('data_inicio', fim).gte('data_fim', ini),
  ])
  if (assid.error) throw assid.error
  if (faltas.error) throw faltas.error

  const soma = (k: 'horas_previstas' | 'horas_efetivas' | 'horas_supl_propostas' | 'horas_supl_validadas') =>
    (assid.data ?? []).reduce((s, r) => s + Number(r[k] ?? 0), 0)
  const fl = faltas.data ?? []

  return {
    colaboradoresAtivos: colabs.length,
    horasPrevistas: soma('horas_previstas'),
    horasEfetivas: soma('horas_efetivas'),
    horasSuplPropostas: soma('horas_supl_propostas'),
    horasSuplValidadas: soma('horas_supl_validadas'),
    diasRegistados: (assid.data ?? []).length,
    faltas: {
      total: fl.length,
      injustificadas: fl.filter(f => f.estado === 'INJUSTIFICADA').length,
      semDecisao: fl.filter(f => f.estado === 'COMUNICADA' || f.estado === 'COM_COMPROVATIVO').length,
    },
    alertasRh: alertas.filter(a => a.regraTipo != null && TIPOS_RH.has(a.regraTipo)),
  }
}

// ── Visão Geral ──────────────────────────────────────────────────────────────

export type Bloco<T> = { ok: true; data: T } | { ok: false; erro: string }

export type VisaoGeral = {
  obras: Bloco<ObraResumoRow[]>
  subs: Bloco<SubsPainelCeo>
  frota: Bloco<ResumoViaturaRow[]>
  artigosEmAlerta: Bloco<number>
  ferramentasEmAtraso: Bloco<number>
}

export async function bloco<T>(p: Promise<T>): Promise<Bloco<T>> {
  try { return { ok: true, data: await p } } catch (e) { return { ok: false, erro: e instanceof Error ? e.message : 'Erro' } }
}

async function contarArtigosEmAlerta(): Promise<number> {
  const { data, error } = await supabase.rpc('produtos_em_alerta')
  if (error) throw error
  return (data ?? []).length
}

async function contarFerramentasEmAtraso(): Promise<number> {
  const ativos = await listarEmprestimos({ estado: 'ativo' })
  const agora = Date.now()
  return ativos.filter(l => l.expectedReturnDate && l.expectedReturnDate.getTime() < agora).length
}

// Um módulo em erro não derruba os restantes: cada bloco resolve sozinho e o ecrã diz qual falhou.
export async function carregarVisaoGeral(): Promise<VisaoGeral> {
  const [obras, subs, frota, artigosEmAlerta, ferramentasEmAtraso] = await Promise.all([
    bloco(listarPainel()), bloco(buscarPainelCeo(null)), bloco(listarResumoViaturas()),
    bloco(contarArtigosEmAlerta()), bloco(contarFerramentasEmAtraso()),
  ])
  return { obras, subs, frota, artigosEmAlerta, ferramentasEmAtraso }
}
