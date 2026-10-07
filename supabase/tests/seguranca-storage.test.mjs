// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { criarBanco } from './pg-harness.mjs'
let db
beforeAll(async () => { db = await criarBanco() }, 120_000)

describe('buckets de Storage', () => {
  it('todos têm limite de tamanho e tipos permitidos', async () => {
    const { rows } = await db.query(
      `SELECT id FROM storage.buckets WHERE file_size_limit IS NULL OR allowed_mime_types IS NULL OR cardinality(allowed_mime_types) = 0`)
    expect(rows).toEqual([])
  })
  it('nenhum aceita executáveis/HTML/SVG (XSS por ficheiro)', async () => {
    const { rows } = await db.query(
      `SELECT id, m FROM storage.buckets, unnest(allowed_mime_types) m
        WHERE m ~* '(html|svg|javascript|x-msdownload|octet-stream|\\*)'`)
    expect(rows).toEqual([])
  })
})
