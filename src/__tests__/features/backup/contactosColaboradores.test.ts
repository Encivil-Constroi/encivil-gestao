import { vi, describe, it, expect, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({ select: vi.fn(), rpc: vi.fn(), resposta: vi.fn() }))
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: (c: string) => {
        m.select(c)
        const linhas = c.startsWith('id, telemovel')
          ? [{ id: 'c1', telemovel: '9', email: 'a@x.pt', notas: 'antiga' }]
          : [{ id: 'c1', nome: 'Ana' }]
        return { order: () => ({ range: (de: number) => Promise.resolve({ data: de === 0 ? linhas : [], error: null }) }) }
      },
    }),
    // colaboradores_contactos lida por páginas: rpc().order().range()
    rpc: (fn: string) => { m.rpc(fn); return { order: () => ({ range: () => m.resposta() }) } },
  },
}))

import { exportarTabela, colunasBackup } from '@/features/backup/backupService'

beforeEach(() => vi.clearAllMocks())

describe('backup de colaboradores: contactos por RPC', () => {
  it('as colunas da tabela não incluem telemovel, email nem notas', () => {
    expect(colunasBackup('colaboradores')).not.toMatch(/\b(telemovel|email|notas)\b/)
  })

  it('junta os contactos da RPC por id', async () => {
    m.resposta.mockResolvedValueOnce({ data: [{ id: 'c1', telemovel: '912', email: 'a@x.pt', notas: 'n' }], error: null }).mockResolvedValue({ data: [], error: null })
    const r = await exportarTabela('colaboradores')
    expect(m.rpc).toHaveBeenCalledWith('colaboradores_contactos')
    expect(r).toEqual([{ id: 'c1', nome: 'Ana', telemovel: '912', email: 'a@x.pt', notas: 'n' }])
  })

  it('BD antiga (PGRST202): lê os contactos da tabela', async () => {
    m.resposta.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'x' } })
    const r = await exportarTabela('colaboradores')
    expect(m.select).toHaveBeenCalledWith('id, telemovel, email, notas')
    expect(r).toEqual([{ id: 'c1', nome: 'Ana', telemovel: '9', email: 'a@x.pt', notas: 'antiga' }])
  })

  it('outras tabelas não chamam a RPC', async () => {
    await exportarTabela('obras')
    expect(m.rpc).not.toHaveBeenCalled()
  })
})
