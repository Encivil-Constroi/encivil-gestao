import { useRole } from '@/features/auth/useRole'

// Espelha as policies de registos_obra e guias_transporte (migration 20261020120000).
export const ROLES_ESCRITA_LIVRO_OBRA = ['admin', 'gestor', 'armazem', 'medicoes'] as const

export function usePodeEscreverLivroObra(): boolean {
  const { role } = useRole()
  return role != null && (ROLES_ESCRITA_LIVRO_OBRA as readonly string[]).includes(role)
}
