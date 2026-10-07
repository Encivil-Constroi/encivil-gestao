import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { supabase } from '@/integrations/supabase/client'
import { AuditoriaPage } from '@/app/pages/AuditoriaPage'

// Construtor de query encadeável e "await-ável", que regista as chamadas de filtro
const q = vi.hoisted(() => {
  const b: Record<string, ReturnType<typeof vi.fn>> & { then?: unknown } = {}
  for (const m of ['select', 'order', 'range', 'gte', 'ilike', 'like', 'eq']) b[m] = vi.fn(() => b)
  b.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], count: 0, error: null }).then(ok)
  return b
})

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

beforeEach(() => {
  vi.mocked(supabase.from).mockReturnValue(q as never)
  for (const m of ['select', 'order', 'range', 'gte', 'ilike', 'like', 'eq']) q[m].mockClear()
})

describe('AuditoriaPage — filtro por tabela', () => {
  it('filtra pelo prefixo da action e não pela coluna tabela (funciona com a BD antiga)', async () => {
    render(<AuditoriaPage />)
    const select = await screen.findByDisplayValue('Todas')
    expect(screen.getByRole('option', { name: 'aprovadores de combustível' })).toBeTruthy()

    fireEvent.change(select, { target: { value: 'comb_aprovadores' } })

    await waitFor(() => expect(q.like).toHaveBeenCalledWith('action', 'comb_aprovadores.%'))
    expect(q.eq).not.toHaveBeenCalledWith('tabela', expect.anything())
  })
})
