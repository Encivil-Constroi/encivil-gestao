import { lazy, Suspense } from 'react'
import { useRole } from '@/features/auth/useRole'
import { ehPainelExecutivo } from './secoes'
import { PainelPessoalPage } from './PainelPessoalPage'

// O Dashboard executivo só é descarregado por quem o vê (o CEO)
const DashboardPage = lazy(() => import('../DashboardPage').then(m => ({ default: m.DashboardPage })))

export function InicioPage() {
  const { role, loading } = useRole()
  if (loading) return null
  if (ehPainelExecutivo(role)) {
    return (
      <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
        <DashboardPage />
      </Suspense>
    )
  }
  return <PainelPessoalPage />
}
