import { vi, describe, it, expect, beforeEach } from 'vitest'
import {
  listarAutos,
  buscarAuto,
  criarAuto,
  atualizarAuto,
  eliminarAuto,
  validarAuto,
  marcarAutoPago,
  listarAprovadores,
  type MedicaoAuto,
} from '@/features/autos/services/autosService'

// ── Mock do cliente Supabase ──────────────────────────────────────────────────
const b = vi.hoisted(() => {
  const builder = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    eq:     vi.fn(),
    in:     vi.fn(),
    order:  vi.fn(),
    single: vi.fn(),
  }
  builder.in.mockReturnValue(builder)
  builder.select.mockReturnValue(builder)
  builder.insert.mockReturnValue(builder)
  builder.update.mockReturnValue(builder)
  builder.delete.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  return builder
})

const rpc = vi.hoisted(() => vi.fn())

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn().mockReturnValue(b), rpc },
}))

// ── Dados de teste ────────────────────────────────────────────────────────────
const linhaRow = {
  id: 'linha-1',
  auto_id: 'auto-1',
  artigo_id: 'artigo-1',
  descricao: 'Alvenaria',
  unidade: 'm²',
  preco_unitario: 25.0,
  quantidade: 100,
  is_extra: false,
}

const autoRow = {
  id: 'auto-1',
  subempreiteiro_id: 'sub-1',
  numero: 1,
  data_medicao: '2026-07-01',
  percentagem_periodo: 40,
  valor_periodo: 8000,
  observacoes: null,
  estado: 'rascunho',
  created_at: '2026-07-01T10:00:00Z',
  validado_em: null,
  auto_linhas: [linhaRow],
}

const autoValidadoRow = { ...autoRow, estado: 'validado', validado_em: '2026-07-02T09:00:00Z' }

beforeEach(() => {
  vi.clearAllMocks()
  b.select.mockReturnValue(b)
  b.insert.mockReturnValue(b)
  b.update.mockReturnValue(b)
  b.delete.mockReturnValue(b)
  b.eq.mockReturnValue(b)
  b.in.mockReturnValue(b)
  b.order.mockReturnValue(b)
})

// ── listarAutos ───────────────────────────────────────────────────────────────
// chain: from().select().eq().order()  ← order() é o terminal
describe('listarAutos', () => {
  it('mapeia linhas para o domínio e ordena por número', async () => {
    b.order.mockResolvedValue({ data: [autoRow], error: null })
    const autos = await listarAutos('sub-1')

    expect(autos).toHaveLength(1)
    expect(autos[0]).toMatchObject({
      id: 'auto-1', number: 1, periodValue: 8000, status: 'rascunho',
    })
    expect(b.eq).toHaveBeenCalledWith('subempreiteiro_id', 'sub-1')
  })

  it('devolve lista vazia sem erros quando não há autos', async () => {
    b.order.mockResolvedValue({ data: [], error: null })
    expect(await listarAutos('sub-x')).toEqual([])
  })

  it('propaga erro do Supabase', async () => {
    b.order.mockResolvedValue({ data: null, error: { message: 'BD offline' } })
    await expect(listarAutos('sub-1')).rejects.toMatchObject({ message: 'BD offline' })
  })
})

// ── buscarAuto ────────────────────────────────────────────────────────────────
// chain: from().select().eq().single()  ← single() é o terminal
describe('buscarAuto', () => {
  it('retorna o auto com as suas linhas', async () => {
    b.single.mockResolvedValue({ data: autoRow, error: null })
    const auto = await buscarAuto('auto-1')
    expect(auto.id).toBe('auto-1')
    expect(auto.lines).toHaveLength(1)
    expect(auto.lines?.[0]).toMatchObject({ description: 'Alvenaria', unitPrice: 25, quantity: 100 })
  })

  it('propaga erro quando não encontrado', async () => {
    b.single.mockResolvedValue({ data: null, error: { message: 'not found' } })
    await expect(buscarAuto('x')).rejects.toMatchObject({ message: 'not found' })
  })
})

