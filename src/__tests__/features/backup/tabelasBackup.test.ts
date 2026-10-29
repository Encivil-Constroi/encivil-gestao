// @vitest-environment node
// Cada tabela da exportação /backup tem de existir depois de todas as migrations.
import { describe, it, expect, beforeAll } from 'vitest'
import { criarBanco } from '../../../../supabase/tests/pg-harness.mjs'
import { TABELAS_BACKUP, ORDEM_BACKUP } from '@/features/backup/backupService'

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

describe('TABELAS_BACKUP: ordem estável', () => {
  beforeAll(async () => { db = db ?? await criarBanco() }, 120_000)

  // paginar() ordena por estas colunas; sem elas as páginas podiam repetir ou saltar linhas
  it('todas as tabelas têm as colunas de ordenação', async () => {
    const { rows } = await db.query(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1::text[])",
      [TABELAS_BACKUP.map(t => t.id)])
    const existentes = new Set(rows.map(r => String(r.table_name) + '.' + String(r.column_name)))
    const emFalta = TABELAS_BACKUP
      .flatMap(t => (ORDEM_BACKUP[t.id] ?? ['id']).map(c => t.id + '.' + c))
      .filter(k => !existentes.has(k))
    expect(emFalta).toEqual([])
  })
})
