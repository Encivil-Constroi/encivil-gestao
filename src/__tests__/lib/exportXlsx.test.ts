import { describe, it, expect, vi } from 'vitest'

const writeFile = vi.fn()
vi.mock('xlsx', async (orig) => {
  const real = await orig<typeof import('xlsx')>()
  return { ...real, writeFile: (...a: unknown[]) => writeFile(...a) }
})

describe('exportarXlsx', () => {
  it('gera um ficheiro com a folha, cabeçalhos e formato €', async () => {
    const { exportarXlsx } = await import('@/app/lib/exportXlsx')
    await exportarXlsx([{ Produto: 'Cimento', 'Custo (€)': 12.5 }], 'teste', 'Folha')
    const wb = writeFile.mock.calls[0][0]
    expect(wb.SheetNames).toEqual(['Folha'])
    const ws = wb.Sheets['Folha']
    expect(ws['A1'].v).toBe('Produto')
    expect(ws['B2'].z).toBe('"€" #,##0.00')
  })
})
