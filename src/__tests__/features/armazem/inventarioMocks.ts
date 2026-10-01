import type { ProdutoArmazem } from '@/features/produtos/services/produtosService'

export function produto(p: Partial<ProdutoArmazem> = {}): ProdutoArmazem {
  return {
    id: 'p1', code: 'P001', name: 'Cimento Portland', category: 'cimento', unit: 'saco',
    currentStock: 50, minStock: 10, unitCost: 5, status: 'normal', notes: undefined,
    fotoPath: null, localizacao: 'Corredor A', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
    ...p,
  }
}
