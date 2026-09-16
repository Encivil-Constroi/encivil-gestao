import { vi, describe, it, expect, beforeEach } from 'vitest'
import { supabase } from '@/integrations/supabase/client'
import {
  listarObras,
  buscarObra,
  criarObra,
  atualizarObra,
} from '@/features/obras/services/obrasService'

const b = vi.hoisted(() => {
  const builder = {
    select: vi.fn(),
    order:  vi.fn(),
    eq:     vi.fn(),
    single: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  }
  builder.select.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.insert.mockReturnValue(builder)
  builder.update.mockReturnValue(builder)
  return builder
})

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}))

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(supabase.from).mockReturnValue(b as never)
  b.select.mockReturnValue(b)
  b.order.mockReturnValue(b)
  b.eq.mockReturnValue(b)
  b.insert.mockReturnValue(b)
  b.update.mockReturnValue(b)
})

const makeRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'obra-1',
  nome: 'Escola Primária',
  cliente: 'Câmara Municipal',
  localizacao: 'Lisboa',
  estado: 'ativa' as const,
  orcamento: 500000,
  observacoes: null,
  ativo: true,
  created_at: '2026-01-15T08:00:00Z',
  updated_at: '2026-06-01T12:00:00Z',
  geofence_tipo: null,
  geofence_centro: null,
  geofence_raio_m: null,
  geofence_poligono: null,
  ...overrides,
})

// ── listarObras ───────────────────────────────────────────────────────────────

describe('listarObras', () => {
  it('mapeia row para Obra com campos corretos', async () => {
    b.eq.mockResolvedValueOnce({ data: [makeRow()], error: null })

    const obras = await listarObras(true)

    expect(obras).toHaveLength(1)
    expect(obras[0]).toMatchObject({
      id: 'obra-1',
      name: 'Escola Primária',
      client: 'Câmara Municipal',
      location: 'Lisboa',
      status: 'ativa',
      budget: 500000,
      active: true,
    })
    expect(obras[0].createdAt).toBeInstanceOf(Date)
    expect(obras[0].updatedAt).toBeInstanceOf(Date)
  })

  it('listarObras(true) aplica filtro ativo=true', async () => {
    b.eq.mockResolvedValueOnce({ data: [], error: null })
    await listarObras(true)
    expect(b.eq).toHaveBeenCalledWith('ativo', true)
  })

  it('listarObras(false) não aplica filtro ativo', async () => {
    b.order.mockResolvedValueOnce({ data: [], error: null })
    await listarObras(false)
    expect(b.eq).not.toHaveBeenCalledWith('ativo', true)
  })

  it('mapeia campos opcionais null para undefined', async () => {
    b.eq.mockResolvedValueOnce({
      data: [makeRow({ cliente: null, localizacao: null, orcamento: null, observacoes: null })],
      error: null,
    })
    const [obra] = await listarObras(true)
    expect(obra.client).toBeUndefined()
    expect(obra.location).toBeUndefined()
    expect(obra.budget).toBeUndefined()
    expect(obra.notes).toBeUndefined()
  })

  it('extrai coordenadas de geofence do GeoJSON [lon, lat]', async () => {
    b.eq.mockResolvedValueOnce({
      data: [makeRow({
        geofence_tipo: 'RAIO',
        geofence_centro: { type: 'Point', coordinates: [-9.1393, 38.7223] },
        geofence_raio_m: 250,
      })],
      error: null,
    })
    const [obra] = await listarObras(true)
    expect(obra.geofenceTipo).toBe('RAIO')
    expect(obra.geofenceCentroLon).toBeCloseTo(-9.1393, 4)
    expect(obra.geofenceCentroLat).toBeCloseTo(38.7223, 4)
    expect(obra.geofenceRaioM).toBe(250)
  })

  it('propaga erro do Supabase', async () => {
    b.eq.mockResolvedValueOnce({ data: null, error: { message: 'permissão negada' } })
    await expect(listarObras()).rejects.toMatchObject({ message: 'permissão negada' })
  })
})

// ── buscarObra ────────────────────────────────────────────────────────────────

describe('buscarObra', () => {
  it('busca uma obra por id', async () => {
    b.single.mockResolvedValueOnce({ data: makeRow(), error: null })

    const obra = await buscarObra('obra-1')

    expect(obra.id).toBe('obra-1')
    expect(obra.name).toBe('Escola Primária')
    expect(b.eq).toHaveBeenCalledWith('id', 'obra-1')
  })

  it('propaga erro quando obra não existe', async () => {
    b.single.mockResolvedValueOnce({ data: null, error: { message: 'Nenhuma linha retornada' } })
    await expect(buscarObra('inexistente')).rejects.toMatchObject({ message: 'Nenhuma linha retornada' })
  })
})

