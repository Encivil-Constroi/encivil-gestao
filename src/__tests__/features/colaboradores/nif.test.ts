import { vi, describe, it, expect, beforeEach } from 'vitest'
import {
  SELECT_COLABORADOR, obterNif, atualizarColaborador,
} from '@/features/colaboradores/services/colaboradoresService'
import { camposNif } from '@/features/colaboradores/lib/nif'

const m = vi.hoisted(() => {
  const b = {
    select: vi.fn(), update: vi.fn(), eq: vi.fn(), single: vi.fn(),
  }
  b.select.mockReturnValue(b)
  b.update.mockReturnValue(b)
  b.eq.mockReturnValue(b)
  return { b, rpc: vi.fn(), from: vi.fn() }
})

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: m.from, rpc: m.rpc },
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.from.mockReturnValue(m.b)
  m.b.select.mockReturnValue(m.b)
  m.b.update.mockReturnValue(m.b)
  m.b.eq.mockReturnValue(m.b)
})

describe('SELECT_COLABORADOR', () => {
  it('não pede nif nem *', () => {
    expect(SELECT_COLABORADOR).not.toMatch(/\bnif\b/)
    expect(SELECT_COLABORADOR).not.toContain('*')
    expect(SELECT_COLABORADOR).toMatch(/\bnome\b/)
  })
})

describe('obterNif', () => {
  it('usa a RPC colaborador_nif', async () => {
    m.rpc.mockResolvedValue({ data: '123456789', error: null })
    expect(await obterNif('c1')).toBe('123456789')
    expect(m.rpc).toHaveBeenCalledWith('colaborador_nif', { p_id: 'c1' })
    expect(m.from).not.toHaveBeenCalled()
  })

  it('RPC sem permissão devolve null (não cai na coluna)', async () => {
    m.rpc.mockResolvedValue({ data: null, error: null })
    expect(await obterNif('c1')).toBeNull()
    expect(m.from).not.toHaveBeenCalled()
  })

  it.each(['PGRST202', '42883'])('BD antiga (%s): lê a coluna nif diretamente', async (code) => {
    m.rpc.mockResolvedValue({ data: null, error: { code, message: 'função não existe' } })
    m.b.single.mockResolvedValue({ data: { nif: '987654321' }, error: null })
    expect(await obterNif('c1')).toBe('987654321')
    expect(m.from).toHaveBeenCalledWith('colaboradores')
    expect(m.b.select).toHaveBeenCalledWith('nif')
    expect(m.b.eq).toHaveBeenCalledWith('id', 'c1')
  })

  it('outros erros da RPC propagam', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } })
    await expect(obterNif('c1')).rejects.toMatchObject({ code: '42501' })
    expect(m.from).not.toHaveBeenCalled()
  })
})

describe('guardar a ficha sem mexer no NIF não o envia', () => {
  it('camposNif só inclui nif quando o campo foi alterado', () => {
    expect(camposNif('', false)).toEqual({})
    expect(camposNif('123456789', false)).toEqual({})
    expect(camposNif('123456789', true)).toEqual({ nif: '123456789' })
    expect(camposNif('', true)).toEqual({ nif: '' })
  })

  it('atualizarColaborador sem nif não põe nif no patch e lê de volta sem nif', async () => {
    m.b.single.mockResolvedValue({ data: {
      id: 'c1', nome: 'Rui', numero_mecan: 'M1', cargo: 'X', obra_id: null, user_id: null, ativo: true,
      notas: null, telemovel: null, email: null, foto_path: null, setor: null, created_at: '2026-01-01T00:00:00Z', obras: null,
    }, error: null })
    await atualizarColaborador('c1', { nome: 'Rui', cargo: 'X', ...camposNif('', false) })
    expect(m.b.update.mock.calls[0][0]).not.toHaveProperty('nif')
    expect(m.b.select).toHaveBeenCalledWith(SELECT_COLABORADOR)
  })
})
