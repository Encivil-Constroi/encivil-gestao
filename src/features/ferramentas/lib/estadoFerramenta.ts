import type { ToolLoan, ToolStatus } from '@/app/types'

// Datas 'YYYY-MM-DD' (colunas date) lidas como dia local — new Date('2026-10-01')
// seria meia-noite UTC e, a oeste de Greenwich, cairia no dia anterior.
export function diaLocal(iso: string): Date {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(a, m - 1, d)
}

export function isoDia(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function hojeIso(agora = new Date()): string {
  return isoDia(agora)
}

export function somarAnos(iso: string, anos: number): string {
  const d = diaLocal(iso)
  const alvo = new Date(d.getFullYear() + anos, d.getMonth(), d.getDate())
  // 29/02 + 1 ano → 28/02 (o Date passaria para 1 de março)
  if (alvo.getMonth() !== d.getMonth()) alvo.setDate(0)
  return isoDia(alvo)
}

export function fmtDia(iso: string | undefined): string {
  return iso ? diaLocal(iso).toLocaleDateString('pt-PT') : '—'
}

export function fmtData(d: Date | undefined): string {
  return d ? d.toLocaleDateString('pt-PT') : '—'
}

const DIA = 86_400_000
export const DIAS_ALERTA_GARANTIA = 30

export type EstadoGarantia =
  | { tipo: 'sem' }
  | { tipo: 'valida'; ate: string; dias: number }
  | { tipo: 'a_terminar'; ate: string; dias: number }
  | { tipo: 'expirada'; ate: string; dias: number }

export function estadoGarantia(garantiaAte: string | undefined | null, agora = new Date()): EstadoGarantia {
  if (!garantiaAte) return { tipo: 'sem' }
  const hoje = diaLocal(isoDia(agora))
  const dias = Math.round((diaLocal(garantiaAte).getTime() - hoje.getTime()) / DIA)
  if (dias < 0) return { tipo: 'expirada', ate: garantiaAte, dias }
  if (dias <= DIAS_ALERTA_GARANTIA) return { tipo: 'a_terminar', ate: garantiaAte, dias }
  return { tipo: 'valida', ate: garantiaAte, dias }
}

export function textoGarantia(g: EstadoGarantia): string {
  switch (g.tipo) {
    case 'sem': return 'Sem garantia registada'
    case 'valida': return `Em garantia até ${fmtDia(g.ate)}`
    case 'a_terminar': return g.dias === 0 ? 'Garantia termina hoje' : `Garantia termina em ${g.dias} dia${g.dias === 1 ? '' : 's'}`
    case 'expirada': return `Garantia expirada (${fmtDia(g.ate)})`
  }
}

// Atrasado = passou o dia previsto de devolução (o próprio dia ainda conta como dentro do prazo)
export function emAtraso(loan: Pick<ToolLoan, 'status' | 'expectedReturnDate'>, agora = new Date()): boolean {
  if (loan.status !== 'ativo' || !loan.expectedReturnDate) return false
  const prevista = loan.expectedReturnDate
  // Vem de uma coluna date lida com new Date('YYYY-MM-DD') → meia-noite UTC; usar as partes UTC
  const fimDoDia = new Date(prevista.getUTCFullYear(), prevista.getUTCMonth(), prevista.getUTCDate() + 1)
  return agora.getTime() >= fimDoDia.getTime()
}

export const ESTADO_FERRAMENTA: Record<ToolStatus, { rotulo: string; classe: string; ponto: string }> = {
  disponivel: { rotulo: 'Disponível', classe: 'bg-success/10 text-success border-success/30', ponto: 'bg-success' },
  emprestada: { rotulo: 'Emprestada', classe: 'bg-warning/10 text-warning border-warning/30', ponto: 'bg-warning' },
  manutencao: { rotulo: 'Manutenção', classe: 'bg-destructive/10 text-destructive border-destructive/30', ponto: 'bg-destructive' },
  inativa:    { rotulo: 'Inativa', classe: 'bg-muted text-muted-foreground border-border', ponto: 'bg-muted-foreground' },
}

export const CATEGORIAS_FERRAMENTA = [
  ['manual', 'Ferramenta manual'],
  ['eletrica', 'Ferramenta elétrica'],
  ['medicao', 'Medição'],
  ['seguranca', 'Equipamento de segurança'],
  ['outro', 'Outro'],
] as const

// Devolução prevista: coluna date (meia-noite UTC) — mostrar o dia sem conversão de fuso
export function fmtPrevista(d: Date | undefined): string {
  return d ? d.toLocaleDateString('pt-PT', { timeZone: 'UTC' }) : '—'
}
