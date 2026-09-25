import { vi, describe, it, expect, beforeEach } from 'vitest'
import { supabase } from '@/integrations/supabase/client'
import {
  listarSubempreiteiros,
  buscarSubempreiteiro,
  listarSubempreiteirosComExecutado,
  criarSubempreiteiro,
  atualizarSubempreiteiro,
  eliminarSubempreiteiro,
  validarSubempreiteiro,
} from '@/features/subempreiteiros/services/subempreiteirosService'

const b = vi.hoisted(() => {
  const builder = {
    select: vi.fn(),
    order:  vi.fn(),
    eq:     vi.fn(),
    in:     vi.fn(),
    single: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }
  builder.select.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.in.mockReturnValue(builder)
  builder.insert.mockReturnValue(builder)
  builder.update.mockReturnValue(builder)
  builder.delete.mockReturnValue(builder)
  return builder
})

const rpcMock = vi.hoisted(() => vi.fn())

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    rpc:  rpcMock,
  },
}))

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(supabase.from).mockReturnValue(b as never)
  vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never)
  b.select.mockReturnValue(b)
  b.order.mockReturnValue(b)
  b.eq.mockReturnValue(b)
  b.in.mockReturnValue(b)
  b.insert.mockReturnValue(b)
  b.update.mockReturnValue(b)
  b.delete.mockReturnValue(b)
})

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeArtigoRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'art-1',
  subempreiteiro_id: 'sub-1',
  descricao: 'Escavação',
  unidade: 'm³',
  preco_unitario: 25,
  quantidade_prevista: 100,
  is_extra: false,
  ...overrides,
})

const makeSubRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'sub-1',
  obra_id: 'obra-1',
  nome: 'Construções X Lda',
  contacto_responsavel: '912345678',
  tipo: 'global' as const,
  valor_global: 50000,
  percentagem_retencao: 5,
  condicoes: 'Pagamento a 30 dias',
  estado: 'rascunho' as const,
  created_at: '2026-03-01T09:00:00Z',
  updated_at: '2026-05-01T10:00:00Z',
  validado_em: null,
  obras: { nome: 'Escola Primária' },
  subempreiteiro_artigos: [],
  ...overrides,
})

// ── listarSubempreiteiros ─────────────────────────────────────────────────────

