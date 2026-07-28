export type MovementType = 'entrada' | 'saida' | 'ajuste';

export type ProductCategory =
  | 'cimento'
  | 'areia-brita'
  | 'tijolo-bloco'
  | 'tinta'
  | 'tubagem'
  | 'ferragem'
  | 'ferramenta'
  | 'madeira'
  | 'outro';

export type Unit = 'saco' | 'unidade' | 'kg' | 'litro' | 'caixa' | 'metro' | 'm2' | 'm3';

export type StockStatus = 'normal' | 'baixo' | 'sem-stock';

export interface Product {
  id: string;
  code: string;
  name: string;
  category: ProductCategory;
  unit: Unit;
  currentStock: number;
  minStock: number;
  unitCost: number;
  status: StockStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Movement {
  id: string;
  productId: string;
  productName: string;
  type: MovementType;
  quantity: number;
  unit: Unit;
  responsible: string;
  destination?: string;
  obraId?: string;
  notes?: string;
  date: Date;
  previousStock: number;
  newStock: number;
}

export type LowStockItem = Pick<Product, 'id' | 'name' | 'unit' | 'currentStock' | 'minStock' | 'status'>;

export type ToolCategory =
  | 'manual'
  | 'eletrica'
  | 'medicao'
  | 'seguranca'
  | 'outro';

export type ToolStatus = 'disponivel' | 'emprestada' | 'manutencao' | 'inativa';

export interface Tool {
  id: string;
  code: string;
  name: string;
  category: ToolCategory;
  serialNumber?: string;
  estimatedValue?: number;
  status: ToolStatus;
  notes?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type LoanStatus = 'ativo' | 'devolvido';
export type ReturnCondition = 'bom_estado' | 'danificada' | 'perdida';

export interface ToolLoan {
  id: string;
  toolId: string;
  toolName: string;
  toolCode: string;
  employeeName: string;
  employeeDocument?: string;
  destination?: string;
  obraId?: string;
  loanDate: Date;
  expectedReturnDate?: Date;
  returnDate?: Date;
  status: LoanStatus;
  deliveryCondition?: string;
  returnCondition?: ReturnCondition;
  notes?: string;
  returnNotes?: string;
  deliveredBy: string;
  receivedBy?: string;
  deliverySignature?: string;
  returnSignature?: string;
  deliveredBySignature?: string;
  receivedBySignature?: string;
}

export interface DashboardStats {
  totalProducts: number;
  todayEntries: number;
  todayExits: number;
  lowStockProducts: number;
  recentMovements: Movement[];
  lowStockItems: LowStockItem[];
}

/* ─── Obras + Subempreiteiros (Fase 1) ─────────────────────────── */

export type ObraStatus = 'ativa' | 'concluida';

export interface Obra {
  id: string;
  name: string;
  client?: string;
  location?: string;
  status: ObraStatus;
  budget?: number;
  notes?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ContractType = 'global' | 'unitario';
export type ContractStatus = 'rascunho' | 'validado';

export interface SubcontractItem {
  id: string;
  subcontractorId: string;
  description: string;
  unit: string;
  unitPrice: number;
  plannedQuantity: number;
  isExtra: boolean;
}

export interface Subcontractor {
  id: string;
  obraId: string;
  obraName?: string;
  name: string;
  contact?: string;
  type: ContractType;
  globalValue?: number;   // usado quando type === 'global'
  conditions?: string;
  status: ContractStatus;
  createdAt: Date;
  updatedAt: Date;
  validatedAt?: Date;
  items?: SubcontractItem[];
  /** Valor total acordado: globalValue (global) ou soma dos artigos (unitário). */
  agreedValue: number;
}

/* ─── Combustível ──────────────────────────────────────────────── */

export type VehicleType = 'viatura' | 'maquina' | 'gerador' | 'outro';
export type FuelType = 'gasoleo' | 'gasolina' | 'adblue' | 'eletrico' | 'outro';
export type CounterUnit = 'km' | 'horas';

export interface Vehicle {
  id: string;
  code: string;
  name: string;
  type: VehicleType;
  identification?: string;
  fuelType: FuelType;
  counterUnit: CounterUnit;
  active: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FuelEntry {
  id: string;
  vehicleId: string;
  vehicleName?: string;
  vehicleCode?: string;
  counterUnit?: CounterUnit;
  obraId?: string;
  obraName?: string;
  date: Date;
  liters: number;
  totalCost: number;
  counter?: number;
  location?: string;
  responsible: string;
  notes?: string;
  createdAt: Date;
  /** Preço por litro derivado (custo / litros). */
  pricePerLiter: number;
}

export type MeasurementStatus = 'rascunho' | 'validado';

export interface MeasurementLine {
  id: string;
  autoId: string;
  itemId?: string;        // artigo do contrato (unitário); vazio se for extra
  description: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  isExtra: boolean;
}

export interface Measurement {
  id: string;
  subcontractorId: string;
  number: number;
  date: Date;
  periodPercentage?: number;   // usado no tipo global
  periodValue: number;         // valor executado neste auto
  notes?: string;
  status: MeasurementStatus;
  createdAt: Date;
  validatedAt?: Date;
  lines?: MeasurementLine[];
}
