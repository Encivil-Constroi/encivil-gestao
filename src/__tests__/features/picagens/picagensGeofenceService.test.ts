import { vi, describe, it, expect, beforeEach } from 'vitest'
import {
  registarPicagemGeofence,
} from '@/features/picagens/services/picagensService'

const b = vi.hoisted(() => {
  const rpc = vi.fn()
  return { rpc }
})

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: b.rpc },
}))

beforeEach(() => { vi.clearAllMocks() })

const baseInput = {
  colaboradorId: 'colab-1',
  obraId:        'obra-1',
  tipo:          'ENTRADA' as const,
  timestampDispositivo: '2026-09-16T08:00:00.000Z',
  origem:        'ONLINE' as const,
  lat:            38.7223,
  lon:           -9.1399,
  precisaoM:     15,
}

describe('registarPicagemGeofence', () => {
  it('chama a RPC com os parâmetros corretos', async () => {
    b.rpc.mockResolvedValueOnce({
      data: { id: 'pic-1', resultado: 'AUTORIZADA', distancia_m: 42 },
      error: null,
    })

    const result = await registarPicagemGeofence(baseInput)

    expect(b.rpc).toHaveBeenCalledWith('registar_picagem_geofence', {
      p_colaborador_id: 'colab-1',
      p_obra_id:        'obra-1',
      p_tipo:           'ENTRADA',
      p_lat:            38.7223,
      p_lon:           -9.1399,
      p_precisao_m:    15,
      p_timestamp_disp: '2026-09-16T08:00:00.000Z',
    })

    expect(result).toEqual({
      id:         'pic-1',
      resultado:  'AUTORIZADA',
      distanciaM: 42,
    })
  })

  it('retorna distanciaM null quando a RPC retorna distancia_m null', async () => {
    b.rpc.mockResolvedValueOnce({
      data: { id: 'pic-2', resultado: 'PENDENTE_VALIDACAO', distancia_m: null },
      error: null,
    })

    const result = await registarPicagemGeofence(baseInput)

    expect(result.resultado).toBe('PENDENTE_VALIDACAO')
    expect(result.distanciaM).toBeNull()
  })

  it('propaga o erro devolvido pela RPC', async () => {
    b.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'permissão negada' },
    })

    await expect(registarPicagemGeofence(baseInput)).rejects.toMatchObject({
      message: 'permissão negada',
    })
  })

  it('mapeia resultado PENDENTE_VALIDACAO corretamente', async () => {
    b.rpc.mockResolvedValueOnce({
      data: { id: 'pic-3', resultado: 'PENDENTE_VALIDACAO', distancia_m: 350 },
      error: null,
    })

    const result = await registarPicagemGeofence({ ...baseInput, precisaoM: 80 })

    // GPS fraco (precisaoM > 50) → sempre PENDENTE mesmo que RPC retorne assim
    expect(result.resultado).toBe('PENDENTE_VALIDACAO')
    expect(result.distanciaM).toBe(350)
  })

  it('retorna AUTORIZADA quando dentro do raio com GPS preciso', async () => {
    b.rpc.mockResolvedValueOnce({
      data: { id: 'pic-4', resultado: 'AUTORIZADA', distancia_m: 18 },
      error: null,
    })

    const result = await registarPicagemGeofence({ ...baseInput, precisaoM: 10 })

    expect(result.resultado).toBe('AUTORIZADA')
    expect(result.distanciaM).toBe(18)
  })
})
