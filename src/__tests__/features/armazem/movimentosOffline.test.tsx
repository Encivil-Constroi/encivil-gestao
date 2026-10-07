import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const m = vi.hoisted(() => ({
  rpc: [] as { fn: string; args: Record<string, unknown> }[],
  resposta: { data: null as unknown, error: null as { message: string; code?: string } | Error | null },
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown> = {}) => { m.rpc.push({ fn, args }); return Promise.resolve(m.resposta) },
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'u' } } } }) },
  },
}))

import { registarMovimentoArmazem, listarMateriaisPorObra } from '@/features/movimentos/services/armazemService'
import { useRegistarMovimentoArmazem } from '@/features/movimentos/hooks/useArmazem'
import { useOfflineQueue } from '@/features/movimentos/hooks/useOfflineQueue'
import { getQueue } from '@/features/movimentos/offlineQueue'

// O localStorage do ambiente de testes não é fiável; um Map chega para a fila
const memoria = new Map<string, string>()
vi.stubGlobal('localStorage', { getItem: (k: string) => memoria.get(k) ?? null, setItem: (k: string, v: string) => { memoria.set(k, v) }, removeItem: (k: string) => { memoria.delete(k) }, clear: () => memoria.clear() })

const ficheiros = import.meta.glob('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const sql = Object.keys(ficheiros).sort().map(f => ficheiros[f]).join('\n')

function parametros(fn: string): string[] {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\s*\\(([^)]*)\\)`, 'g')
  let ultimo: string | null = null
  for (const x of sql.matchAll(re)) ultimo = x[1]
  if (ultimo == null) throw new Error(`função ${fn} não existe nas migrations`)
  return ultimo.split(',').map(p => p.trim()).filter(Boolean).map(p => p.split(/\s+/)[0])
}

const entrada = {
  produtoId: 'p1', subtipo: 'COMPRA' as const, quantidade: 5, responsavel: 'Rui', fornecedor: 'ENCIVIL', precoUnitario: 3,
}

function onLine(valor: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => valor })
}

beforeEach(() => {
  m.rpc = []; m.resposta = { data: null, error: null }; localStorage.clear(); onLine(true)
})
afterEach(() => onLine(true))

describe('contrato das RPCs do armazém', () => {
  it('registar_movimento_armazem: argumentos iguais aos parâmetros do SQL', async () => {
    await registarMovimentoArmazem(entrada)
    expect(m.rpc).toHaveLength(1)
    expect(m.rpc[0].fn).toBe('registar_movimento_armazem')
    expect(Object.keys(m.rpc[0].args).sort()).toEqual(parametros('registar_movimento_armazem').sort())
    expect(m.rpc[0].args).toMatchObject({
      p_produto_id: 'p1', p_subtipo: 'COMPRA', p_quantidade: 5, p_responsavel: 'Rui', p_fornecedor: 'ENCIVIL',
      p_preco_unitario: 3, p_obra_id: undefined, p_cliente: undefined, p_numero_fatura: undefined, p_observacoes: undefined,
    })
  })

  it('armazem_materiais_por_obra: argumentos iguais aos do SQL e converte números', async () => {
    m.resposta = { data: [{
      obra_id: 'o1', obra_nome: 'A', obra_estado: 'ativa', produto_id: 'p1', produto_nome: 'X', produto_codigo: 'C', unidade: 'un',
      foto_path: null, enviado: '10', devolvido: '2', liquido: '8', valor: '16.5', ultimo_movimento: '2026-09-01T10:00:00Z',
    }], error: null }
    const r = await listarMateriaisPorObra()
    expect(Object.keys(m.rpc[0].args).sort()).toEqual(parametros('armazem_materiais_por_obra').sort())
    expect(r[0]).toMatchObject({ obraId: 'o1', liquido: 8, valor: 16.5, devolvido: 2 })
  })

  it('erro da RPC sobe tal como vem', async () => {
    m.resposta = { data: null, error: { message: 'Quantidade inválida', code: 'P0001' } }
    await expect(registarMovimentoArmazem(entrada)).rejects.toMatchObject({ message: 'Quantidade inválida' })
  })
})

describe('registo offline', () => {
  it('sem rede entra na fila com os argumentos novos, sem chamar o servidor', async () => {
    onLine(false)
    const { result } = renderHook(() => useRegistarMovimentoArmazem())
    let r: unknown
    await act(async () => { r = await result.current.registar(entrada) })
    expect(r).toBe('guardado-offline')
    expect(m.rpc).toHaveLength(0)
    expect(getQueue()).toHaveLength(1)
    expect(getQueue()[0]).toMatchObject({ produtoId: 'p1', subtipo: 'COMPRA', fornecedor: 'ENCIVIL', quantidade: 5 })
  })

  it('falha de rede a meio também guarda na fila', async () => {
    m.resposta = { data: null, error: new Error('Failed to fetch') }
    const { result } = renderHook(() => useRegistarMovimentoArmazem())
    let r: unknown
    await act(async () => { r = await result.current.registar(entrada) })
    expect(r).toBe('guardado-offline')
    expect(getQueue()).toHaveLength(1)
  })

  it('erro de negócio não entra na fila e fica em error', async () => {
    m.resposta = { data: null, error: { message: 'A obra "X" já está concluída', code: 'P0001' } }
    const { result } = renderHook(() => useRegistarMovimentoArmazem())
    let r: unknown
    await act(async () => { r = await result.current.registar({ ...entrada, subtipo: 'OBRA', obraId: 'o1' }) })
    expect(r).toBeNull()
    expect(getQueue()).toHaveLength(0)
    await waitFor(() => expect(result.current.error).toBe('A obra "X" já está concluída'))
  })

  it('ao voltar a rede, a fila sincroniza com a RPC nova e esvazia', async () => {
    onLine(false)
    const { result: form } = renderHook(() => useRegistarMovimentoArmazem())
    await act(async () => { await form.current.registar(entrada) })
    expect(getQueue()).toHaveLength(1)

    onLine(true)
    const { result: fila } = renderHook(() => useOfflineQueue())
    await act(async () => { await fila.current.flushNow() })
    await waitFor(() => expect(getQueue()).toHaveLength(0))
    expect(m.rpc.map(c => c.fn)).toEqual(['registar_movimento_armazem'])
    expect(Object.keys(m.rpc[0].args).sort()).toEqual(parametros('registar_movimento_armazem').sort())
  })

  it('registo antigo ainda na fila sincroniza pela RPC antiga', async () => {
    localStorage.setItem('encivil_pending_movimentos', JSON.stringify([
      { queueId: 'q1', queuedAt: '2026-09-01T00:00:00Z', produtoId: 'p1', tipo: 'saida', quantidade: 2, responsavel: 'Rui', destinoObra: 'Obra A' },
    ]))
    const { result: fila } = renderHook(() => useOfflineQueue())
    await act(async () => { await fila.current.flushNow() })
    await waitFor(() => expect(getQueue()).toHaveLength(0))
    expect(m.rpc.some(c => c.fn === 'registar_movimento')).toBe(true)
  })
})
