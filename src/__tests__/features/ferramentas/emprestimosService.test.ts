import { vi, describe, it, expect, beforeEach } from 'vitest'
import {
  listarEmprestimos,
  listarEmprestimosPaginados,
  registarEmprestimo,
  registarDevolucao,
  LOANS_PAGE_SIZE,
} from '@/features/ferramentas/services/emprestimosService'
import type { LoanStatus, ReturnCondition } from '@/app/types'

// ── Mock do cliente Supabase ──────────────────────────────────────────────────
const b = vi.hoisted(() => {
  const builder = {
    select: vi.fn(),
    insert: vi.fn(),
    eq:     vi.fn(),
    ilike:  vi.fn(),
    gte:    vi.fn(),
    lt:     vi.fn(),
    limit:  vi.fn(),
    range:  vi.fn(),
    order:  vi.fn(),
    single: vi.fn(),
  }
  builder.select.mockReturnValue(builder)
  builder.insert.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.ilike.mockReturnValue(builder)
  builder.gte.mockReturnValue(builder)
  builder.lt.mockReturnValue(builder)
  builder.limit.mockReturnValue(builder)
  builder.range.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  return builder
})

const rpc = vi.hoisted(() => vi.fn())

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn().mockReturnValue(b), rpc },
}))

// ── Dados de teste ────────────────────────────────────────────────────────────
const empRow = {
  id: 'emp-1',
  ferramenta_id: 'tool-1',
  funcionario_nome: 'Carlos Ferreira',
  funcionario_documento: '12345678',
  destino_obra: 'Obra Norte',
  data_emprestimo: '2026-07-10T08:00:00Z',
  data_prevista_devolucao: '2026-07-20',
  data_devolucao: null,
  estado: 'ativo' as LoanStatus,
  condicao_entrega: 'Bom estado',
  condicao_devolucao: null,
  observacoes: null,
  observacoes_devolucao: null,
  responsavel_entrega: 'Admin',
  responsavel_recebimento: null,
  assinatura_entrega: 'sig-base64',
  assinatura_devolucao: null,
  assinatura_responsavel_entrega: 'sig-resp-base64',
  assinatura_responsavel_devolucao: null,
  obra_id: 'obra-1',
  ferramentas: { nome: 'Berbequim Bosch', codigo: 'F001' },
}

const empDevolvidoRow = {
  ...empRow,
  id: 'emp-1',
  data_devolucao: '2026-07-18T16:00:00Z',
  estado: 'devolvido',
  condicao_devolucao: 'bom_estado' as ReturnCondition,
  responsavel_recebimento: 'Admin',
  assinatura_devolucao: 'sig-dev-base64',
  assinatura_responsavel_devolucao: 'sig-resp-dev-base64',
}

beforeEach(() => {
  vi.clearAllMocks()
  b.select.mockReturnValue(b)
  b.insert.mockReturnValue(b)
  b.eq.mockReturnValue(b)
  b.ilike.mockReturnValue(b)
  b.gte.mockReturnValue(b)
  b.lt.mockReturnValue(b)
  b.limit.mockReturnValue(b)
  b.range.mockReturnValue(b)
  b.order.mockReturnValue(b)
})

// ── listarEmprestimos ─────────────────────────────────────────────────────────
// chain base: from().select().order()  — filtros adicionam eq/ilike/gte/lt/limit/range
describe('listarEmprestimos', () => {
  it('mapeia row para ToolLoan', async () => {
    b.order.mockResolvedValue({ data: [empRow], error: null })
    const [emp] = await listarEmprestimos()

    expect(emp).toMatchObject({
      id: 'emp-1', toolName: 'Berbequim Bosch', toolCode: 'F001',
      employeeName: 'Carlos Ferreira', status: 'ativo',
    })
  })

  it('aplica filtro de estado', async () => {
    // ordem da chain: select().order().eq() — eq() é o terminal
    b.eq.mockResolvedValue({ data: [], error: null })
    await listarEmprestimos({ estado: 'ativo' as LoanStatus })
    expect(b.eq).toHaveBeenCalledWith('estado', 'ativo')
  })

  it('aplica filtro funcionario com ilike', async () => {
    // chain: select().order().ilike() — ilike() é o terminal
    b.ilike.mockResolvedValue({ data: [], error: null })
    await listarEmprestimos({ funcionario: 'Carlos' })
    expect(b.ilike).toHaveBeenCalledWith('funcionario_nome', '%Carlos%')
  })

  it('aplica filtro dataInicio com gte', async () => {
    // chain: select().order().gte() — gte() é o terminal
    b.gte.mockResolvedValue({ data: [], error: null })
    const inicio = new Date('2026-07-01')
    await listarEmprestimos({ dataInicio: inicio })
    expect(b.gte).toHaveBeenCalledWith('data_emprestimo', inicio.toISOString())
  })

  it('aplica filtro dataFim com lt (dia seguinte)', async () => {
    // chain: select().order().lt() — lt() é o terminal
    b.lt.mockResolvedValue({ data: [], error: null })
    const fim = new Date('2026-07-31')
    await listarEmprestimos({ dataFim: fim })
    // deve adicionar 1 dia e usar .lt()
    const esperado = new Date(fim)
    esperado.setDate(esperado.getDate() + 1)
    expect(b.lt).toHaveBeenCalledWith('data_emprestimo', esperado.toISOString())
  })

  it('propaga erro do Supabase', async () => {
    b.order.mockResolvedValue({ data: null, error: { message: 'BD offline' } })
    await expect(listarEmprestimos()).rejects.toMatchObject({ message: 'BD offline' })
  })
})

