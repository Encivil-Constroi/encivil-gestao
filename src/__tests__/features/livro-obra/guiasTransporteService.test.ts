import { vi, describe, it, expect, beforeEach } from 'vitest'
import { supabase } from '@/integrations/supabase/client'
import {
  listarGuias,
  criarGuia,
  actualizarEstadoGuia,
} from '@/features/livro-obra/services/guiasTransporteService'

// ── Supabase mock ─────────────────────────────────────────────────────────────

const b = vi.hoisted(() => {
  const builder = {
    select: vi.fn(),
    update: vi.fn(),
    eq:     vi.fn(),
    order:  vi.fn(),
  }
  builder.select.mockReturnValue(builder)
  builder.update.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  return builder
})

const rpcMock = vi.hoisted(() => vi.fn())

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), rpc: rpcMock },
}))

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(supabase.from).mockReturnValue(b as never)
  b.select.mockReturnValue(b)
  b.update.mockReturnValue(b)
  b.eq.mockReturnValue(b)
  b.order.mockReturnValue(b)
})

// ── Fixtures ──────────────────────────────────────────────────────────────────

const GUIA_ROW = {
  id:           'g-1',
  numero:       'GT-0001',
  obra_id:      'obra-1',
  viatura_id:   null,
  motorista_id: null,
  origem:       'Armazém Central',
  destino:      'Obra A',
  data_carga:   '2026-09-17',
  estado:       'EMITIDA',
  linhas:       [{ descricao: 'Cimento', quantidade: 50, unidade: 'sc' }],
  created_at:   '2026-09-17T09:00:00Z',
}

// ── listarGuias ───────────────────────────────────────────────────────────────

describe('listarGuias', () => {
  it('retorna lista mapeada para camelCase', async () => {
    b.order.mockResolvedValueOnce({ data: [GUIA_ROW], error: null })

    const result = await listarGuias('obra-1')

    expect(result).toHaveLength(1)
    expect(result[0].numero).toBe('GT-0001')
    expect(result[0].obraId).toBe('obra-1')
    expect(result[0].estado).toBe('EMITIDA')
    expect(result[0].linhas).toHaveLength(1)
    expect(result[0].linhas[0].descricao).toBe('Cimento')
  })

  it('retorna lista vazia quando não há guias', async () => {
    b.order.mockResolvedValueOnce({ data: [], error: null })

    const result = await listarGuias('obra-1')
    expect(result).toHaveLength(0)
  })

  it('propaga erro do Supabase', async () => {
    b.order.mockResolvedValueOnce({ data: null, error: { message: 'db error' } })

    await expect(listarGuias('obra-1')).rejects.toMatchObject({ message: 'db error' })
  })
})

// ── criarGuia ─────────────────────────────────────────────────────────────────

describe('criarGuia', () => {
  it('chama a RPC criar_guia_transporte e retorna o UUID', async () => {
    rpcMock.mockResolvedValueOnce({ data: 'g-2', error: null })

    const id = await criarGuia({
      obraId:    'obra-1',
      dataCarga: '2026-09-17',
      linhas:    [{ descricao: 'Areia', quantidade: 10, unidade: 't' }],
    })

    expect(id).toBe('g-2')
    expect(rpcMock).toHaveBeenCalledWith('criar_guia_transporte', expect.objectContaining({
      p_obra_id:    'obra-1',
      p_data_carga: '2026-09-17',
    }))
  })

  it('numeração sequencial — RPC chamada com linhas corretas', async () => {
    rpcMock.mockResolvedValueOnce({ data: 'g-3', error: null })

    await criarGuia({
      obraId:    'obra-1',
      origem:    'Armazém',
      destino:   'Obra B',
      dataCarga: '2026-09-18',
      linhas:    [
        { descricao: 'Tijolo', quantidade: 1000, unidade: 'un' },
        { descricao: 'Argamassa', quantidade: 20, unidade: 'sc' },
      ],
    })

    const call = rpcMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(call[1].p_linhas).toHaveLength(2)
    expect(call[1].p_origem).toBe('Armazém')
    expect(call[1].p_destino).toBe('Obra B')
  })

  it('propaga erro da RPC', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'lock timeout' } })

    await expect(criarGuia({ obraId: 'obra-1', dataCarga: '2026-09-17', linhas: [] }))
      .rejects.toMatchObject({ message: 'lock timeout' })
  })
})

// ── actualizarEstadoGuia ──────────────────────────────────────────────────────

describe('actualizarEstadoGuia', () => {
  it('actualiza o estado para ENTREGUE', async () => {
    b.eq.mockResolvedValueOnce({ error: null })

    await actualizarEstadoGuia('g-1', 'ENTREGUE')

    expect(b.update).toHaveBeenCalledWith({ estado: 'ENTREGUE' })
    expect(b.eq).toHaveBeenCalledWith('id', 'g-1')
  })

  it('actualiza o estado para ANULADA', async () => {
    b.eq.mockResolvedValueOnce({ error: null })

    await actualizarEstadoGuia('g-1', 'ANULADA')

    expect(b.update).toHaveBeenCalledWith({ estado: 'ANULADA' })
  })

  it('propaga erro do Supabase', async () => {
    b.eq.mockResolvedValueOnce({ error: { message: 'permission denied' } })

    await expect(actualizarEstadoGuia('g-1', 'ENTREGUE'))
      .rejects.toMatchObject({ message: 'permission denied' })
  })
})
