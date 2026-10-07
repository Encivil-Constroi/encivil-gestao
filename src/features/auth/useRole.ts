import { useAuth } from './AuthContext'
import type { RoleUtilizador } from './AuthContext'
import { MATRIZ_ESCRITA, type Modulo } from './lib/permissoes'

export { MATRIZ_ESCRITA, type Modulo }

export function useRole() {
  const { profile, loading } = useAuth()
  const role = (profile?.role ?? null) as RoleUtilizador | null

  const podeEscrever = (modulo: Modulo): boolean =>
    role != null && MATRIZ_ESCRITA[modulo].includes(role)

  return {
    role,
    loading,
    isAdmin:  role === 'admin',
    isGestor: role === 'gestor',
    nome:     profile?.nome ?? '',
    // Capacidades de escrita por módulo (espelham a RLS)
    podeEscrever,
    podeArmazem:        podeEscrever('armazem'),
    podeFerramentas:    podeEscrever('ferramentas'),
    podeCombustivel:    podeEscrever('combustivel'),
    podeObras:          podeEscrever('obras'),
    podeSubempreitadas: podeEscrever('subempreitadas'),
    podeColaboradores:  podeEscrever('colaboradores'),
    podeFrota:          podeEscrever('frota'),
    // O mecânico só vê a Frota (ver MainLayout e Sidebar)
    isMecanico: role === 'mecanico',
    // O motorista só pede abastecimentos e vê os seus pedidos (idem)
    isMotorista: role === 'motorista',
    // Só admin valida (rascunho -> validado)
    podeValidar: role === 'admin',
  }
}
