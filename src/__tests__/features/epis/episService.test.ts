import { vi, describe, it, expect, beforeEach } from 'vitest'
import {
  listarTiposEpi,
  listarEpisColaborador,
  atribuirEpi,
  devolverEpi,
} from '@/features/epis/services/episService'

const b = vi.hoisted(() => {
  const builder = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    order:  vi.fn(),
    eq:     vi.fn(),
    single: vi.fn(),
  }
  builder.select.mockReturnValue(builder)
  builder.insert.mockReturnValue(builder)
  builder.update.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  return builder
})

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn().mockReturnValue(b) },
}))

const tipoRow = { id: 'tipo-1', designacao: 'Capacete de Segurança', validade_dias: 1825, obrigatorio: true }

const atribRow = {
  id: 'atrib-1',
  colaborador_id: 'colab-1',
  tipo_epi_id: 'tipo-1',
  data_entrega: '2026-01-01',
  data_validade: '2031-01-01',
  devolvido: false,
  data_devolucao: null,
  regra_alerta_id: 'regra-1',
  colaboradores: { nome: 'João Silva' },
  tipos_epi: { designacao: 'Capacete de Segurança' },
}

beforeEach(() => {
  vi.clearAllMocks()
  b.select.mockReturnValue(b)
  b.insert.mockReturnValue(b)
  b.update.mockReturnValue(b)
  b.order.mockReturnValue(b)
  b.eq.mockReturnValue(b)
})

// ── listarTiposEpi ────────────────────────────────────────────────────────────

describe('listarTiposEpi', () => {
  it('mapeia rows para TipoEpi', async () => {
    b.order.mockResolvedValue({ data: [tipoRow], error: null })

    const tipos = await listarTiposEpi()

    expect(tipos).toHaveLength(1)
    expect(tipos[0]).toMatchObject({
      id: 'tipo-1',
      designacao: 'Capacete de Segurança',
      validadeDias: 1825,
      obrigatorio: true,
    })
  })

  it('mapeia validade_dias null para undefined', async () => {
    b.order.mockResolvedValue({ data: [{ ...tipoRow, validade_dias: null }], error: null })
    const [t] = await listarTiposEpi()
    expect(t.validadeDias).toBeUndefined()
  })

  it('propaga erro do Supabase', async () => {
    b.order.mockResolvedValue({ data: null, error: { message: 'BD offline' } })
    await expect(listarTiposEpi()).rejects.toMatchObject({ message: 'BD offline' })
  })
})

// ── listarEpisColaborador ─────────────────────────────────────────────────────

describe('listarEpisColaborador', () => {
  it('filtra por colaborador_id e mapeia para AtribuicaoEpi', async () => {
    b.order.mockResolvedValue({ data: [atribRow], error: null })

    const epis = await listarEpisColaborador('colab-1')

    expect(epis).toHaveLength(1)
    expect(epis[0]).toMatchObject({
      id: 'atrib-1',
      colaboradorId: 'colab-1',
      colaboradorNome: 'João Silva',
      tipoEpiId: 'tipo-1',
      tipoEpiDesignacao: 'Capacete de Segurança',
      dataEntrega: '2026-01-01',
      dataValidade: '2031-01-01',
      devolvido: false,
      regraAlertaId: 'regra-1',
    })
    expect(b.eq).toHaveBeenCalledWith('colaborador_id', 'colab-1')
  })

  it('mapeia regra_alerta_id null para undefined', async () => {
    b.order.mockResolvedValue({ data: [{ ...atribRow, regra_alerta_id: null }], error: null })
    const [e] = await listarEpisColaborador('colab-1')
    expect(e.regraAlertaId).toBeUndefined()
  })
})

// ── atribuirEpi ───────────────────────────────────────────────────────────────

describe('atribuirEpi', () => {
  it('faz INSERT com os campos corretos e retorna AtribuicaoEpi', async () => {
    b.single.mockResolvedValue({ data: atribRow, error: null })

    const result = await atribuirEpi({
      colaboradorId: 'colab-1',
      tipoEpiId: 'tipo-1',
      dataEntrega: '2026-01-01',
    })

    expect(b.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        colaborador_id: 'colab-1',
        tipo_epi_id: 'tipo-1',
        data_entrega: '2026-01-01',
      })
    )
    expect(result.id).toBe('atrib-1')
  })

  it('propaga erro de insert', async () => {
    b.single.mockResolvedValue({ data: null, error: { message: 'FK violation' } })
    await expect(
      atribuirEpi({ colaboradorId: 'x', tipoEpiId: 'y', dataEntrega: '2026-01-01' })
    ).rejects.toMatchObject({ message: 'FK violation' })
  })
})

// ── devolverEpi ───────────────────────────────────────────────────────────────

describe('devolverEpi', () => {
  it('faz UPDATE com devolvido=true e data_devolucao', async () => {
    b.single.mockResolvedValue({ data: { ...atribRow, devolvido: true, data_devolucao: '2026-09-16' }, error: null })

    const result = await devolverEpi('atrib-1', '2026-09-16')

    expect(b.update).toHaveBeenCalledWith(
      expect.objectContaining({ devolvido: true, data_devolucao: '2026-09-16' })
    )
    expect(result.devolvido).toBe(true)
    expect(result.dataDevolucao).toBe('2026-09-16')
  })

  it('propaga erro de update', async () => {
    b.single.mockResolvedValue({ data: null, error: { message: 'not found' } })
    await expect(devolverEpi('x', '2026-01-01')).rejects.toMatchObject({ message: 'not found' })
  })
})
