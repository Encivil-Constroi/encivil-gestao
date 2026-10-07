import { describe, it, expect, vi } from 'vitest'

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }))
import { TABELAS_BACKUP } from '@/features/backup/backupService'

describe('TABELAS_BACKUP', () => {
  it('inclui os dados laborais (NISS/IBAN/contrato) no grupo RH', () => {
    expect(TABELAS_BACKUP.find(t => t.id === 'colaboradores_dados_laborais')?.grupo).toBe('RH')
  })
})
