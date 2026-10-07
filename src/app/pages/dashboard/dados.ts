import { supabase } from '@/integrations/supabase/client'
import { contarAguardam } from '@/features/combustivel/services/aprovacaoService'
import { listarSubempreiteiros } from '@/features/subempreiteiros/services/subempreiteirosService'
import { carregarVisaoGeral, bloco, type Bloco, type VisaoGeral } from '@/app/pages/relatorios/dados'
import type { DecisoesFonte } from '@/app/lib/dashboard/resumo'

// Composição de vários módulos: vive na camada de páginas. Cada fonte é um Bloco para que
// uma falha isole só o seu cartão (o ecrã diz qual falhou, nunca mostra 0 por engano).
export type DecisoesBlocos = { [K in keyof DecisoesFonte]-?: Bloco<number> }

async function contarContratosPorValidar(): Promise<number> {
  const subs = await listarSubempreiteiros()
  return subs.filter(s => s.status === 'rascunho').length
}

async function contarAutosPorValidar(): Promise<number> {
  const { count, error } = await supabase.from('autos_medicao').select('id', { count: 'exact', head: true }).eq('estado', 'rascunho')
  if (error) throw error
  return count ?? 0
}

async function contarFaltasPorDecidir(): Promise<number> {
  const { count, error } = await supabase.from('faltas').select('id', { count: 'exact', head: true }).in('estado', ['COMUNICADA', 'COM_COMPROVATIVO'])
  if (error) throw error
  return count ?? 0
}

export type DadosDashboard = { visao: VisaoGeral; decisoes: DecisoesBlocos; atualizadoEm: Date }

export async function carregarDashboard(): Promise<DadosDashboard> {
  const [visao, contratosPorValidar, autosPorValidar, pedidosCombustivel, faltasPorDecidir] = await Promise.all([
    carregarVisaoGeral(),
    bloco(contarContratosPorValidar()), bloco(contarAutosPorValidar()),
    bloco(contarAguardam()), bloco(contarFaltasPorDecidir()),
  ])
  return { visao, decisoes: { contratosPorValidar, autosPorValidar, pedidosCombustivel, faltasPorDecidir }, atualizadoEm: new Date() }
}
