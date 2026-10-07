// @vitest-environment node
// MATRIZ_ESCRITA (UI) tem de coincidir com o que a BD permite.
import { describe, it, expect, beforeAll } from 'vitest'
import { criarBanco, como } from './pg-harness.mjs'
import { MATRIZ_ESCRITA } from '../../src/features/auth/lib/permissoes.ts'

const PAPEIS = ['admin', 'gestor', 'armazem', 'medicoes', 'mecanico', 'motorista', 'leitura']
let db; const uid = {}

beforeAll(async () => {
  db = await criarBanco()
  for (const p of PAPEIS) {
    const { rows } = await db.query(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [`${p}@t.pt`])
    await db.query(`UPDATE public.profiles SET role = $1 WHERE id = $2`, [p, rows[0].id])
    uid[p] = rows[0].id
  }
}, 120_000)

describe('MATRIZ_ESCRITA = pode_escrever()', () => {
  it('a matriz cobre exatamente os módulos verificados aqui', () => {
    expect(Object.keys(MATRIZ_ESCRITA).sort()).toEqual(
      ['armazem', 'colaboradores', 'combustivel', 'ferramentas', 'frota', 'obras', 'subempreitadas'])
  })
  for (const modulo of ['armazem', 'ferramentas', 'combustivel', 'obras', 'subempreitadas', 'frota']) {
    it.each(PAPEIS)(`${modulo} × %s`, async (papel) => {
      const { rows } = await como(db, { papel: 'authenticated', uid: uid[papel] }, tx =>
        tx.query(`SELECT public.pode_escrever($1) AS p`, [modulo]))
      expect(rows[0].p).toBe(MATRIZ_ESCRITA[modulo].includes(papel))
    })
  }
  it.each(PAPEIS)('colaboradores × %s (policy colab_write)', async (papel) => {
    const pode = await como(db, { papel: 'authenticated', uid: uid[papel] }, async tx => {
      try {
        await tx.query(`SAVEPOINT s`)
        await tx.query(`INSERT INTO public.colaboradores (nome, numero_mecan, cargo) VALUES ('X', $1, 'Y')`, [`T-${papel}`])
        return true
      } catch { await tx.query(`ROLLBACK TO SAVEPOINT s`); return false }
    })
    expect(pode).toBe(MATRIZ_ESCRITA.colaboradores.includes(papel))
  })
})
