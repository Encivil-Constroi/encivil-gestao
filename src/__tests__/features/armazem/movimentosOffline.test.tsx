import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const m = vi.hoisted(() => ({
  rpc: [] as { fn: string; args: Record<string, unknown> }[],
  sessaoId: 'u',
  utilizador: { id: 'u' } as { id: string } | null,
  resposta: { data: null as unknown, error: null as { message: string; code?: string } | Error | null },
  // Quando definido, decide a resposta por chamada (BD antiga, atrasos…)
  responder: null as null | ((fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>),
}))

vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: m.utilizador }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown> = {}) => {
      m.rpc.push({ fn, args })
      const p = m.responder ? m.responder(fn, args) : Promise.resolve(m.resposta)
      // listarMateriaisPorObra lê por páginas: rpc().order()…range()
      // só a 1.ª página traz dados: a paginação pára numa página vazia
      return Object.assign(p, { order: () => p, range: (de: number) => de > 0 ? Promise.resolve({ data: [], error: null }) : p })
    },
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: m.sessaoId } } } }) },
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
  m.sessaoId = 'u'; m.utilizador = { id: 'u' }; m.rpc = []; m.resposta = { data: null, error: null }; m.responder = null; localStorage.clear(); onLine(true)
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

  it('movimentos de outro utilizador não são enviados com a sessão atual (telemóvel partilhado)', async () => {
    onLine(false)
    m.utilizador = { id: 'user-a' }
    const { result: reg } = renderHook(() => useRegistarMovimentoArmazem())
    await act(async () => { await reg.current.registar(entrada) })
    expect(getQueue()[0]).toMatchObject({ userId: 'user-a' })

    onLine(true)
    m.utilizador = { id: 'u' } // a sessão (mock do Supabase) é a de 'u'
    const { result: fila } = renderHook(() => useOfflineQueue())
    await act(async () => { await fila.current.flushNow() })
    expect(m.rpc).toHaveLength(0)
    expect(getQueue()).toHaveLength(1)
    expect(fila.current.pendingCount).toBe(0)
    expect(fila.current.deOutros).toBe(1)
  })

  it('não envia se a sessão real já não for a do dono (estado de UI atrasado)', async () => {
    onLine(false)
    m.utilizador = { id: 'user-a' }
    const { result: reg } = renderHook(() => useRegistarMovimentoArmazem())
    await act(async () => { await reg.current.registar(entrada) })
    onLine(true)
    m.sessaoId = 'user-b'
    const { result: fila } = renderHook(() => useOfflineQueue())
    await act(async () => { await fila.current.flushNow() })
    expect(m.rpc).toHaveLength(0)
    expect(getQueue()).toHaveLength(1)
  })

  it('o dono dos movimentos envia-os quando volta a entrar', async () => {
    onLine(false)
    const { result: reg } = renderHook(() => useRegistarMovimentoArmazem())
    await act(async () => { await reg.current.registar(entrada) })
    onLine(true)
    const { result: fila } = renderHook(() => useOfflineQueue())
    await act(async () => { await fila.current.flushNow() })
    await waitFor(() => expect(getQueue()).toHaveLength(0))
    expect(m.rpc).toHaveLength(1)
  })

  it('sem sessão não enfileira e avisa em pt-PT', async () => {
    onLine(false)
    m.utilizador = null
    const { result } = renderHook(() => useRegistarMovimentoArmazem())
    await act(async () => { await result.current.registar(entrada) })
    expect(getQueue()).toHaveLength(0)
    expect(result.current.error).toBe('Sessão terminada. Entre de novo para registar.')
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

describe('reenvio sem duplicar (client_id)', () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

  it('online envia um p_client_id; se a rede cair depois, a fila reenvia o MESMO id', async () => {
    m.resposta = { data: null, error: new Error('Failed to fetch') }
    const { result } = renderHook(() => useRegistarMovimentoArmazem())
    await act(async () => { await result.current.registar(entrada) })
    const enviado = m.rpc[0].args.p_client_id
    expect(enviado).toMatch(UUID)
    expect(getQueue()[0].queueId).toBe(enviado)
    expect(getQueue()[0]).not.toHaveProperty('clientId')

    m.resposta = { data: null, error: null }
    const { result: fila } = renderHook(() => useOfflineQueue())
    await act(async () => { await fila.current.flushNow() })
    await waitFor(() => expect(getQueue()).toHaveLength(0))
    expect(m.rpc[1].args.p_client_id).toBe(enviado)
  })

  it('retry manual após erro não-rede reutiliza o mesmo id; depois do sucesso usa um novo', async () => {
    m.resposta = { data: null, error: { message: 'Bad Gateway', code: '504' } }
    const { result } = renderHook(() => useRegistarMovimentoArmazem())
    await act(async () => { await result.current.registar(entrada) })
    await act(async () => { await result.current.registar({ ...entrada }) })
    expect(m.rpc).toHaveLength(2)
    expect(m.rpc[1].args.p_client_id).toBe(m.rpc[0].args.p_client_id)

    // dados alterados: nova tentativa lógica, novo id
    await act(async () => { await result.current.registar({ ...entrada, quantidade: 9 }) })
    expect(m.rpc[2].args.p_client_id).not.toBe(m.rpc[0].args.p_client_id)

    // sucesso limpa o id: o mesmo payload volta a ter id novo
    m.resposta = { data: null, error: null }
    await act(async () => { await result.current.registar({ ...entrada, quantidade: 9 }) })
    const idSucesso = m.rpc[3].args.p_client_id
    expect(idSucesso).toBe(m.rpc[2].args.p_client_id)
    await act(async () => { await result.current.registar({ ...entrada, quantidade: 9 }) })
    expect(m.rpc[4].args.p_client_id).not.toBe(idSucesso)
  })

  it('BD antiga (função sem p_client_id): reenvia sem o parâmetro e regista', async () => {
    m.responder = (_fn, args) => Promise.resolve('p_client_id' in args && args.p_client_id !== undefined
      ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.registar_movimento_armazem' } }
      : { data: null, error: null })
    const { result } = renderHook(() => useRegistarMovimentoArmazem())
    let r: unknown
    await act(async () => { r = await result.current.registar(entrada) })
    expect(r).toBe('ok')
    expect(m.rpc).toHaveLength(2)
    expect(m.rpc[1].args.p_client_id).toBeUndefined()
    expect(getQueue()).toHaveLength(0)
  })

  it('BD antiga também na sincronização da fila', async () => {
    onLine(false)
    const { result: form } = renderHook(() => useRegistarMovimentoArmazem())
    await act(async () => { await form.current.registar(entrada) })
    onLine(true)
    m.responder = (_fn, args) => Promise.resolve(args.p_client_id !== undefined
      ? { data: null, error: { code: '42883', message: 'function does not exist' } }
      : { data: null, error: null })
    const { result: fila } = renderHook(() => useOfflineQueue())
    await act(async () => { await fila.current.flushNow() })
    await waitFor(() => expect(getQueue()).toHaveLength(0))
    expect(m.rpc.map(c => c.args.p_client_id === undefined)).toEqual([false, true])
  })

  it('dois separadores a sincronizar ao mesmo tempo enviam cada movimento uma só vez', async () => {
    let cadeia: Promise<unknown> = Promise.resolve()
    const locks = {
      request: (_nome: string, fn: () => Promise<unknown>) => {
        const r = cadeia.then(() => fn())
        cadeia = r.catch(() => undefined)
        return r
      },
    }
    Object.defineProperty(navigator, 'locks', { configurable: true, value: locks })
    try {
      onLine(false)
      const { result: form } = renderHook(() => useRegistarMovimentoArmazem())
      await act(async () => { await form.current.registar(entrada) })
      await act(async () => { await form.current.registar({ ...entrada, quantidade: 7 }) })
      onLine(true)
      m.responder = () => new Promise(res => setTimeout(() => res({ data: null, error: null }), 5))

      const { result: a } = renderHook(() => useOfflineQueue())
      const { result: b } = renderHook(() => useOfflineQueue())
      await act(async () => { await Promise.all([a.current.flushNow(), b.current.flushNow()]) })
      await waitFor(() => expect(getQueue()).toHaveLength(0))
      expect(m.rpc).toHaveLength(2)
      expect(new Set(m.rpc.map(c => c.args.p_client_id)).size).toBe(2)
    } finally {
      Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
    }
  })
})
