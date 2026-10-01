import type { ResumoViaturaRow } from '@/features/frota/db'

let seq = 0

export function resumo(o: Partial<ResumoViaturaRow> = {}): ResumoViaturaRow {
  seq++
  return {
    id: `v${seq}`, codigo: `V${seq}`, nome: `Viatura ${seq}`, marca: 'Toyota', modelo: 'Hilux', identificacao: `00-AA-0${seq}`,
    tipo: 'viatura', unidade_contador: 'km', estado_operacional: 'LIVRE', obra_id: null, obra_nome: null,
    km_atual: 10000, condutor_id: null, condutor_nome: null, condutor_desde: null,
    data_fim_seguro: null, data_proxima_ipo: null, data_ultima_revisao: null,
    alertas_urgentes: 0, alertas_atencao: 0, ultimo_checklist_data: null, ultimo_checklist_estado: null, ...o,
  }
}

export function dataEm(dias: number, base: Date = new Date()): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dias)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function mockUseRole(papel: string) {
  return {
    role: papel, isAdmin: papel === 'admin', isGestor: papel === 'gestor', isMecanico: papel === 'mecanico',
    podeFrota: ['admin', 'gestor', 'mecanico'].includes(papel),
    podeCombustivel: ['admin', 'gestor', 'armazem'].includes(papel),
  }
}
