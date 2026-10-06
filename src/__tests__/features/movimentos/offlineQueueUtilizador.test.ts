import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  enqueuePendingMovimento, pendentesDoUtilizador, pendentesDeOutros, getQueue,
} from '@/features/movimentos/offlineQueue'
import type { RegistarMovimentoArmazemInput } from '@/features/movimentos/services/armazemService'

// O localStorage/sessionStorage do ambiente de testes não é fiável; um Map chega
function armazenamentoEmMemoria(): Storage {
  const m = new Map<string, string>()
  return {
    get length() { return m.size },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v) },
    removeItem: (k: string) => { m.delete(k) },
    clear: () => m.clear(),
  }
}
vi.stubGlobal('localStorage', armazenamentoEmMemoria())

const base: RegistarMovimentoArmazemInput = {
  produtoId: 'p1', subtipo: 'COMPRA', quantidade: 5, responsavel: 'Rui', fornecedor: 'ENCIVIL', precoUnitario: 3,
}

describe('fila offline por utilizador', () => {
  beforeEach(() => localStorage.clear())

  it('guarda o utilizador que criou o movimento', () => {
    enqueuePendingMovimento(base, 'user-a')
    expect(getQueue()[0]).toMatchObject({ userId: 'user-a' })
  })

  it('só devolve para envio os movimentos do utilizador atual', () => {
    enqueuePendingMovimento(base, 'user-a')
    enqueuePendingMovimento(base, 'user-b')
    expect(pendentesDoUtilizador('user-b')).toHaveLength(1)
    expect(pendentesDoUtilizador('user-b')[0]).toMatchObject({ userId: 'user-b' })
    expect(pendentesDeOutros('user-b')).toBe(1)
  })

  it('movimentos antigos sem utilizador continuam a ser enviados (compatibilidade)', () => {
    localStorage.setItem('encivil_pending_movimentos', JSON.stringify([{ ...base, queueId: 'q1', queuedAt: '2026-10-01T00:00:00Z' }]))
    expect(pendentesDoUtilizador('user-b')).toHaveLength(1)
    expect(pendentesDeOutros('user-b')).toBe(0)
  })

  it('sem sessão não envia nada', () => {
    enqueuePendingMovimento(base, 'user-a')
    expect(pendentesDoUtilizador(null)).toHaveLength(0)
  })
})