// ── criarAuto ─────────────────────────────────────────────────────────────────
// usa RPC criar_auto_rpc (atómica) → depois buscarAuto
describe('criarAuto', () => {
  it('chama o RPC com os parâmetros corretos e devolve o auto criado', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'auto-1', numero: 1 }], error: null })
    b.single.mockResolvedValue({ data: autoRow, error: null })

    const auto = await criarAuto({
      subcontractorId: 'sub-1',
      date: '2026-07-01',
      periodPercentage: 40,
      periodValue: 8000,
    })

    expect(rpc).toHaveBeenCalledWith('criar_auto_rpc', expect.objectContaining({
      p_sub_id: 'sub-1',
      p_data:   '2026-07-01',
      p_valor:  8000,
      p_percentagem: 40,
    }))
    expect(auto.id).toBe('auto-1')
  })

  it('insere linhas após criar o auto quando fornecidas', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'auto-1', numero: 1 }], error: null })
    // insert de linhas → terminal é o próprio insert (sem .select/.single)
    b.insert.mockResolvedValue({ data: null, error: null })
    b.single.mockResolvedValue({ data: autoRow, error: null })

    await criarAuto({
      subcontractorId: 'sub-1',
      date: '2026-07-01',
      periodValue: 8000,
      lines: [{ description: 'Alvenaria', unit: 'm²', unitPrice: 25, quantity: 100 }],
    })

    expect(b.insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ descricao: 'Alvenaria', preco_unitario: 25, quantidade: 100 }),
      ])
    )
  })

  it('propaga erro do RPC sem criar linhas', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'lock timeout' } })
    await expect(
      criarAuto({ subcontractorId: 'sub-1', date: '2026-07-01', periodValue: 1000 })
    ).rejects.toMatchObject({ message: 'lock timeout' })
    expect(b.insert).not.toHaveBeenCalled()
  })
})

// ── atualizarAuto ─────────────────────────────────────────────────────────────
// chain update: from().update({}).eq()  ← eq() terminal (sem select/single aqui)
// depois buscarAuto: from().select().eq().single()
describe('atualizarAuto', () => {
  it('actualiza valor e devolve o auto actualizado', async () => {
    // 1ª chamada a eq() termina o update; 2ª chamada a eq() faz parte de buscarAuto
    b.eq.mockResolvedValueOnce({ data: null, error: null }) // update terminal
    b.eq.mockReturnValue(b)                                 // select chain (para single())
    b.single.mockResolvedValue({ data: autoRow, error: null })

    const auto = await atualizarAuto('auto-1', { periodValue: 9000 })

    expect(b.update).toHaveBeenCalledWith(expect.objectContaining({ valor_periodo: 9000 }))
    expect(auto.periodValue).toBe(8000) // valor que vem do mock row
  })

  it('propaga erro de update sem chamar buscarAuto', async () => {
    b.eq.mockResolvedValueOnce({ data: null, error: { message: 'rls denied' } })
    await expect(atualizarAuto('auto-1', { periodValue: 1 })).rejects.toMatchObject({ message: 'rls denied' })
    // single() não deve ter sido chamado (buscarAuto não foi chamado)
    expect(b.single).not.toHaveBeenCalled()
  })
})

// ── eliminarAuto ──────────────────────────────────────────────────────────────
// chain: from().delete().eq()  ← eq() é o terminal
describe('eliminarAuto', () => {
  it('elimina o auto pelo id', async () => {
    b.eq.mockResolvedValue({ data: null, error: null })
    await eliminarAuto('auto-1')
    expect(b.delete).toHaveBeenCalled()
    expect(b.eq).toHaveBeenCalledWith('id', 'auto-1')
  })

  it('propaga erro de delete', async () => {
    b.eq.mockResolvedValue({ data: null, error: { message: 'auto validado' } })
    await expect(eliminarAuto('auto-1')).rejects.toMatchObject({ message: 'auto validado' })
  })
})

// ── validarAuto ───────────────────────────────────────────────────────────────
// usa RPC validar_auto → depois buscarAuto
describe('validarAuto', () => {
  it('chama o RPC de validação e devolve o auto validado', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    b.single.mockResolvedValue({ data: autoValidadoRow, error: null })

    const auto = await validarAuto('auto-1')

    expect(rpc).toHaveBeenCalledWith('auto_aprovar', { p_auto_id: 'auto-1', p_excecao_docs_motivo: null })
    expect(auto.status).toBe('validado')
    expect(auto.validatedAt).toBeInstanceOf(Date)
  })

  it('passa a exceção documental do admin a auto_aprovar', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    b.single.mockResolvedValue({ data: autoValidadoRow, error: null })
    await validarAuto('auto-1', 'Certidão em renovação, autorizado pelo CEO')
    expect(rpc).toHaveBeenCalledWith('auto_aprovar', {
      p_auto_id: 'auto-1', p_excecao_docs_motivo: 'Certidão em renovação, autorizado pelo CEO',
    })
  })

  it('nunca chama validar_auto diretamente (a cadeia de aprovação não se contorna)', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    b.single.mockResolvedValue({ data: autoValidadoRow, error: null })
    await validarAuto('auto-1')
    expect(rpc).not.toHaveBeenCalledWith('validar_auto', expect.anything())
  })

  it('propaga erro do RPC de validação sem chamar buscarAuto', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'já validado' } })
    await expect(validarAuto('auto-1')).rejects.toMatchObject({ message: 'já validado' })
    expect(b.single).not.toHaveBeenCalled()
  })
})

