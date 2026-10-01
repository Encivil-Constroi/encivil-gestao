import {
  ShoppingCart, Undo2, Building, PlusCircle, ClipboardCheck, HardHat, Receipt, AlertTriangle,
  ArrowDownCircle, ArrowUpCircle, ClipboardEdit, type LucideIcon,
} from 'lucide-react'
import type { SubtipoMovimento } from '@/app/lib/armazemDb'
import type { MovementType } from '@/app/types'

type Visual = { Icone: LucideIcon; cor: string; fundo: string }

const ENTRADA = { cor: 'text-success', fundo: 'bg-success/12' }
const SAIDA = { cor: 'text-primary', fundo: 'bg-primary/10' }

const POR_SUBTIPO: Record<SubtipoMovimento, Visual> = {
  COMPRA: { Icone: ShoppingCart, ...ENTRADA },
  DEVOLUCAO_OBRA: { Icone: Undo2, ...ENTRADA },
  PROPRIO_ENCIVIL: { Icone: Building, ...ENTRADA },
  ACERTO: { Icone: PlusCircle, ...ENTRADA },
  INVENTARIO: { Icone: ClipboardCheck, cor: 'text-warning', fundo: 'bg-warning/12' },
  OBRA: { Icone: HardHat, ...SAIDA },
  VENDA: { Icone: Receipt, ...SAIDA },
  QUEBRA: { Icone: AlertTriangle, cor: 'text-destructive', fundo: 'bg-destructive/10' },
}

export function visualMovimento(tipo: MovementType, subtipo: SubtipoMovimento | null): Visual {
  if (subtipo) return POR_SUBTIPO[subtipo]
  if (tipo === 'entrada') return { Icone: ArrowDownCircle, ...ENTRADA }
  if (tipo === 'saida') return { Icone: ArrowUpCircle, ...SAIDA }
  return { Icone: ClipboardEdit, cor: 'text-warning', fundo: 'bg-warning/12' }
}
