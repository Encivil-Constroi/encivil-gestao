import { vi, describe, it, expect, beforeEach } from 'vitest'
import { supabase } from '@/integrations/supabase/client'
import {
  listarRegistos,
  criarRegisto,
  editarRegisto,
} from '@/features/livro-obra/services/livroObraService'

// ── Supabase mock ─────────────────────────────────────────────────────────────

const b = vi.hoisted(() => {
  const builder = {
    from:   vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    eq:     vi.fn(),
    order:  vi.fn(),
    single: vi.fn(),
  }
  builder.select.mockReturnValue(builder)
  builder.insert.mockReturnValue(builder)
  builder.update.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  return builder
})

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}))

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(supabase.from).mockReturnValue(b as never)
  b.select.mockReturnValue(b)
  b.insert.mockReturnValue(b)
  b.update.mockReturnValue(b)
  b.eq.mockReturnValue(b)
  b.order.mockReturnValue(b)
})

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ROW = {
  id:         'r-1',
  obra_id:    'obra-1',
  data:       '2026-09-17',
  categoria:  'OCORRENCIA',
  descricao:  'Chuva intensa suspendeu trabalhos',
  foto_keys:  [],
  autor_id:   'user-1',
  created_at: '2026-09-17T10:00:00Z',
}

// ── listarRegistos ────────────────────────────────────────────────────────────

// O serviço encadeia dois .order() — o primeiro retorna builder, o segundo resolve.
function setupOrder(result: { data: unknown; error: unknown }) {
  b.order
    .mockReturnValueOnce(b)                      // 1º .order('data', ...)
    .mockResolvedValueOnce(result)               // 2º .order('created_at', ...)
}

describe('listarRegistos', () => {
  it('retorna lista mapeada para camelCase', async () => {
    setupOrder({ data: [ROW], error: null })

    const result = await listarRegistos('obra-1')

    expect(result).toHaveLength(1)
    expect(result[0].obraId).toBe('obra-1')
    expect(result[0].categoria).toBe('OCORRENCIA')
    expect(result[0].fotoKeys).toEqual([])
    expect(result[0].autorId).toBe('user-1')
  })

  it('retorna lista vazia quando não há registos', async () => {
    setupOrder({ data: [], error: null })

    const result = await listarRegistos('obra-1')
    expect(result).toHaveLength(0)
  })

  it('aplica filtro de categoria quando fornecido', async () => {
    setupOrder({ data: [ROW], error: null })

    await listarRegistos('obra-1', 'OCORRENCIA')

    // .eq('obra_id') + .eq('categoria') = 2 chamadas eq
    expect(b.eq).toHaveBeenCalledTimes(2)
    expect(b.eq).toHaveBeenCalledWith('categoria', 'OCORRENCIA')
  })

  it('não aplica filtro de categoria quando não fornecido', async () => {
    setupOrder({ data: [], error: null })

    await listarRegistos('obra-1')

    expect(b.eq).toHaveBeenCalledTimes(1)
    expect(b.eq).not.toHaveBeenCalledWith('categoria', expect.anything())
  })

  it('propaga erro do Supabase', async () => {
    setupOrder({ data: null, error: { message: 'timeout' } })

    await expect(listarRegistos('obra-1')).rejects.toMatchObject({ message: 'timeout' })
  })
})

// ── criarRegisto ──────────────────────────────────────────────────────────────

describe('criarRegisto', () => {
  it('insere o registo e retorna entidade mapeada', async () => {
    b.single.mockResolvedValueOnce({ data: ROW, error: null })
    b.select.mockReturnValue(b)

    const result = await criarRegisto('user-1', {
      obraId:    'obra-1',
      data:      '2026-09-17',
      categoria: 'OCORRENCIA',
      descricao: 'Chuva intensa suspendeu trabalhos',
    })

    expect(result.id).toBe('r-1')
    expect(result.descricao).toBe('Chuva intensa suspendeu trabalhos')
    expect(b.insert).toHaveBeenCalledWith(expect.objectContaining({
      obra_id:  'obra-1',
      autor_id: 'user-1',
      categoria: 'OCORRENCIA',
    }))
  })

  it('registo sem fotos define foto_keys como array vazio', async () => {
    b.single.mockResolvedValueOnce({ data: { ...ROW, foto_keys: [] }, error: null })

    const result = await criarRegisto('user-1', {
      obraId:    'obra-1',
      data:      '2026-09-17',
      categoria: 'VISITA',
      descricao: 'Visita de fiscalização',
      // fotoKeys omitido
    })

    expect(result.fotoKeys).toEqual([])
    expect(b.insert).toHaveBeenCalledWith(expect.objectContaining({
      foto_keys: [],
    }))
  })

  it('propaga erro de inserção', async () => {
    b.single.mockResolvedValueOnce({ data: null, error: { message: 'RLS block' } })

    await expect(criarRegisto('user-1', {
      obraId: 'obra-1', data: '2026-09-17', categoria: 'VISITA', descricao: 'Teste',
    })).rejects.toMatchObject({ message: 'RLS block' })
  })
})

// ── editarRegisto ─────────────────────────────────────────────────────────────

describe('editarRegisto', () => {
  it('actualiza apenas os campos fornecidos', async () => {
    b.single.mockResolvedValueOnce({ data: { ...ROW, descricao: 'Actualizado' }, error: null })

    const result = await editarRegisto('r-1', { descricao: 'Actualizado' })

    expect(result.descricao).toBe('Actualizado')
    const patch = (b.update.mock.calls[0] as [Record<string, unknown>][])[0]
    expect(patch).toHaveProperty('descricao', 'Actualizado')
    expect(patch).not.toHaveProperty('obra_id')
  })

  it('propaga erro de actualização', async () => {
    b.single.mockResolvedValueOnce({ data: null, error: { message: 'update error' } })

    await expect(editarRegisto('r-1', { descricao: 'X' }))
      .rejects.toMatchObject({ message: 'update error' })
  })
})
