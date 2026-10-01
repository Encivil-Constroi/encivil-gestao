import type { ObraResumoRow, Saude, EstadoObra } from '../db'

// A saúde é calculada no banco (obras_painel); aqui só se apresenta e ordena.
// Cor + texto + ícone (nome do ícone lucide), nunca só cor.
export const SAUDE_INFO: Record<Saude, { rotulo: string; icone: 'CheckCircle2' | 'AlertTriangle' | 'ShieldAlert'; cls: string; barra: string }> = {
  ok:      { rotulo: 'Em dia',  icone: 'CheckCircle2',  cls: 'bg-success/10 text-success',          barra: 'bg-success' },
  atencao: { rotulo: 'Atenção', icone: 'AlertTriangle', cls: 'bg-warning/15 text-warning',          barra: 'bg-warning' },
  critico: { rotulo: 'Crítico', icone: 'ShieldAlert',   cls: 'bg-destructive/10 text-destructive',  barra: 'bg-destructive' },
}

const PESO: Record<Saude, number> = { ok: 0, atencao: 1, critico: 2 }

export function piorSaude(a: Saude, b: Saude): Saude {
  return PESO[a] >= PESO[b] ? a : b
}

export const ESTADOS_OBRA: { valor: EstadoObra; rotulo: string }[] = [
  { valor: 'ativa', rotulo: 'Ativa' },
  { valor: 'planeada', rotulo: 'Planeada' },
  { valor: 'suspensa', rotulo: 'Suspensa' },
  { valor: 'concluida', rotulo: 'Concluída' },
]

export function rotuloEstado(estado: EstadoObra): string {
  return ESTADOS_OBRA.find(e => e.valor === estado)?.rotulo ?? estado
}

export const ESTADO_CLS: Record<EstadoObra, string> = {
  ativa: 'bg-primary/10 text-primary',
  planeada: 'bg-muted text-muted-foreground',
  suspensa: 'bg-warning/15 text-warning',
  concluida: 'bg-muted text-muted-foreground',
}

// Mais grave primeiro; a seguir as que têm menos progresso face ao esperado
export function ordenarPorSaude<T extends Pick<ObraResumoRow, 'saude' | 'nome'>>(obras: T[]): T[] {
  return [...obras].sort((a, b) => PESO[b.saude] - PESO[a.saude] || a.nome.localeCompare(b.nome, 'pt'))
}

export function precisaAtencao(o: Pick<ObraResumoRow, 'estado' | 'saude'>): boolean {
  return o.estado === 'ativa' && o.saude !== 'ok'
}

export type KpisPainel = {
  emCurso: number
  criticas: number
  atencao: number
  semRelatorio: number
  ocorrenciasAbertas: number
  progressoMedio: number | null
  orcamentoTotal: number
  custoTotal: number
}

// Todos os números do topo do painel vêm das obras em curso (estado "ativa")
export function calcularKpis(obras: ObraResumoRow[]): KpisPainel {
  const ativas = obras.filter(o => o.estado === 'ativa')
  const comProgresso = ativas.filter(o => o.progresso_pct != null)
  const comOrcamento = ativas.filter(o => o.orcamento != null && o.orcamento > 0)
  return {
    emCurso: ativas.length,
    criticas: ativas.filter(o => o.saude === 'critico').length,
    atencao: ativas.filter(o => o.saude === 'atencao').length,
    semRelatorio: ativas.filter(o => o.dias_sem_relatorio == null || o.dias_sem_relatorio >= 3).length,
    ocorrenciasAbertas: ativas.reduce((s, o) => s + o.ocorrencias_abertas, 0),
    progressoMedio: comProgresso.length
      ? Math.round(comProgresso.reduce((s, o) => s + Number(o.progresso_pct), 0) / comProgresso.length)
      : null,
    orcamentoTotal: comOrcamento.reduce((s, o) => s + Number(o.orcamento), 0),
    custoTotal: comOrcamento.reduce((s, o) => s + Number(o.custo_total), 0),
  }
}