// ── toMeasurement — mapeamento de campos ──────────────────────────────────────
describe('mapeamento do domínio', () => {
  it('converte datas ISO em objetos Date', async () => {
    b.order.mockResolvedValue({ data: [autoValidadoRow], error: null })
    const [auto] = await listarAutos('sub-1')
    expect(auto.date).toBeInstanceOf(Date)
    expect(auto.createdAt).toBeInstanceOf(Date)
    expect(auto.validatedAt).toBeInstanceOf(Date)
  })

  it('ordena linhas: não-extra antes de extra', async () => {
    const extraLinha = { ...linhaRow, id: 'linha-2', is_extra: true, descricao: 'Extra' }
    const rowComExtra = { ...autoRow, auto_linhas: [extraLinha, linhaRow] }
    b.order.mockResolvedValue({ data: [rowComExtra], error: null })
    const [auto] = await listarAutos('sub-1')
    expect(auto.lines?.[0].isExtra).toBe(false)
    expect(auto.lines?.[1].isExtra).toBe(true)
  })
})

// ── marcarAutoPago ────────────────────────────────────────────────────────────
describe('marcarAutoPago', () => {
  it('envia referência e exceção ao RPC', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    await marcarAutoPago('auto-1', 'TRF-9', 'Fatura em falta, autorizado pelo CEO')
    expect(rpc).toHaveBeenCalledWith('marcar_auto_pago', {
      p_auto_id: 'auto-1', p_referencia: 'TRF-9', p_excecao_motivo: 'Fatura em falta, autorizado pelo CEO',
    })
  })

  it('envia null quando não há referência nem exceção', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    await marcarAutoPago('auto-1')
    expect(rpc).toHaveBeenCalledWith('marcar_auto_pago', {
      p_auto_id: 'auto-1', p_referencia: null, p_excecao_motivo: null,
    })
  })

  it('propaga a mensagem do servidor tal como vem', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Falta a fatura do subempreiteiro' } })
    await expect(marcarAutoPago('auto-1')).rejects.toMatchObject({ message: 'Falta a fatura do subempreiteiro' })
  })
})

// ── certificado, workflow e fatura ────────────────────────────────────────────
describe('certificado e retenção', () => {
  const comSub = (extra: Record<string, unknown>) => ({
    ...autoValidadoRow, subempreiteiros: { percentagem_retencao: 5 }, ...extra,
  })

  it('retenção e líquido calculados sobre o certificado (valor − glosas)', async () => {
    b.single.mockResolvedValue({ data: comSub({ valor_periodo: 10000, valor_glosado: 2000 }), error: null })
    const a = await buscarAuto('auto-1')
    expect(a.valorGlosado).toBe(2000)
    expect(a.valorCertificado).toBe(8000)
    expect(a.valorRetido).toBe(400)
    expect(a.valorLiquido).toBe(7600)
    expect(a.periodValue).toBe(10000)
  })

  it('sem coluna valor_glosado (dados antigos) o certificado é o valor do período', async () => {
    b.single.mockResolvedValue({ data: comSub({ valor_periodo: 1000 }), error: null })
    const a = await buscarAuto('auto-1')
    expect(a.valorGlosado).toBe(0)
    expect(a.valorCertificado).toBe(1000)
    expect(a.valorRetido).toBe(50)
    expect(a.valorLiquido).toBe(950)
  })

  it('arredonda a retenção a 2 casas', async () => {
    b.single.mockResolvedValue({
      data: comSub({ valor_periodo: 333.33, valor_glosado: 0.01, subempreiteiros: { percentagem_retencao: 7 } }),
      error: null,
    })
    const a = await buscarAuto('auto-1')
    expect(a.valorCertificado).toBe(333.32)
    expect(a.valorRetido).toBe(23.33)
    expect(a.valorLiquido).toBeCloseTo(309.99, 2)
  })

  it('glosa total deixa certificado, retenção e líquido a zero', async () => {
    b.single.mockResolvedValue({ data: comSub({ valor_periodo: 500, valor_glosado: 500 }), error: null })
    const a = await buscarAuto('auto-1')
    expect(a.valorCertificado).toBe(0)
    expect(a.valorRetido).toBe(0)
    expect(a.valorLiquido).toBe(0)
  })

  it('auto sem retenção: líquido = certificado', async () => {
    b.single.mockResolvedValue({ data: comSub({ valor_periodo: 1000, valor_glosado: 100, subempreiteiros: null }), error: null })
    const a = await buscarAuto('auto-1')
    expect(a.valorRetido).toBe(0)
    expect(a.valorLiquido).toBe(900)
  })
})

