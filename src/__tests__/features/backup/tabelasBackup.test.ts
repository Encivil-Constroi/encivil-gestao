// @vitest-environment node
// Cada tabela da exportação /backup tem de existir depois de todas as migrations.
import { describe, it, expect, beforeAll } from 'vitest'
import { criarBanco } from '../../../../supabase/tests/pg-harness.mjs'
import { TABELAS_BACKUP } from '@/features/backup/backupService'

let db: Awaited<ReturnType<typeof criarBanco>>

describe('TABELAS_BACKUP', () => {
  beforeAll(async () => { db = await criarBanco() }, 120_000)

  it('não tem ids repetidos', () => {
    const ids = TABELAS_BACKUP.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(TABELAS_BACKUP.map(t => t.id))('a tabela %s existe', async id => {
    const { rows } = await db.query(`SELECT to_regclass('public.' || $1) IS NOT NULL AS existe`, [id])
    expect(rows[0]?.existe).toBe(true)
  })
})
