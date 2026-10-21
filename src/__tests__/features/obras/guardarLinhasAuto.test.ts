import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/integrations/supabase/client'
import { guardarLinhasAuto, type LinhaGravar } from '@/features/obras/lib/autoDados'

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }))
vi.mock('@/app/lib/sentry', () => ({ captureError: vi.fn() }))

const rpc = vi.mocked(supabase.rpc)
const from = vi.mocked(supabase.from)

const linha: LinhaGravar = {
  artigoId: 'art-1', descricao: 'Betão', unidade: 'm3', precoUnitario: 90, quantidade: 2,
  qtdPedida: 3, isExtra: false, justificacao: null,
}
const linhaJson = {
  artigo_id: 'art-1', descricao: 'Betão', unidade: 'm3', preco_unitario: 90, quantidade: 2,
  qtd_pedida: 3, is_extra: false, justificacao: null,
}

function tabelaFallback() {
  const eq = vi.fn().mockResolvedValue({ error: null })
  const del = vi.fn().mockReturnValue({ eq })
  const insert = vi.fn().mockResolvedValue({ error: null })
  from.mockReturnValue({ delete: del, insert } as never)
  return { del, eq, insert }
}

beforeEach(() => vi.resetAllMocks())

describe('guardarLinhasAuto', () => {
  it('usa a RPC atómica e não toca nas linhas diretamente', async () => {
    rpc.mockResolvedValueOnce({ data: 1, error: null } as never)
    expect(await guardarLinhasAuto('a1', [linha])).toBe(true)
    expect(rpc).toHaveBeenCalledWith('substituir_linhas_auto', { p_auto_id: 'a1', p_linhas: [linhaJson] })
    expect(from).not.toHaveBeenCalled()
  })

  it.each(['PGRST202', '42883'])('BD antiga (%s): cai no apagar + inserir', async code => {
    rpc.mockResolvedValueOnce({ data: null, error: { code, message: 'sem função' } } as never)
    const { del, eq, insert } = tabelaFallback()
    expect(await guardarLinhasAuto('a1', [linha])).toBe(true)
    expect(del).toHaveBeenCalled()
    expect(eq).toHaveBeenCalledWith('auto_id', 'a1')
    expect(insert).toHaveBeenCalledWith([{ auto_id: 'a1', ...linhaJson }])
  })

  it('outro erro da RPC propaga e não corre o fluxo antigo', async () => {
    const erro = { code: '42501', message: 'sem permissão' }
    rpc.mockResolvedValueOnce({ data: null, error: erro } as never)
    await expect(guardarLinhasAuto('a1', [linha])).rejects.toBe(erro)
    expect(from).not.toHaveBeenCalled()
  })
})