describe('workflow e fatura', () => {
  it('lê o workflow da coluna quando existe', async () => {
    b.single.mockResolvedValue({ data: { ...autoRow, workflow: 'verificado' }, error: null })
    expect((await buscarAuto('auto-1')).workflow).toBe('verificado')
  })

  it('deduz o workflow do estado quando a coluna não existe', async () => {
    b.single.mockResolvedValueOnce({ data: autoRow, error: null })
    expect((await buscarAuto('auto-1')).workflow).toBe('rascunho')
    b.single.mockResolvedValueOnce({ data: autoValidadoRow, error: null })
    expect((await buscarAuto('auto-1')).workflow).toBe('validado')
  })

  it('fatura é null quando não há número', async () => {
    b.single.mockResolvedValue({ data: autoRow, error: null })
    expect((await buscarAuto('auto-1')).fatura).toBeNull()
  })

  it('mapeia a fatura guardada do subempreiteiro', async () => {
    b.single.mockResolvedValue({
      data: {
        ...autoValidadoRow, fatura_numero: 'FT 2026/14', fatura_data: '2026-07-05', fatura_valor: 7600,
        fatura_path: 'sub-1/fatura-1.pdf', fatura_nome: 'fatura.pdf', fatura_registada_em: '2026-07-06T08:00:00Z',
        data_vencimento: '2026-08-05', excecao_motivo: 'Aprovação urgente autorizada',
      },
      error: null,
    })
    const a: MedicaoAuto = await buscarAuto('auto-1')
    expect(a.fatura).toMatchObject({ numero: 'FT 2026/14', data: '2026-07-05', valor: 7600, path: 'sub-1/fatura-1.pdf', nome: 'fatura.pdf' })
    expect(a.fatura?.registadaEm).toBeInstanceOf(Date)
    expect(a.dataVencimento).toBe('2026-08-05')
    expect(a.excecaoMotivo).toBe('Aprovação urgente autorizada')
  })

  it('mapeia submissão, verificação e aprovação', async () => {
    b.single.mockResolvedValue({
      data: {
        ...autoValidadoRow, submetido_por: 'u1', submetido_em: '2026-07-01T09:00:00Z',
        verificado_por: 'u2', verificado_em: '2026-07-01T12:00:00Z', validado_por: 'u3',
      },
      error: null,
    })
    const a = await buscarAuto('auto-1')
    expect(a).toMatchObject({ submetidoPor: 'u1', verificadoPor: 'u2', validadoPor: 'u3' })
    expect(a.submetidoEm).toBeInstanceOf(Date)
    expect(a.verificadoEm).toBeInstanceOf(Date)
  })
})

describe('listarAprovadores', () => {
  const auto = (extra: Partial<MedicaoAuto>) => ({ ...extra } as MedicaoAuto)

  it('resolve nomes legíveis e deixa null os restantes', async () => {
    b.in.mockResolvedValue({ data: [{ id: 'u1', nome: 'Ana Gestora' }], error: null })
    const r = await listarAprovadores(auto({
      submetidoPor: 'u1', submetidoEm: new Date('2026-07-01'),
      validadoPor: 'u3', validatedAt: new Date('2026-07-02'),
    }))
    expect(b.in).toHaveBeenCalledWith('id', ['u1', 'u3'])
    expect(r).toEqual([
      { etapa: 'Submetido', nome: 'Ana Gestora', em: new Date('2026-07-01') },
      { etapa: 'Aprovado', nome: null, em: new Date('2026-07-02') },
    ])
  })

  it('não consulta perfis quando não há ninguém', async () => {
    expect(await listarAprovadores(auto({}))).toEqual([])
    expect(b.in).not.toHaveBeenCalled()
  })

  it('tolera a falha de leitura dos perfis', async () => {
    b.in.mockResolvedValue({ data: null, error: { message: 'rls' } })
    const r = await listarAprovadores(auto({ verificadoPor: 'u2' }))
    expect(r).toEqual([{ etapa: 'Verificado', nome: null, em: undefined }])
  })
})