// ── listarEmprestimosPaginados ────────────────────────────────────────────────
// chain: from().select(_, {count:'exact'}).order().range()  ← range() é o terminal
describe('listarEmprestimosPaginados', () => {
  it('devolve data e count, respeita LOANS_PAGE_SIZE', async () => {
    b.range.mockResolvedValue({ data: [empRow], error: null, count: 1 })
    const result = await listarEmprestimosPaginados()

    expect(result.data).toHaveLength(1)
    expect(result.count).toBe(1)
    expect(b.range).toHaveBeenCalledWith(0, LOANS_PAGE_SIZE - 1)
  })

  it('calcula offset correto para a segunda página', async () => {
    b.range.mockResolvedValue({ data: [], error: null, count: 0 })
    await listarEmprestimosPaginados({}, 1)
    expect(b.range).toHaveBeenCalledWith(LOANS_PAGE_SIZE, LOANS_PAGE_SIZE * 2 - 1)
  })

  it('count é 0 quando Supabase devolve null', async () => {
    b.range.mockResolvedValue({ data: [], error: null, count: null })
    const result = await listarEmprestimosPaginados()
    expect(result.count).toBe(0)
  })
})

// ── registarEmprestimo ────────────────────────────────────────────────────────
// usa RPC registar_emprestimo_ferramenta → depois buscarEmprestimoComFerramenta
describe('registarEmprestimo', () => {
  it('chama o RPC com os parâmetros corretos (incluindo assinaturas)', async () => {
    rpc.mockResolvedValue({ data: empRow, error: null })
    b.single.mockResolvedValue({ data: empRow, error: null })

    await registarEmprestimo({
      toolId: 'tool-1',
      employeeName: 'Carlos Ferreira',
      deliveredBy: 'Admin',
      signature: 'sig-base64',
      responsibleSignature: 'sig-resp-base64',
      employeeDocument: '12345678',
      destination: 'Obra Norte',
      obraId: 'obra-1',
    })

    expect(rpc).toHaveBeenCalledWith('registar_emprestimo_ferramenta', expect.objectContaining({
      p_ferramenta_id: 'tool-1',
      p_funcionario_nome: 'Carlos Ferreira',
      p_responsavel_entrega: 'Admin',
      p_assinatura_entrega: 'sig-base64',
      p_assinatura_responsavel_ent: 'sig-resp-base64',
    }))
  })

  it('propaga erro do RPC sem chamar buscarEmprestimo', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'ferramenta já emprestada' } })
    await expect(
      registarEmprestimo({
        toolId: 'tool-1', employeeName: 'X', deliveredBy: 'Y',
        signature: 's1', responsibleSignature: 's2',
      })
    ).rejects.toMatchObject({ message: 'ferramenta já emprestada' })
    expect(b.single).not.toHaveBeenCalled()
  })
})

// ── registarDevolucao ─────────────────────────────────────────────────────────
// usa RPC registar_devolucao_ferramenta → depois buscarEmprestimoComFerramenta
describe('registarDevolucao', () => {
  it('chama o RPC com os parâmetros corretos (incluindo assinaturas)', async () => {
    rpc.mockResolvedValue({ data: empDevolvidoRow, error: null })
    b.single.mockResolvedValue({ data: empDevolvidoRow, error: null })

    const loan = await registarDevolucao({
      loanId: 'emp-1',
      returnCondition: 'bom_estado' as ReturnCondition,
      receivedBy: 'Admin',
      signature: 'sig-dev-base64',
      responsibleSignature: 'sig-resp-dev-base64',
      returnNotes: 'Sem danos',
    })

    expect(rpc).toHaveBeenCalledWith('registar_devolucao_ferramenta', expect.objectContaining({
      p_emprestimo_id: 'emp-1',
      p_condicao_devolucao: 'bom_estado',
      p_responsavel_recebimento: 'Admin',
      p_assinatura_devolucao: 'sig-dev-base64',
      p_assinatura_responsavel_dev: 'sig-resp-dev-base64',
      p_observacoes_devolucao: 'Sem danos',
    }))
    expect(loan.status).toBe('devolvido')
    expect(loan.returnDate).toBeInstanceOf(Date)
  })

  it('propaga erro do RPC de devolução', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'empréstimo não encontrado' } })
    await expect(
      registarDevolucao({
        loanId: 'x', returnCondition: 'bom_estado' as ReturnCondition, receivedBy: 'Y',
        signature: 's1', responsibleSignature: 's2',
      })
    ).rejects.toMatchObject({ message: 'empréstimo não encontrado' })
  })
})

// ── mapeamento do domínio ─────────────────────────────────────────────────────
describe('mapeamento do domínio', () => {
  it('converte datas ISO em objetos Date', async () => {
    b.order.mockResolvedValue({ data: [empRow], error: null })
    const [emp] = await listarEmprestimos()
    expect(emp.loanDate).toBeInstanceOf(Date)
    expect(emp.expectedReturnDate).toBeInstanceOf(Date)
  })

  it('resolve campos opcionais para undefined (não null)', async () => {
    const rowMinimo = {
      ...empRow,
      funcionario_documento: null,
      destino_obra: null,
      data_prevista_devolucao: null,
      data_devolucao: null,
      condicao_devolucao: null,
      observacoes: null,
      observacoes_devolucao: null,
      responsavel_recebimento: null,
      assinatura_devolucao: null,
      assinatura_responsavel_devolucao: null,
      obra_id: null,
    }
    b.order.mockResolvedValue({ data: [rowMinimo], error: null })
    const [emp] = await listarEmprestimos()
    expect(emp.employeeDocument).toBeUndefined()
    expect(emp.destination).toBeUndefined()
    expect(emp.expectedReturnDate).toBeUndefined()
    expect(emp.returnDate).toBeUndefined()
    expect(emp.returnCondition).toBeUndefined()
    expect(emp.obraId).toBeUndefined()
  })
})
