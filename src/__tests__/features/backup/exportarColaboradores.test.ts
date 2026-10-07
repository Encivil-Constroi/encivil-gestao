import { vi, describe, it, expect } from 'vitest'

const select = vi.hoisted(() => vi.fn())
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(() => ({ select: (c: string) => { select(c); return { range: () => Promise.resolve({ data: [], error: null }) } } })) },
}))

import { exportarTabela, colunasBackup } from '@/features/backup/backupService'

describe('backup de colaboradores', () => {
  it('seleciona colunas explícitas, sem * nem nif', async () => {
    await exportarTabela('colaboradores')
    const cols = select.mock.calls[0][0] as string
    expect(cols).not.toContain('*')
    expect(cols.split(',').map(c => c.trim())).not.toContain('nif')
    expect(cols).not.toContain('obras(')
  })

  it('as outras tabelas continuam com *', () => {
    expect(colunasBackup('obras')).toBe('*')
  })
})
