import {
  Package, Mountain, BrickWall, PaintBucket, Cylinder, Nut, Wrench, TreePine, type LucideIcon,
} from 'lucide-react'
import { urlFotoArmazem } from '@/app/lib/fotosArmazem'
import type { SubtipoMovimento } from '@/app/lib/armazemDb'
import type { MovementType, ProductCategory, StockStatus, Unit } from '@/app/types'

export const CATEGORIAS: [ProductCategory, string][] = [
  ['cimento', 'Cimento'],
  ['areia-brita', 'Areia e Brita'],
  ['tijolo-bloco', 'Tijolo e Bloco'],
  ['tinta', 'Tinta'],
  ['tubagem', 'Tubagem'],
  ['ferragem', 'Ferragem'],
  ['ferramenta', 'Ferramentas'],
  ['madeira', 'Madeira'],
  ['outro', 'Outro'],
]

export const UNIDADES: [Unit, string][] = [
  ['saco', 'Saco'],
  ['unidade', 'Unidade'],
  ['kg', 'Quilograma (kg)'],
  ['litro', 'Litro'],
  ['caixa', 'Caixa'],
  ['metro', 'Metro linear'],
  ['m2', 'Metro quadrado (m²)'],
  ['m3', 'Metro cúbico (m³)'],
]

const ICONES: Record<ProductCategory, LucideIcon> = {
  cimento: Package,
  'areia-brita': Mountain,
  'tijolo-bloco': BrickWall,
  tinta: PaintBucket,
  tubagem: Cylinder,
  ferragem: Nut,
  ferramenta: Wrench,
  madeira: TreePine,
  outro: Package,
}

export const ESTADO_STOCK: Record<StockStatus, { rotulo: string; texto: string; fundo: string; barra: string }> = {
  normal: { rotulo: 'Em stock', texto: 'text-success', fundo: 'bg-success/10 border-success/20', barra: 'bg-success' },
  baixo: { rotulo: 'Stock baixo', texto: 'text-warning', fundo: 'bg-warning/10 border-warning/20', barra: 'bg-warning' },
  'sem-stock': { rotulo: 'Sem stock', texto: 'text-destructive', fundo: 'bg-destructive/10 border-destructive/20', barra: 'bg-destructive' },
}

export function EstadoStock({ estado }: { estado: StockStatus }) {
  const e = ESTADO_STOCK[estado]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${e.fundo} ${e.texto}`}>
      {e.rotulo}
    </span>
  )
}

// A barra enche até ao dobro do mínimo: abaixo de metade já é "baixo"
export function percentagemStock(atual: number, minimo: number): number {
  if (atual <= 0) return 0
  const ref = minimo > 0 ? minimo * 2 : Math.max(atual, 1)
  return Math.min(100, Math.round((atual / ref) * 100))
}

export function BarraStock({ atual, minimo, estado }: { atual: number; minimo: number; estado: StockStatus }) {
  const pct = percentagemStock(atual, minimo)
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden" role="meter" aria-label="Stock face ao mínimo"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <div className={`h-full rounded-full ${ESTADO_STOCK[estado].barra}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function FotoProduto({
  fotoPath, categoria, nome, className = '', tamanhoIcone = 'w-10 h-10',
}: { fotoPath: string | null; categoria: ProductCategory; nome: string; className?: string; tamanhoIcone?: string }) {
  const url = urlFotoArmazem(fotoPath)
  if (url) return <img src={url} alt={nome} loading="lazy" className={`object-cover bg-muted ${className}`} />
  const Icone = ICONES[categoria] ?? Package
  return (
    <div className={`flex items-center justify-center bg-muted text-muted-foreground/60 ${className}`} data-testid="sem-foto">
      <Icone className={tamanhoIcone} aria-hidden="true" />
    </div>
  )
}

const ROTULO_SUBTIPO: Record<SubtipoMovimento, string> = {
  COMPRA: 'Compra',
  DEVOLUCAO_OBRA: 'Devolução de obra',
  PROPRIO_ENCIVIL: 'Próprio ENCIVIL',
  ACERTO: 'Acerto',
  OBRA: 'Para obra',
  VENDA: 'Venda',
  QUEBRA: 'Quebra',
  INVENTARIO: 'Inventário',
}

const ROTULO_TIPO: Record<MovementType, string> = { entrada: 'Entrada', saida: 'Saída', ajuste: 'Ajuste' }

// Registos anteriores ao armazém completo não têm subtipo
export function rotuloMovimento(tipo: MovementType, subtipo: SubtipoMovimento | null): string {
  return subtipo ? ROTULO_SUBTIPO[subtipo] : ROTULO_TIPO[tipo]
}

export const COR_TIPO: Record<MovementType, string> = {
  entrada: 'bg-success/10 text-success border-success/20',
  saida: 'bg-primary/10 text-primary border-primary/20',
  ajuste: 'bg-warning/10 text-warning border-warning/20',
}