describe('listarSubempreiteiros', () => {
  it('mapeia row para Subcontractor com campos corretos', async () => {
    b.order.mockResolvedValueOnce({ data: [makeSubRow()], error: null })

    const subs = await listarSubempreiteiros()

    expect(subs).toHaveLength(1)
    expect(subs[0]).toMatchObject({
      id: 'sub-1',
      obraId: 'obra-1',
      obraName: 'Escola Primária',
      name: 'Construções X Lda',
      contact: '912345678',
      type: 'global',
      globalValue: 50000,
      status: 'rascunho',
      retencaoPercentagem: 5,
    })
    expect(subs[0].createdAt).toBeInstanceOf(Date)
  })

  it('filtra por obra quando obraId fornecido', async () => {
    b.eq
      .mockReturnValueOnce(b)                              // .eq('ativo', true)
      .mockResolvedValueOnce({ data: [], error: null })    // .eq('obra_id')
    await listarSubempreiteiros('obra-1')
    expect(b.eq).toHaveBeenCalledWith('obra_id', 'obra-1')
  })

  it('exclui contratações arquivadas', async () => {
    b.order.mockResolvedValueOnce({ data: [], error: null })
    await listarSubempreiteiros()
    expect(b.eq).toHaveBeenCalledWith('ativo', true)
  })

  it('sem obraId usa .order() como chamada final (sem .eq())', async () => {
    b.order.mockResolvedValueOnce({ data: [], error: null })
    await listarSubempreiteiros()
    expect(b.eq).not.toHaveBeenCalledWith('obra_id', expect.anything())
  })

  it('calcula agreedValue para tipo global = valor_global', async () => {
    b.order.mockResolvedValueOnce({
      data: [makeSubRow({ tipo: 'global', valor_global: 80000, subempreiteiro_artigos: [] })],
      error: null,
    })
    const [sub] = await listarSubempreiteiros()
    expect(sub.agreedValue).toBe(80000)
  })

  it('calcula agreedValue para tipo unitario = soma(preco × qtd)', async () => {
    b.order.mockResolvedValueOnce({
      data: [makeSubRow({
        tipo: 'unitario',
        valor_global: null,
        subempreiteiro_artigos: [
          makeArtigoRow({ preco_unitario: 25, quantidade_prevista: 100 }),      // 2500
          makeArtigoRow({ id: 'art-2', preco_unitario: 120, quantidade_prevista: 50 }),  // 6000
        ],
      })],
      error: null,
    })
    const [sub] = await listarSubempreiteiros()
    expect(sub.agreedValue).toBeCloseTo(8500)
  })

  it('itens extras ficam depois dos normais (sort por isExtra)', async () => {
    b.order.mockResolvedValueOnce({
      data: [makeSubRow({
        tipo: 'unitario',
        subempreiteiro_artigos: [
          makeArtigoRow({ id: 'art-extra',  descricao: 'Extra',  is_extra: true }),
          makeArtigoRow({ id: 'art-normal', descricao: 'Normal', is_extra: false }),
        ],
      })],
      error: null,
    })
    const [sub] = await listarSubempreiteiros()
    expect(sub.items![0].isExtra).toBe(false)
    expect(sub.items![1].isExtra).toBe(true)
  })

  it('agreedValue=0 para unitario sem artigos', async () => {
    b.order.mockResolvedValueOnce({
      data: [makeSubRow({ tipo: 'unitario', valor_global: null, subempreiteiro_artigos: [] })],
      error: null,
    })
    const [sub] = await listarSubempreiteiros()
    expect(sub.agreedValue).toBe(0)
  })

  it('mapeia campos opcionais null para undefined', async () => {
    b.order.mockResolvedValueOnce({
      data: [makeSubRow({
        contacto_responsavel: null, condicoes: null, validado_em: null, obras: null,
      })],
      error: null,
    })
    const [sub] = await listarSubempreiteiros()
    expect(sub.contact).toBeUndefined()
    expect(sub.conditions).toBeUndefined()
    expect(sub.validatedAt).toBeUndefined()
    expect(sub.obraName).toBeUndefined()
  })

  it('propaga erro do Supabase', async () => {
    b.order.mockResolvedValueOnce({ data: null, error: { message: 'RLS block' } })
    await expect(listarSubempreiteiros()).rejects.toMatchObject({ message: 'RLS block' })
  })
})

// ── buscarSubempreiteiro ──────────────────────────────────────────────────────

describe('buscarSubempreiteiro', () => {
  it('busca por id e mapeia corretamente', async () => {
    b.single.mockResolvedValueOnce({ data: makeSubRow(), error: null })
    const sub = await buscarSubempreiteiro('sub-1')
    expect(sub.id).toBe('sub-1')
    expect(b.eq).toHaveBeenCalledWith('id', 'sub-1')
  })

  it('propaga erro quando não encontrado', async () => {
    b.single.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } })
    await expect(buscarSubempreiteiro('x')).rejects.toMatchObject({ message: 'Not found' })
  })
})

// ── listarSubempreiteirosComExecutado ─────────────────────────────────────────

