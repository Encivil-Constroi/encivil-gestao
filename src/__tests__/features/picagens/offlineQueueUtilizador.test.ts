import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  enqueuePendingPicagem, pendentesDoUtilizador, pendentesDeOutros, getQueue,
} from '@/features/picagens/offlineQueue'
import type { NovaPicagem } from '@/features/picagens/services/picagensService'

// O localStorage do ambiente de testes não é fiável; um Map chega
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

const base: NovaPicagem = {
  colaboradorId: 'c1', obraId: 'o1', tipo: 'ENTRADA', timestampDispositivo: '2026-10-06T08:00:00Z', origem: 'OFFLINE',
}

describe('fila offline de picagens por utilizador', () => {
  beforeEach(() => localStorage.clear())

  it('guarda o utilizador que criou a picagem', () => {
    enqueuePendingPicagem(base, 'user-a')
    expect(getQueue()[0]).toMatchObject({ userId: 'user-a' })
  })

  it('só devolve para envio as picagens do utilizador atual', () => {
    enqueuePendingPicagem(base, 'user-a')
    enqueuePendingPicagem(base, 'user-b')
    expect(pendentesDoUtilizador('user-b')).toHaveLength(1)
    expect(pendentesDoUtilizador('user-b')[0]).toMatchObject({ userId: 'user-b' })
    expect(pendentesDeOutros('user-b')).toBe(1)
  })

  it('picagens antigas sem utilizador continuam a ser enviadas (compatibilidade)', () => {
    localStorage.setItem('encivil_pending_picagens', JSON.stringify([{ ...base, queueId: 'q1', queuedAt: '2026-10-01T00:00:00Z' }]))
    expect(pendentesDoUtilizador('user-b')).toHaveLength(1)
    expect(pendentesDeOutros('user-b')).toBe(0)
  })

  it('sem sessão não envia nada', () => {
    enqueuePendingPicagem(base, 'user-a')
    expect(pendentesDoUtilizador(null)).toHaveLength(0)
  })
})
