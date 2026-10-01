import { Navigate } from 'react-router'
import { useRole } from '@/features/auth/useRole'

export function SubWriteGuard({ children }: { children: React.ReactNode }) {
  const { loading, podeSubempreitadas } = useRole()
  if (loading) return null
  return podeSubempreitadas ? <>{children}</> : <Navigate to="/obras/subempreitadas" replace />
}