describe('listarSubempreiteirosComExecutado', () => {
  it('devolve array vazio quando não há subempreiteiros', async () => {
    b.order.mockResolvedValueOnce({ data: [], error: null })
    const result = await listarSubempreiteirosComExecutado()
    expect(result).toHaveLength(0)
  })

  it('soma autos validados por subempreiteiro', async () => {
    // listarSubempreiteiros (sem obraId) → b.order resolve
    b.order.mockResolvedValueOnce({
      data: [makeSubRow({ id: 's1' }), makeSubRow({ id: 's2' })],
      error: null,
    })
    // 1º eq = filtro ativo (encadeia); 2º eq = autos query (resolve)
    b.eq.mockReturnValueOnce(b).mockResolvedValueOnce({
      data: [
        { subempreiteiro_id: 's1', valor_periodo: 10000, estado: 'validado' },
        { subempreiteiro_id: 's1', valor_periodo: 5000,  estado: 'validado' },
        { subempreiteiro_id: 's2', valor_periodo: 20000, estado: 'validado' },
      ],
      error: null,
    })

    const result = await listarSubempreiteirosComExecutado()

    expect(result.find(s => s.id === 's1')!.executed).toBeCloseTo(15000)
    expect(result.find(s => s.id === 's2')!.executed).toBeCloseTo(20000)
  })

  it('executed=0 para subempreiteiros sem autos validados', async () => {
    b.order.mockResolvedValueOnce({ data: [makeSubRow()], error: null })
    b.eq.mockReturnValueOnce(b).mockResolvedValueOnce({ data: [], error: null })
    const [sub] = await listarSubempreiteirosComExecutado()
    expect(sub.executed).toBe(0)
  })

  it('filtra por obraId (usa .eq no final de listarSubempreiteiros)', async () => {
    // listarSubempreiteiros(obraId) → order chains + eq resolves for sub list
    b.eq
      .mockReturnValueOnce(b)                                          // listarSubempreiteiros .eq('ativo')
      .mockResolvedValueOnce({ data: [makeSubRow()], error: null })   // listarSubempreiteiros .eq('obra_id')
      .mockResolvedValueOnce({ data: [], error: null })                // autos .eq('estado')

    await listarSubempreiteirosComExecutado('obra-1')

    expect(b.eq).toHaveBeenCalledWith('obra_id', 'obra-1')
    expect(b.in).toHaveBeenCalledWith('subempreiteiro_id', ['sub-1'])
  })
})

// ── criarSubempreiteiro ───────────────────────────────────────────────────────

describe('criarSubempreiteiro', () => {
  it('cria subempreiteiro global sem artigos', async () => {
    // insert().select('id').single() → then buscarSubempreiteiro().select(SELECT).eq().single()
    b.single
      .mockResolvedValueOnce({ data: { id: 'new-sub' }, error: null })
      .mockResolvedValueOnce({ data: makeSubRow({ id: 'new-sub' }), error: null })

    const sub = await criarSubempreiteiro({
      obraId: 'obra-1', name: 'Construtora Y', type: 'global', globalValue: 60000,
    })

    expect(b.insert).toHaveBeenCalledWith(expect.objectContaining({
      obra_id: 'obra-1', nome: 'Construtora Y', tipo: 'global', valor_global: 60000,
    }))
    expect(sub.id).toBe('new-sub')
  })

  it('cria subempreiteiro unitario — chama delete e insert de artigos', async () => {
    // sub insert chain: insert().select('id').single()
    // substituirArtigos: delete().eq() [chains], then insert(items) [chains via default]
    // buscarSubempreiteiro: select(SELECT).eq().single()
    b.single
      .mockResolvedValueOnce({ data: { id: 'new-sub' }, error: null })
      .mockResolvedValueOnce({ data: makeSubRow({ id: 'new-sub', tipo: 'unitario' }), error: null })
    // delete chain and insert artigos use b defaults (return b); no error

    await criarSubempreiteiro({
      obraId: 'obra-1',
      name: 'Sub Y',
      type: 'unitario',
      items: [{ description: 'Escavação', unit: 'm³', unitPrice: 25, plannedQuantity: 100 }],
    })

    expect(b.delete).toHaveBeenCalled()
    // 2 inserts: 1 para o subempreiteiro + 1 para artigos
    expect(b.insert).toHaveBeenCalledTimes(2)
  })

  it('envia valor_global=null para tipo unitario', async () => {
    b.single
      .mockResolvedValueOnce({ data: { id: 'new-sub' }, error: null })
      .mockResolvedValueOnce({ data: makeSubRow({ tipo: 'unitario' }), error: null })

    await criarSubempreiteiro({ obraId: 'obra-1', name: 'Sub', type: 'unitario' })

    expect(b.insert).toHaveBeenCalledWith(expect.objectContaining({
      tipo: 'unitario', valor_global: null,
    }))
  })

  it('propaga erro do Supabase', async () => {
    b.single.mockResolvedValueOnce({ data: null, error: { message: 'constraint violation' } })
    await expect(criarSubempreiteiro({ obraId: 'o', name: 'X', type: 'global' }))
      .rejects.toMatchObject({ message: 'constraint violation' })
  })
})

