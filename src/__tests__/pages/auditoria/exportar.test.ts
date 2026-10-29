import { vi, describe, it, expect } from 'vitest'
import { supabase } from '@/integrations/supabase/client'
import { exportarAuditoria } from '@/app/pages/auditoria/dados'

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }))

// Simula o max_rows do PostgREST: nunca devolve mais do que `max` linhas por pedido
function servidor(total: number, max: number) {
  const chamadas: [number, number][] = []
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'order', 'gte', 'lt', 'like', 'eq', 'or']) b[m] = () => b
  b.range = (de: number, ate: number) => {
    chamadas.push([de, ate])
    const n = Math.max(0, Math.min(ate - de + 1, max, total - de))
    return Promise.resolve({ data: Array.from({ length: n }, (_, i) => ({ id: String(de + i) })), error: null })
  }
  vi.mocked(supabase.from).mockReturnValue(b as never)
  return chamadas
}

describe('exportarAuditoria', () => {
  it('pagina para além do corte de 1000 linhas', async () => {
    servidor(3200, 1000)
    expect(await exportarAuditoria({})).toHaveLength(3200)
  })

  it('pára no limite de 5000 linhas', async () => {
    const chamadas = servidor(9000, 1000)
    expect(await exportarAuditoria({})).toHaveLength(5000)
    expect(Math.max(...chamadas.map(c => c[1]))).toBeLessThanOrEqual(4999)
  })

  it('funciona com max_rows de 500', async () => {
    servidor(1300, 500)
    expect(await exportarAuditoria({})).toHaveLength(1300)
  })
})
