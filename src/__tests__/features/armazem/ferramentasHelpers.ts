import type { Ferramenta } from '@/features/ferramentas/services/ferramentasService'
import type { Emprestimo } from '@/features/ferramentas/services/emprestimosService'

export const dia = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() + n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const ferr = (o: Partial<Ferramenta> & { id: string }): Ferramenta => ({
  code: `F-${o.id}`, name: `Ferramenta ${o.id}`, category: 'eletrica', status: 'disponivel', active: true, nova: false,
  createdAt: new Date(), updatedAt: new Date(), ...o,
})

export const emp = (o: Partial<Emprestimo> & { id: string; toolId: string }): Emprestimo => ({
  toolName: 'X', toolCode: 'F', employeeName: 'Carlos', loanDate: new Date('2026-09-20T09:00:00Z'),
  status: 'ativo', deliveredBy: 'Admin', ...o,
})
