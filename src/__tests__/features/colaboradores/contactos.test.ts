import { vi, describe, it, expect, beforeEach } from 'vitest'
import {
  SELECT_COLABORADOR, listarColaboradores, buscarColaborador, buscarMeuColaborador, criarColaborador,
} from '@/features/colaboradores/services/colaboradoresService'

const m = vi.hoisted(() => {
  const b = {
    select: vi.fn(), insert: vi.fn(), order: vi.fn(), eq: vi.fn(), limit: vi.fn(),
    single: vi.fn(), maybeSingle: vi.fn(), range: vi.fn(),
  }
  // A RPC é lida por páginas: rpc().order().range() — range() é terminal
  const rpcB = { order: vi.fn(), range: vi.fn() }
  return { b, rpcB, rpc: vi.fn(), from: vi.fn() }
})

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: m.from, rpc: m.rpc },
}))

const row = {
  id: 'c1', nome: 'João Silva', numero_mecan: 'ENC-001', cargo: 'Pedreiro', obra_id: null, user_id: 'u1',
  ativo: true, foto_path: null, setor: null, created_at: '2026-07-30T10:00:00Z', obras: null,
}
const contactos = { id: 'c1', telemovel: '912345678', email: 'joao@x.pt', notas: 'tem carta' }

beforeEach(() => {
  vi.clearAllMocks()
  m.from.mockReturnValue(m.b)
  for (const k of ['select', 'insert', 'order', 'eq', 'limit'] as const) m.b[k].mockReturnValue(m.b)
  m.rpc.mockReturnValue(m.rpcB)
  m.rpcB.order.mockReturnValue(m.rpcB)
  m.rpcB.range.mockResolvedValue({ data: [], error: null })
})

describe('contactos de colaboradores via RPC', () => {
  it('SELECT_COLABORADOR não pede telemovel, email nem notas', () => {
    expect(SELECT_COLABORADOR).not.toMatch(/\b(telemovel|email|notas)\b/)
  })

  it('listarColaboradores junta os contactos da RPC por id', async () => {
    m.b.range.mockResolvedValueOnce({ data: [row, { ...row, id: 'c2' }], error: null }).mockResolvedValue({ data: [], error: null })
    m.rpcB.range.mockResolvedValueOnce({ data: [contactos], error: null }).mockResolvedValue({ data: [], error: null })
    const r = await listarColaboradores()
    expect(m.rpc).toHaveBeenCalledTimes(2) // contactos: uma por página, a 2.ª vem vazia
    expect(m.rpc).toHaveBeenCalledWith('colaboradores_contactos')
    expect(m.b.select).toHaveBeenCalledTimes(2) // uma por página: a 2.ª vem vazia
    expect(r[0]).toMatchObject({ telemovel: '912345678', email: 'joao@x.pt', notas: 'tem carta' })
    expect(r[1].telemovel).toBeUndefined()
  })

  it.each(['PGRST202', '42883'])('BD antiga (%s): lê id, telemovel, email, notas da tabela', async (code) => {
    m.rpcB.range.mockResolvedValue({ data: null, error: { code, message: 'não existe' } })
    // ordem das chamadas a range(): lista (dados, vazia) e contactos antigos (dados, vazia)
    m.b.range.mockResolvedValueOnce({ data: [row], error: null }).mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [contactos], error: null }).mockResolvedValue({ data: [], error: null })
    const r = await listarColaboradores()
    expect(m.b.select).toHaveBeenCalledWith('id, telemovel, email, notas')
    expect(r[0].telemovel).toBe('912345678')
  })

  it('outro erro da RPC propaga', async () => {
    m.b.range.mockResolvedValueOnce({ data: [row], error: null }).mockResolvedValue({ data: [], error: null })
    m.rpcB.range.mockResolvedValue({ data: null, error: { code: '42501', message: 'sem permissão' } })
    await expect(listarColaboradores()).rejects.toMatchObject({ code: '42501' })
  })

  it('buscarColaborador junta os contactos', async () => {
    m.b.single.mockResolvedValue({ data: row, error: null })
    m.rpcB.range.mockResolvedValueOnce({ data: [contactos], error: null }).mockResolvedValue({ data: [], error: null })
    expect((await buscarColaborador('c1')).notas).toBe('tem carta')
  })

  it('buscarMeuColaborador junta os contactos e devolve null sem ficha', async () => {
    m.b.maybeSingle.mockResolvedValueOnce({ data: row, error: null }).mockResolvedValueOnce({ data: null, error: null })
    m.rpcB.range.mockResolvedValueOnce({ data: [contactos], error: null }).mockResolvedValue({ data: [], error: null })
    expect((await buscarMeuColaborador('u1'))?.email).toBe('joao@x.pt')
    expect(await buscarMeuColaborador('u9')).toBeNull()
  })

  it('criarColaborador devolve os contactos do input sem nova leitura', async () => {
    m.b.single.mockResolvedValue({ data: row, error: null })
    const r = await criarColaborador({ nome: 'João', cargo: 'Pedreiro', telemovel: ' 912345678 ', email: 'A@X.pt', notas: 'n' })
    expect(m.rpc).not.toHaveBeenCalled()
    expect(r).toMatchObject({ telemovel: '912345678', email: 'a@x.pt', notas: 'n' })
  })
})
