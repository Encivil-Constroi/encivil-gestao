import { describe, it, expect, vi, beforeEach } from 'vitest'

const sheets: { nome: string; ws: Record<string, unknown> }[] = []
const writeFile = vi.fn()

vi.mock('xlsx', () => ({
  utils: {
    json_to_sheet: (rows: Record<string, unknown>[]) => ({ __rows: rows, '!ref': 'A1:A1' }),
    decode_range: () => ({ s: { r: 0, c: 0 }, e: { r: 0, c: 0 } }),
    encode_cell: () => 'A1',
    book_new: () => ({}),
    book_append_sheet: (_wb: unknown, ws: Record<string, unknown>, nome: string) => { sheets.push({ nome, ws }) },
  },
  writeFile: (...a: unknown[]) => writeFile(...a),
}))

import { exportarXlsxMultiFolha } from '@/app/lib/exportXlsx'

beforeEach(() => { sheets.length = 0; writeFile.mockClear() })

describe('exportarXlsxMultiFolha', () => {
  it('cria uma folha por entrada, corta o nome a 31 caracteres e avisa se vazia', async () => {
    await exportarXlsxMultiFolha([
      { nome: 'A'.repeat(40), linhas: [{ x: 1 }] },
      { nome: 'Vazia', linhas: [] },
    ], 'fecho')
    expect(sheets.map(s => s.nome)).toEqual(['A'.repeat(31), 'Vazia'])
    expect(sheets[1].ws.__rows).toEqual([{ Aviso: 'Sem dados no período' }])
    expect(writeFile).toHaveBeenCalledOnce()
    expect(String(writeFile.mock.calls[0][1])).toMatch(/^fecho_\d{4}-\d{2}-\d{2}\.xlsx$/)
  })
})