// ── atualizarSubempreiteiro ───────────────────────────────────────────────────

describe('atualizarSubempreiteiro', () => {
  it('atualiza campos e retorna subempreiteiro atualizado', async () => {
    // update().eq() → default returns b (no error check in service — uses error variable)
    // buscarSubempreiteiro → select(SELECT).eq().single()
    b.single.mockResolvedValueOnce({ data: makeSubRow({ nome: 'Novo Nome' }), error: null })

    const sub = await atualizarSubempreiteiro('sub-1', { name: 'Novo Nome' })

    expect(b.update).toHaveBeenCalledWith(expect.objectContaining({ nome: 'Novo Nome' }))
    expect(b.eq).toHaveBeenCalledWith('id', 'sub-1')
    expect(sub.name).toBe('Novo Nome')
  })

  it('substitui artigos quando items fornecidos', async () => {
    // update().eq() and delete().eq() and insert(artigos) all chain via defaults (no error)
    b.single.mockResolvedValueOnce({ data: makeSubRow(), error: null })  // buscarSubempreiteiro

    await atualizarSubempreiteiro('sub-1', {
      type: 'unitario',
      items: [{ description: 'Esc', unit: 'm³', unitPrice: 30, plannedQuantity: 50 }],
    })

    expect(b.delete).toHaveBeenCalled()
    expect(b.insert).toHaveBeenCalledTimes(1)  // apenas artigos (não há insert do sub)
  })

  it('propaga erro do Supabase na atualização', async () => {
    // Force the update chain's eq() to resolve with an error
    b.eq.mockResolvedValueOnce({ error: { message: 'RLS block' } })
    await expect(atualizarSubempreiteiro('sub-1', { name: 'X' }))
      .rejects.toMatchObject({ message: 'RLS block' })
  })
})

// ── eliminarSubempreiteiro ────────────────────────────────────────────────────

describe('eliminarSubempreiteiro', () => {
  it('chama delete com eq(id)', async () => {
    b.eq.mockResolvedValueOnce({ error: null })
    await eliminarSubempreiteiro('sub-1')
    expect(b.delete).toHaveBeenCalled()
    expect(b.eq).toHaveBeenCalledWith('id', 'sub-1')
  })

  it('propaga erro', async () => {
    b.eq.mockResolvedValueOnce({ error: { message: 'FK constraint' } })
    await expect(eliminarSubempreiteiro('sub-1')).rejects.toMatchObject({ message: 'FK constraint' })
  })
})

// ── validarSubempreiteiro ─────────────────────────────────────────────────────

describe('validarSubempreiteiro', () => {
  it('chama RPC e depois busca o subempreiteiro atualizado', async () => {
    rpcMock.mockResolvedValueOnce({ error: null })
    b.single.mockResolvedValueOnce({ data: makeSubRow({ estado: 'validado' }), error: null })

    const sub = await validarSubempreiteiro('sub-1')

    expect(rpcMock).toHaveBeenCalledWith('validar_subempreiteiro', { p_id: 'sub-1' })
    expect(sub.status).toBe('validado')
  })

  it('propaga erro da RPC', async () => {
    rpcMock.mockResolvedValueOnce({ error: { message: 'já validado' } })
    await expect(validarSubempreiteiro('sub-1')).rejects.toMatchObject({ message: 'já validado' })
  })
})
