import { vi, describe, it, expect, beforeEach } from 'vitest'
import { supabase } from '@/integrations/supabase/client'
import {
  listarAlertasAtivos,
  listarTodosAlertas,
  reconhecerAlerta,
  resolverAlerta,
  avaliarAlertas,
  labelTipo,
} from '@/features/alertas/services/alertasService'

const b = vi.hoisted(() => {
  const builder = {
    select: vi.fn(),
    in:     vi.fn(),
    order:  vi.fn(),
    update: vi.fn(),
    eq:     vi.fn(),
  }
  builder.select.mockReturnValue(builder)
  builder.in.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  builder.update.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  return builder
})

const rpcMock    = vi.hoisted(() => vi.fn())
const getUserMock = vi.hoisted(() => vi.fn())

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: getUserMock },
    rpc:  rpcMock,
  },
}))

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(supabase.from).mockReturnValue(b as never)
  b.select.mockReturnValue(b)
  b.in.mockReturnValue(b)
  b.order.mockReturnValue(b)
  b.update.mockReturnValue(b)
  b.eq.mockReturnValue(b)
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-uuid' } } })
})

const makeRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'alerta-1',
  regra_id: 'regra-1',
  entidade_id: 'ent-1',
  estado: 'ATIVO',
  severidade: 'URGENTE',
  valor_atual: 85000,
  valor_limiar: 100000,
  criado_em: '2026-09-01T10:00:00Z',
  atualizado_em: '2026-09-01T10:00:00Z',
  reconhecido_por: null,
  reconhecido_em: null,
  resolvido_por: null,
  resolvido_em: null,
  regra_tipo: 'REVISAO_KM',
  entidade_alvo: 'viaturas',
  campo_ref: 'km',
  limiar_atencao: 90000,
  limiar_urgente: 80000,
  entidade_nome: 'Volvo FH16',
  entidade_detalhe: 'M-12-AB',
  ...overrides,
})

// listarAlertasAtivos usa .order('severidade').order('criado_em') — duas chamadas encadeadas
function mockAtivos(rows: ReturnType<typeof makeRow>[]) {
  b.order
    .mockReturnValueOnce(b)                                       // 1ª .order('severidade') — encadeia
    .mockResolvedValueOnce({ data: rows, error: null })           // 2ª .order('criado_em') — resolve
}

// ── listarAlertasAtivos ───────────────────────────────────────────────────────

describe('listarAlertasAtivos', () => {
  it('mapeia row para Alerta com campos corretos', async () => {
    mockAtivos([makeRow()])

    const alertas = await listarAlertasAtivos()

    expect(alertas).toHaveLength(1)
    expect(alertas[0]).toMatchObject({
      id: 'alerta-1',
      regraId: 'regra-1',
      entidadeId: 'ent-1',
      estado: 'ATIVO',
      severidade: 'URGENTE',
      valorAtual: 85000,
      valorLimiar: 100000,
      regraTipo: 'REVISAO_KM',
      entidadeNome: 'Volvo FH16',
    })
    expect(alertas[0].criadoEm).toBeInstanceOf(Date)
  })

  it('ordena URGENTE antes de ATENCAO', async () => {
    mockAtivos([
      makeRow({ id: 'a1', severidade: 'ATENCAO' }),
      makeRow({ id: 'a2', severidade: 'URGENTE' }),
    ])

    const alertas = await listarAlertasAtivos()

    expect(alertas[0].id).toBe('a2')   // URGENTE primeiro
    expect(alertas[1].id).toBe('a1')
  })

  it('mapeia campos opcionais null para undefined', async () => {
    mockAtivos([makeRow({ valor_atual: null, entidade_nome: null, regra_tipo: null })])

    const [a] = await listarAlertasAtivos()
    expect(a.valorAtual).toBeUndefined()
    expect(a.entidadeNome).toBeUndefined()
    expect(a.regraTipo).toBeUndefined()
  })

  it('mapeia datas de reconhecimento quando presentes', async () => {
    mockAtivos([makeRow({
      estado: 'RECONHECIDO',
      reconhecido_por: 'user-2',
      reconhecido_em: '2026-09-02T08:00:00Z',
    })])

    const [a] = await listarAlertasAtivos()
    expect(a.reconhecidoPor).toBe('user-2')
    expect(a.reconhecidoEm).toBeInstanceOf(Date)
  })

  it('propaga erro do Supabase', async () => {
    b.order
      .mockReturnValueOnce(b)
      .mockResolvedValueOnce({ data: null, error: { message: 'permissão negada' } })

    await expect(listarAlertasAtivos()).rejects.toMatchObject({ message: 'permissão negada' })
  })

  it('devolve array vazio quando não há alertas', async () => {
    mockAtivos([])
    const alertas = await listarAlertasAtivos()
    expect(alertas).toHaveLength(0)
  })
})

