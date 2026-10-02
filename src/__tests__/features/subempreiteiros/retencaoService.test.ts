import { vi, describe, it, expect, beforeEach } from 'vitest'
import { listarLiberacoes, criarLiberacao, eliminarLiberacao } from '@/features/obras/legacy/retencaoService'

const b = vi.hoisted(() => {
  const builder = {
    select: vi.fn(), eq: vi.fn(), order: vi.fn(), single: vi.fn(), insert: vi.fn(), delete: vi.fn(),
  }
  builder.select.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  builder.insert.mockReturnValue(builder)
  builder.delete.mockReturnValue(builder)
  return builder
})
const rpc = vi.hoisted(() => vi.fn())

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn().mockReturnValue(b), rpc },
}))

const row = {
  id: 'lib-1', subempreiteiro_id: 'sub-1', obra_id: 'obra-1', valor: 500,
  data_liberacao: '2026-10-01', motivo: 'conclusao_obra', observacoes: 'Fim de obra',
  registado_por: 'u1', created_at: '2026-10-01T10:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  b.select.mockReturnValue(b)
  b.eq.mockReturnValue(b)
  b.order.mockReturnValue(b)
  b.insert.mockReturnValue(b)
  b.delete.mockReturnValue(b)
})

describe('criarLiberacao', () => {
  it('usa a RPC sub_libertar_retencao e nunca insere diretamente', async () => {
    rpc.mockResolvedValue({ data: 'lib-1', error: null })
    b.single.mockResolvedValue({ data: row, error: null })

    const lib = await criarLiberacao({
      subcontractorId: 'sub-1', valor: 500, dataLiberacao: '2026-10-01',
      motivo: 'conclusao_obra', observacoes: 'Fim de obra',
    })

    expect(rpc).toHaveBeenCalledWith('sub_libertar_retencao', {
      p_sub_id: 'sub-1', p_valor: 500, p_motivo: 'conclusao_obra', p_obs: 'Fim de obra',
    })
    expect(b.insert).not.toHaveBeenCalled()
    expect(b.eq).toHaveBeenCalledWith('id', 'lib-1')
    expect(lib).toMatchObject({ id: 'lib-1', valor: 500, motivo: 'conclusao_obra' })
  })

  it('envia obs null quando não há observações', async () => {
    rpc.mockResolvedValue({ data: 'lib-1', error: null })
    b.single.mockResolvedValue({ data: row, error: null })
    await criarLiberacao({ subcontractorId: 'sub-1', valor: 10, motivo: 'outro' })
    expect(rpc).toHaveBeenCalledWith('sub_libertar_retencao', expect.objectContaining({ p_obs: null }))
  })

  it('propaga a mensagem do servidor (teto da retenção, ocorrência alta) sem ler a libertação', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Valor acima da retenção acumulada' } })
    await expect(
      criarLiberacao({ subcontractorId: 'sub-1', valor: 9999, motivo: 'outro' }),
    ).rejects.toMatchObject({ message: 'Valor acima da retenção acumulada' })
    expect(b.single).not.toHaveBeenCalled()
  })

  it('propaga erro na leitura da libertação criada', async () => {
    rpc.mockResolvedValue({ data: 'lib-1', error: null })
    b.single.mockResolvedValue({ data: null, error: { message: 'rls' } })
    await expect(
      criarLiberacao({ subcontractorId: 'sub-1', valor: 10, motivo: 'outro' }),
    ).rejects.toMatchObject({ message: 'rls' })
  })
})

describe('listarLiberacoes / eliminarLiberacao', () => {
  it('lista e mapeia por subempreiteiro', async () => {
    b.order.mockResolvedValue({ data: [row], error: null })
    const r = await listarLiberacoes('sub-1')
    expect(b.eq).toHaveBeenCalledWith('subempreiteiro_id', 'sub-1')
    expect(r[0]).toMatchObject({ id: 'lib-1', subcontractorId: 'sub-1', valor: 500 })
    expect(r[0].createdAt).toBeInstanceOf(Date)
  })

  it('elimina pelo id', async () => {
    b.eq.mockResolvedValue({ error: null })
    await eliminarLiberacao('lib-1')
    expect(b.eq).toHaveBeenCalledWith('id', 'lib-1')
  })
})
