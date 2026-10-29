import { vi, describe, it, expect, beforeEach } from 'vitest'
import { registarPicagemOffline, registarPicagem, registarPicagemGeofence } from '@/features/picagens/services/picagensService'

const b = vi.hoisted(() => ({ insert: vi.fn(), rpc: vi.fn(), maybeSingle: vi.fn() }))

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: b.rpc,
    from: () => ({ insert: (l: unknown) => { b.insert(l); return { select: () => ({ maybeSingle: b.maybeSingle }) } } }),
  },
}))

beforeEach(() => { vi.clearAllMocks() })

const item = { colaboradorId: 'c1', obraId: 'o1', tipo: 'ENTRADA' as const, timestampDispositivo: '2026-10-28T08:00:00.000Z', clientId: 'cid-1' }
const linha = { id: 'p1', colaborador_id: 'c1', obra_id: 'o1', tipo: 'ENTRADA', timestamp_dispositivo: item.timestampDispositivo, resultado: 'PENDENTE_VALIDACAO', origem: 'OFFLINE', timestamp_servidor: null, colaboradores: null, obras: null }

describe('picagens: client_id', () => {
  it('o mesmo item reenviado 2x usa o mesmo client_id', async () => {
    b.maybeSingle.mockResolvedValue({ data: linha, error: null })
    await registarPicagemOffline(item, new Date())
    await registarPicagemOffline(item, new Date())
    expect(b.insert.mock.calls.map(c => (c[0] as { client_id: string }).client_id)).toEqual(['cid-1', 'cid-1'])
  })

  it('data null sem erro = já registada (devolve null, não lança)', async () => {
    b.maybeSingle.mockResolvedValue({ data: null, error: null })
    expect(await registarPicagemOffline(item, new Date())).toBeNull()
    expect(await registarPicagem(item)).toBeNull()
  })

  it('BD antiga: INSERT com PGRST204/42703 repete sem client_id', async () => {
    for (const code of ['PGRST204', '42703']) {
      b.insert.mockClear()
      b.maybeSingle.mockResolvedValueOnce({ data: null, error: { code, message: 'x' } }).mockResolvedValueOnce({ data: linha, error: null })
      await registarPicagem(item)
      expect(b.insert).toHaveBeenCalledTimes(2)
      expect(b.insert.mock.calls[0][0]).toHaveProperty('client_id', 'cid-1')
      expect(b.insert.mock.calls[1][0]).not.toHaveProperty('client_id')
    }
  })

  it('23505 propaga (erro definitivo, sem repetir)', async () => {
    b.maybeSingle.mockResolvedValue({ data: null, error: { code: '23505', message: 'dup' } })
    await expect(registarPicagem(item)).rejects.toMatchObject({ code: '23505' })
    expect(b.insert).toHaveBeenCalledTimes(1)
  })

  it('RPC leva p_client_id e, em BD antiga (PGRST202/42883), repete sem ele', async () => {
    const gps = { ...item, lat: 1, lon: 2, precisaoM: 3 }
    for (const code of ['PGRST202', '42883']) {
      b.rpc.mockReset()
      b.rpc.mockResolvedValueOnce({ data: null, error: { code, message: 'x' } })
        .mockResolvedValueOnce({ data: { id: 'p', resultado: 'AUTORIZADA', distancia_m: 1 }, error: null })
      await registarPicagemGeofence(gps)
      expect(b.rpc.mock.calls[0][1]).toHaveProperty('p_client_id', 'cid-1')
      expect(b.rpc.mock.calls[1][1]).not.toHaveProperty('p_client_id')
    }
  })
})

describe('picagens: rpc chamada com this do cliente', () => {
  it('registarPicagemGeofence chama supabase.rpc como método (this preservado)', async () => {
    const { supabase } = await import('@/integrations/supabase/client')
    const cliente = supabase as unknown as { rpc: unknown }
    const original = cliente.rpc
    cliente.rpc = function (this: unknown, name: string, params: unknown) {
      if (this !== supabase) throw new TypeError("Cannot read properties of undefined (reading 'rest')")
      return b.rpc(name, params)
    }
    b.rpc.mockResolvedValue({ data: { id: 'p', resultado: 'AUTORIZADA', distancia_m: 1 }, error: null })
    try {
      const r = await registarPicagemGeofence({ ...item, lat: 1, lon: 2, precisaoM: 3 })
      expect(r.id).toBe('p')
    } finally { cliente.rpc = original }
  })
})
