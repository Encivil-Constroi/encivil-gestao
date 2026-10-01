import { describe, expect, it } from 'vitest'

const migrations = import.meta.glob('/supabase/migrations/20261003000000_obras_completo.sql', { query: '?raw', import: 'default', eager: true })
const fontes = import.meta.glob('/src/features/obras/{services,components/subempreitadas}/*.ts', { query: '?raw', import: 'default', eager: true })

describe('contrato RPC do módulo Obras', () => {
  it('todas as RPCs chamadas pelos serviços existem na migration', () => {
    const sql = Object.values(migrations)[0] as string
    expect(sql).toBeTruthy()
    const funcoes = new Set([...sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.(\w+)/gi)].map(m => m[1]))
    const chamadas = new Set(Object.values(fontes).flatMap(fonte =>
      [...(fonte as string).matchAll(/\.rpc\(['"](\w+)['"]/g)].map(m => m[1]),
    ))
    expect(chamadas.size).toBeGreaterThan(20)
    expect([...chamadas].filter(nome => !funcoes.has(nome))).toEqual([])
  })
})