// ── listarTodosAlertas ────────────────────────────────────────────────────────

describe('listarTodosAlertas', () => {
  it('inclui alertas RESOLVIDOS (sem filtro de estado)', async () => {
    b.order.mockResolvedValueOnce({
      data: [
        makeRow({ id: 'a1', estado: 'ATIVO' }),
        makeRow({ id: 'a2', estado: 'RESOLVIDO' }),
      ],
      error: null,
    })

    const alertas = await listarTodosAlertas()
    expect(alertas).toHaveLength(2)
    expect(alertas.map(a => a.estado)).toContain('RESOLVIDO')
  })

  it('devolve na ordem da BD (sem sort por severidade)', async () => {
    b.order.mockResolvedValueOnce({
      data: [
        makeRow({ id: 'a1', severidade: 'ATENCAO' }),
        makeRow({ id: 'a2', severidade: 'URGENTE' }),
      ],
      error: null,
    })

    const alertas = await listarTodosAlertas()
    expect(alertas[0].id).toBe('a1')
  })

  it('propaga erro do Supabase', async () => {
    b.order.mockResolvedValueOnce({ data: null, error: { message: 'BD offline' } })
    await expect(listarTodosAlertas()).rejects.toMatchObject({ message: 'BD offline' })
  })
})

// ── reconhecerAlerta ──────────────────────────────────────────────────────────

describe('reconhecerAlerta', () => {
  it('faz UPDATE com estado RECONHECIDO e id do utilizador', async () => {
    b.eq.mockResolvedValueOnce({ error: null })

    await reconhecerAlerta('alerta-1')

    expect(b.update).toHaveBeenCalledWith(
      expect.objectContaining({
        estado: 'RECONHECIDO',
        reconhecido_por: 'user-uuid',
      })
    )
    expect(b.eq).toHaveBeenCalledWith('id', 'alerta-1')
  })

  it('usa null quando getUser devolve user null', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } })
    b.eq.mockResolvedValueOnce({ error: null })

    await reconhecerAlerta('alerta-1')

    expect(b.update).toHaveBeenCalledWith(
      expect.objectContaining({ reconhecido_por: null })
    )
  })

  it('propaga erro do Supabase', async () => {
    b.eq.mockResolvedValueOnce({ error: { message: 'alerta não encontrado' } })
    await expect(reconhecerAlerta('x')).rejects.toMatchObject({ message: 'alerta não encontrado' })
  })
})

// ── resolverAlerta ────────────────────────────────────────────────────────────

describe('resolverAlerta', () => {
  it('faz UPDATE com estado RESOLVIDO e id do utilizador', async () => {
    b.eq.mockResolvedValueOnce({ error: null })

    await resolverAlerta('alerta-1')

    expect(b.update).toHaveBeenCalledWith(
      expect.objectContaining({
        estado: 'RESOLVIDO',
        resolvido_por: 'user-uuid',
      })
    )
  })

  it('propaga erro do Supabase', async () => {
    b.eq.mockResolvedValueOnce({ error: { message: 'RLS blocked' } })
    await expect(resolverAlerta('x')).rejects.toMatchObject({ message: 'RLS blocked' })
  })
})

// ── avaliarAlertas ────────────────────────────────────────────────────────────

describe('avaliarAlertas', () => {
  it('chama RPC e devolve o número de alertas criados/atualizados', async () => {
    rpcMock.mockResolvedValueOnce({ data: 3, error: null })

    const total = await avaliarAlertas()

    expect(rpcMock).toHaveBeenCalledWith('avaliar_regras_alerta')
    expect(total).toBe(3)
  })

  it('propaga erro da RPC', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })
    await expect(avaliarAlertas()).rejects.toMatchObject({ message: 'timeout' })
  })
})

// ── labelTipo ─────────────────────────────────────────────────────────────────

describe('labelTipo', () => {
  it.each([
    ['REVISAO_KM',        'Revisão (km)'],
    ['REVISAO_DATA',      'Revisão (data)'],
    ['SEGURO',            'Seguro'],
    ['IPO',               'IPO'],
    ['SUPLEMENTAR',       'Suplementar'],
    ['VALIDADE_DOC',      'Validade Doc.'],
    ['EPI_VALIDADE',      'EPI'],
    ['FORMACAO_VALIDADE', 'Formação'],
  ] as const)('mapeia %s → %s', (tipo, label) => {
    expect(labelTipo(tipo)).toBe(label)
  })

  it('devolve "—" para tipo undefined', () => {
    expect(labelTipo(undefined)).toBe('—')
  })

  it('devolve o próprio valor para tipo desconhecido', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(labelTipo('OUTRO' as any)).toBe('OUTRO')
  })
})