// ── criarObra ─────────────────────────────────────────────────────────────────

describe('criarObra', () => {
  it('cria obra sem geofence', async () => {
    b.single.mockResolvedValueOnce({ data: makeRow(), error: null })

    const obra = await criarObra({ name: 'Escola Primária', status: 'ativa' })

    expect(b.insert).toHaveBeenCalledWith(expect.objectContaining({
      nome: 'Escola Primária',
      estado: 'ativa',
      geofence_tipo: null,
      geofence_centro: null,
      geofence_raio_m: null,
    }))
    expect(obra.name).toBe('Escola Primária')
  })

  it('aplica geofence_tipo null quando input sem geofence', async () => {
    b.single.mockResolvedValueOnce({ data: makeRow(), error: null })
    await criarObra({ name: 'Obra', budget: 100000 })
    expect(b.insert).toHaveBeenCalledWith(expect.objectContaining({
      geofence_tipo: null,
      geofence_centro: null,
    }))
  })

  it('cria obra com geofence RAIO — envia EWKT correto', async () => {
    b.single.mockResolvedValueOnce({
      data: makeRow({
        geofence_tipo: 'RAIO',
        geofence_centro: { type: 'Point', coordinates: [-9.14, 38.72] },
        geofence_raio_m: 200,
      }),
      error: null,
    })

    const obra = await criarObra({
      name: 'Obra',
      geofenceTipo: 'RAIO',
      geofenceCentroLat: 38.72,
      geofenceCentroLon: -9.14,
      geofenceRaioM: 200,
    })

    expect(b.insert).toHaveBeenCalledWith(expect.objectContaining({
      geofence_tipo: 'RAIO',
      geofence_centro: 'SRID=4326;POINT(-9.14 38.72)',
      geofence_raio_m: 200,
    }))
    expect(obra.geofenceCentroLat).toBeCloseTo(38.72, 4)
    expect(obra.geofenceCentroLon).toBeCloseTo(-9.14, 4)
  })

  it('envia geofence_centro null quando lat/lon não fornecidos', async () => {
    b.single.mockResolvedValueOnce({ data: makeRow(), error: null })
    await criarObra({ name: 'Obra', geofenceTipo: 'RAIO' })
    expect(b.insert).toHaveBeenCalledWith(expect.objectContaining({
      geofence_tipo: 'RAIO',
      geofence_centro: null,
    }))
  })

  it('usa estado ativa por omissão', async () => {
    b.single.mockResolvedValueOnce({ data: makeRow(), error: null })
    await criarObra({ name: 'Obra' })
    expect(b.insert).toHaveBeenCalledWith(expect.objectContaining({ estado: 'ativa' }))
  })

  it('propaga erro do Supabase', async () => {
    b.single.mockResolvedValueOnce({ data: null, error: { message: 'violação de constraint' } })
    await expect(criarObra({ name: 'X' })).rejects.toMatchObject({ message: 'violação de constraint' })
  })
})

// ── atualizarObra ─────────────────────────────────────────────────────────────

describe('atualizarObra', () => {
  it('atualiza nome e orçamento', async () => {
    b.single.mockResolvedValueOnce({ data: makeRow({ nome: 'Obra Renomeada', orcamento: 750000 }), error: null })

    const obra = await atualizarObra('obra-1', { name: 'Obra Renomeada', budget: 750000 })

    expect(b.update).toHaveBeenCalledWith(expect.objectContaining({
      nome: 'Obra Renomeada',
      orcamento: 750000,
    }))
    expect(b.eq).toHaveBeenCalledWith('id', 'obra-1')
    expect(obra.name).toBe('Obra Renomeada')
  })

  it('atualiza geofence quando geofenceTipo é passado', async () => {
    b.single.mockResolvedValueOnce({ data: makeRow(), error: null })

    await atualizarObra('obra-1', {
      geofenceTipo: null,
    })

    expect(b.update).toHaveBeenCalledWith(expect.objectContaining({
      geofence_tipo: null,
      geofence_centro: null,
      geofence_raio_m: null,
    }))
  })

  it('não inclui geofence no update quando geofenceTipo não fornecido', async () => {
    b.single.mockResolvedValueOnce({ data: makeRow(), error: null })

    await atualizarObra('obra-1', { name: 'Nova Nome' })

    const updateArg = (b.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(updateArg).not.toHaveProperty('geofence_tipo')
    expect(updateArg).not.toHaveProperty('geofence_centro')
  })

  it('propaga erro do Supabase', async () => {
    b.single.mockResolvedValueOnce({ data: null, error: { message: 'RLS block' } })
    await expect(atualizarObra('obra-1', { name: 'X' })).rejects.toMatchObject({ message: 'RLS block' })
  })
})
