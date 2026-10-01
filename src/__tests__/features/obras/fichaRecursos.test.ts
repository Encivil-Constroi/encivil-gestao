import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obrasDb } from '@/features/obras/db'
import {
  listarEquipaObra, alocarColaborador, removerColaborador, listarAutoresObra,
  definirAutoresObra, listarFrotaObra, listarFerramentasObra, listarMateriaisObra,
} from '@/features/obras/services/fichaRecursosService'

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }))

const rpc = vi.mocked(obrasDb.rpc)

beforeEach(() => vi.resetAllMocks())

describe('recursos da ficha de obra', () => {
  it.each([
    ['obra_equipa_lista', listarEquipaObra],
    ['obra_autores_lista', listarAutoresObra],
    ['obra_frota', listarFrotaObra],
    ['obra_ferramentas', listarFerramentasObra],
    ['obra_materiais', listarMateriaisObra],
  ] as const)('consulta %s com o identificador da obra', async (nome, listar) => {
    rpc.mockResolvedValueOnce({ data: [], error: null } as never)
    expect(await listar('obra-1')).toEqual([])
    expect(rpc).toHaveBeenCalledWith(nome, { p_obra_id: 'obra-1' })
  })

  it('propaga falhas da base de dados', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error('falhou') } as never)
    await expect(listarEquipaObra('obra-1')).rejects.toThrow('falhou')
  })

  it('aloca colaborador com função e data', async () => {
    rpc.mockResolvedValueOnce({ data: 'alocacao-1', error: null } as never)
    expect(await alocarColaborador('obra-1', 'colab-1', 'Encarregado', '2026-10-01')).toBe('alocacao-1')
    expect(rpc).toHaveBeenCalledWith('obra_alocar_colaborador', {
      p_obra_id: 'obra-1', p_colaborador_id: 'colab-1', p_funcao: 'Encarregado', p_desde: '2026-10-01',
    })
  })

  it('remove alocação pela RPC sem apagar o histórico', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null } as never)
    await removerColaborador('alocacao-1', '2026-10-01')
    expect(rpc).toHaveBeenCalledWith('obra_remover_colaborador', { p_alocacao_id: 'alocacao-1', p_ate: '2026-10-01' })
  })

  it('substitui a lista de autores designados, incluindo lista vazia', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null } as never)
    await definirAutoresObra('obra-1', [])
    expect(rpc).toHaveBeenCalledWith('obra_definir_autores', { p_obra_id: 'obra-1', p_user_ids: [] })
  })
})
