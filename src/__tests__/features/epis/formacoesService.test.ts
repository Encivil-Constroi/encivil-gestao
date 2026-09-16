import { vi, describe, it, expect, beforeEach } from 'vitest'
import {
  listarTiposFormacao,
  listarFormacoesColaborador,
  registarFormacao,
} from '@/features/epis/services/formacoesService'

const b = vi.hoisted(() => {
  const builder = {
    select: vi.fn(),
    insert: vi.fn(),
    order:  vi.fn(),
    eq:     vi.fn(),
    single: vi.fn(),
  }
  builder.select.mockReturnValue(builder)
  builder.insert.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  return builder
})

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn().mockReturnValue(b) },
}))

const tipoComPrazoRow = { id: 'tipo-f-1', designacao: 'Segurança em Altura', validade_anos: 2, obrigatoria: true }
const tipoVitalicioRow = { id: 'tipo-f-2', designacao: 'Primeiros Socorros', validade_anos: null, obrigatoria: true }

const formacaoRow = {
  id: 'form-1',
  colaborador_id: 'colab-1',
  tipo_id: 'tipo-f-1',
  data_conclusao: '2026-01-01',
  data_validade: '2028-01-01',
  certificado_key: null,
  entidade: 'ACT',
  regra_alerta_id: 'regra-2',
  colaboradores: { nome: 'João Silva' },
  tipos_formacao: { designacao: 'Segurança em Altura' },
}

beforeEach(() => {
  vi.clearAllMocks()
  b.select.mockReturnValue(b)
  b.insert.mockReturnValue(b)
  b.order.mockReturnValue(b)
  b.eq.mockReturnValue(b)
})

// ── listarTiposFormacao ───────────────────────────────────────────────────────

describe('listarTiposFormacao', () => {
  it('mapeia rows para TipoFormacao com prazo', async () => {
    b.order.mockResolvedValue({ data: [tipoComPrazoRow], error: null })
    const tipos = await listarTiposFormacao()
    expect(tipos[0]).toMatchObject({
      id: 'tipo-f-1',
      designacao: 'Segurança em Altura',
      validadeAnos: 2,
      obrigatoria: true,
    })
  })

  it('formação vitalícia tem validadeAnos undefined', async () => {
    b.order.mockResolvedValue({ data: [tipoVitalicioRow], error: null })
    const [t] = await listarTiposFormacao()
    expect(t.validadeAnos).toBeUndefined()
  })
})

// ── listarFormacoesColaborador ────────────────────────────────────────────────

describe('listarFormacoesColaborador', () => {
  it('filtra por colaborador_id e mapeia para FormacaoColaborador', async () => {
    b.order.mockResolvedValue({ data: [formacaoRow], error: null })

    const result = await listarFormacoesColaborador('colab-1')

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'form-1',
      colaboradorId: 'colab-1',
      colaboradorNome: 'João Silva',
      tipoId: 'tipo-f-1',
      tipoDesignacao: 'Segurança em Altura',
      dataConclusao: '2026-01-01',
      dataValidade: '2028-01-01',
      entidade: 'ACT',
      regraAlertaId: 'regra-2',
    })
    expect(b.eq).toHaveBeenCalledWith('colaborador_id', 'colab-1')
  })

  it('certificadoKey null mapeia para undefined', async () => {
    b.order.mockResolvedValue({ data: [formacaoRow], error: null })
    const [f] = await listarFormacoesColaborador('colab-1')
    expect(f.certificadoKey).toBeUndefined()
  })
})

// ── registarFormacao ──────────────────────────────────────────────────────────

describe('registarFormacao', () => {
  it('faz INSERT com campos corretos e retorna FormacaoColaborador', async () => {
    b.single.mockResolvedValue({ data: formacaoRow, error: null })

    const result = await registarFormacao({
      colaboradorId: 'colab-1',
      tipoId: 'tipo-f-1',
      dataConclusao: '2026-01-01',
      entidade: 'ACT',
    })

    expect(b.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        colaborador_id: 'colab-1',
        tipo_id: 'tipo-f-1',
        data_conclusao: '2026-01-01',
        entidade: 'ACT',
        certificado_key: null,
      })
    )
    expect(result.id).toBe('form-1')
  })

  it('formação vitalícia sem alerta — regra_alerta_id permanece null na BD', async () => {
    // A BD não cria regra quando validade_anos IS NULL (trigger comportamento documentado)
    const rowSemRegra = { ...formacaoRow, regra_alerta_id: null, data_validade: null }
    b.single.mockResolvedValue({ data: rowSemRegra, error: null })

    const result = await registarFormacao({
      colaboradorId: 'colab-1',
      tipoId: 'tipo-f-2',
      dataConclusao: '2026-01-01',
    })

    expect(result.regraAlertaId).toBeUndefined()
    expect(result.dataValidade).toBeUndefined()
  })

  it('propaga erro de insert', async () => {
    b.single.mockResolvedValue({ data: null, error: { message: 'FK violation' } })
    await expect(
      registarFormacao({ colaboradorId: 'x', tipoId: 'y', dataConclusao: '2026-01-01' })
    ).rejects.toMatchObject({ message: 'FK violation' })
  })
})
