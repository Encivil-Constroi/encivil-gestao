import { vi, describe, it, expect, beforeEach } from 'vitest'
import {
  listarColaboradores,
  buscarColaborador,
  criarColaborador,
  arquivarColaborador,
  restaurarColaborador,
} from '@/features/colaboradores/services/colaboradoresService'

// vi.mock é hoistado — vi.hoisted() garante que o builder existe antes do hoist.
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

// ── Dados de teste ────────────────────────────────────────────────────────────
const colaboradorRow = {
  id: 'uuid-colab-1',
  nome: 'João Silva',
  numero_mecan: 'ENC-001',
  nif: '123456789',
  cargo: 'Pedreiro',
  obra_id: 'uuid-obra-1',
  user_id: null,
  ativo: true,
  notas: null,
  created_at: '2026-07-30T10:00:00Z',
  obras: { id: 'uuid-obra-1', nome: 'Moradia Cascais' },
}

beforeEach(() => {
  vi.clearAllMocks()
  b.select.mockReturnValue(b)
  b.insert.mockReturnValue(b)
  b.update.mockReturnValue(b)
  b.order.mockReturnValue(b)
  b.eq.mockReturnValue(b)
})

// ── listarColaboradores ───────────────────────────────────────────────────────
// chain: from().select().order().eq()  — eq() é terminal quando apenasAtivos=true
//        from().select().order()       — order() é terminal quando apenasAtivos=false

describe('listarColaboradores', () => {
  it('retorna colaboradores mapeados para o domínio', async () => {
    b.eq.mockResolvedValue({ data: [colaboradorRow], error: null })

    const result = await listarColaboradores()

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'uuid-colab-1',
      nome: 'João Silva',
      numeroMecan: 'ENC-001',
      cargo: 'Pedreiro',
      obraId: 'uuid-obra-1',
      obraNome: 'Moradia Cascais',
      ativo: true,
    })
  })

  it('inclui NIF quando presente', async () => {
    b.eq.mockResolvedValue({ data: [colaboradorRow], error: null })
    const [c] = await listarColaboradores()
    expect(c.nif).toBe('123456789')
  })

  it('mapeia NIF null para undefined', async () => {
    b.eq.mockResolvedValue({ data: [{ ...colaboradorRow, nif: null }], error: null })
    const [c] = await listarColaboradores()
    expect(c.nif).toBeUndefined()
  })

  it('aplica filtro ativo=true por defeito', async () => {
    b.eq.mockResolvedValue({ data: [], error: null })
    await listarColaboradores()
    expect(b.eq).toHaveBeenCalledWith('ativo', true)
  })

  it('não aplica filtro ativo quando apenasAtivos=false', async () => {
    b.order.mockResolvedValue({ data: [], error: null })
    await listarColaboradores(false)
    expect(b.eq).not.toHaveBeenCalledWith('ativo', true)
  })

  it('propaga erro do Supabase', async () => {
    b.eq.mockResolvedValue({ data: null, error: { message: 'BD offline' } })
    await expect(listarColaboradores()).rejects.toMatchObject({ message: 'BD offline' })
  })
})

// ── buscarColaborador ─────────────────────────────────────────────────────────
// chain: from().select().eq().single()  ← single() é terminal
describe('buscarColaborador', () => {
  it('retorna o colaborador pelo id', async () => {
    b.single.mockResolvedValue({ data: colaboradorRow, error: null })
    const c = await buscarColaborador('uuid-colab-1')
    expect(c.id).toBe('uuid-colab-1')
    expect(c.nome).toBe('João Silva')
    expect(b.eq).toHaveBeenCalledWith('id', 'uuid-colab-1')
  })

  it('propaga erro quando não encontrado', async () => {
    b.single.mockResolvedValue({ data: null, error: { message: 'not found' } })
    await expect(buscarColaborador('inexistente')).rejects.toMatchObject({ message: 'not found' })
  })
})

// ── criarColaborador ──────────────────────────────────────────────────────────
// chain: from().insert({...}).select().single()  ← single() é terminal
describe('criarColaborador', () => {
  it('envia os campos corretos e retorna colaborador criado', async () => {
    b.single.mockResolvedValue({ data: colaboradorRow, error: null })

    const c = await criarColaborador({
      nome: 'João Silva',
      numeroMecan: 'ENC-001',
      cargo: 'Pedreiro',
      nif: '123456789',
      obraId: 'uuid-obra-1',
    })

    expect(b.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        nome: 'João Silva',
        numero_mecan: 'ENC-001',
        cargo: 'Pedreiro',
        nif: '123456789',
        obra_id: 'uuid-obra-1',
      })
    )
    expect(c.nome).toBe('João Silva')
  })

  it('envia null para nif quando omitido', async () => {
    b.single.mockResolvedValue({ data: { ...colaboradorRow, nif: null }, error: null })

    await criarColaborador({ nome: 'Ana Costa', numeroMecan: 'ENC-002', cargo: 'Servente' })

    expect(b.insert).toHaveBeenCalledWith(
      expect.objectContaining({ nif: null, obra_id: null })
    )
  })

  it('propaga erro de insert', async () => {
    b.single.mockResolvedValue({ data: null, error: { message: 'unique violation' } })
    await expect(
      criarColaborador({ nome: 'X', numeroMecan: 'ENC-001', cargo: 'Y' })
    ).rejects.toMatchObject({ message: 'unique violation' })
  })
})

// ── arquivarColaborador ───────────────────────────────────────────────────────
// chain: from().update({ativo:false}).eq()  ← eq() é terminal (void)
describe('arquivarColaborador', () => {
  it('arquiva o colaborador (ativo = false) sem retornar dados', async () => {
    b.eq.mockResolvedValue({ error: null })

    await expect(arquivarColaborador('uuid-colab-1')).resolves.toBeUndefined()

    expect(b.update).toHaveBeenCalledWith({ ativo: false })
    expect(b.eq).toHaveBeenCalledWith('id', 'uuid-colab-1')
  })

  it('propaga erro ao arquivar', async () => {
    b.eq.mockResolvedValue({ error: { message: 'permission denied' } })
    await expect(arquivarColaborador('x')).rejects.toMatchObject({ message: 'permission denied' })
  })
})

// ── restaurarColaborador ──────────────────────────────────────────────────────
describe('restaurarColaborador', () => {
  it('restaura o colaborador (ativo = true)', async () => {
    b.eq.mockResolvedValue({ error: null })

    await expect(restaurarColaborador('uuid-colab-1')).resolves.toBeUndefined()

    expect(b.update).toHaveBeenCalledWith({ ativo: true })
    expect(b.eq).toHaveBeenCalledWith('id', 'uuid-colab-1')
  })
})
