import type { RoleUtilizador } from '@/features/auth/AuthContext'

// Quem decide o que cada pessoa vê no Início. Só conforto de navegação: o que cada
// um pode ler ou escrever continua a decidir-se na RLS.
export type SecaoInicio = 'veiculo' | 'frota' | 'armazem' | 'combustivel' | 'obras' | 'consulta'

export type CapacidadesInicio = {
  role: RoleUtilizador | null
  podeArmazem: boolean
  podeFrota: boolean
  podeCombustivel: boolean
  podeObras: boolean
  podeSubempreitadas: boolean
  // Aprovador designado dos pedidos de combustível
  podeAprovar: boolean
  // Tem uma viatura atribuída (Frota → Entregar)
  temVeiculo: boolean
}

// O CEO é o administrador: só ele tem o Dashboard executivo (P&L, stock, movimentos)
export const ehPainelExecutivo = (role: RoleUtilizador | null): boolean => role === 'admin'

export function secoesDoInicio(c: CapacidadesInicio): SecaoInicio[] {
  if (c.role == null || ehPainelExecutivo(c.role)) return []
  const secoes: SecaoInicio[] = []
  if (c.temVeiculo || c.role === 'motorista') secoes.push('veiculo')
  if (c.podeFrota) secoes.push('frota')
  if (c.podeArmazem) secoes.push('armazem')
  if (c.podeCombustivel || c.podeAprovar) secoes.push('combustivel')
  if (c.podeObras || c.podeSubempreitadas) secoes.push('obras')
  if (c.role === 'leitura') secoes.push('consulta')
  return secoes
}

export type Atalho = { to: string; rotulo: string; tom: 'saida' | 'entrada' | 'primario' | 'neutro' }

// O mecânico está isolado na Frota e a leitura só consulta: nenhum dos dois pede combustível
const podePedirCombustivel = (role: RoleUtilizador | null) => role != null && role !== 'leitura' && role !== 'mecanico'

export function atalhosDoInicio(c: CapacidadesInicio): Atalho[] {
  if (c.role == null || ehPainelExecutivo(c.role)) return []
  const atalhos: Atalho[] = []
  if (c.podeArmazem) {
    atalhos.push({ to: '/armazem/movimento/saida', rotulo: 'Registar saída', tom: 'saida' })
    atalhos.push({ to: '/armazem/movimento/entrada', rotulo: 'Registar entrada', tom: 'entrada' })
  }
  if (c.podeFrota) {
    atalhos.push({ to: '/frota/entregar', rotulo: 'Entregar viatura', tom: 'primario' })
    atalhos.push({ to: '/frota/devolver', rotulo: 'Devolver viatura', tom: 'neutro' })
    atalhos.push({ to: '/frota/manutencao/nova', rotulo: 'Nova manutenção', tom: 'neutro' })
  }
  if (podePedirCombustivel(c.role)) {
    atalhos.push({ to: '/abastecimento/pedir', rotulo: 'Pedir combustível', tom: 'primario' })
  }
  return atalhos
}

const ROTULOS: Partial<Record<RoleUtilizador, string>> = {
  admin: 'Administrador', gestor: 'Encarregado', armazem: 'Armazém', medicoes: 'Medições',
  mecanico: 'Mecânico', motorista: 'Motorista', leitura: 'Consulta',
}

export const rotuloDoPapel = (role: RoleUtilizador | null): string => (role && ROTULOS[role]) || 'Colaborador'

export function saudacao(hora: number): string {
  if (hora < 12) return 'Bom dia'
  if (hora < 20) return 'Boa tarde'
  return 'Boa noite'
}
