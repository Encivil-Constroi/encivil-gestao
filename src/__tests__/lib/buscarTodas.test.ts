import { describe, it, expect, vi } from 'vitest'
import { buscarTodas, TAMANHO_PAGINA } from '@/app/lib/buscarTodas'

const linhas = (n: number, base = 0) => Array.from({ length: n }, (_, i) => ({ id: base + i }))

describe('buscarTodas', () => {
  it('junta páginas de 1000 até vir uma página curta', async () => {
    const pagina = vi.fn((de: number) =>
      Promise.resolve({ data: de === 0 ? linhas(1000) : linhas(500, 1000), error: null }))
    const r = await buscarTodas(pagina)
    expect(r).toHaveLength(1500)
    expect(pagina.mock.calls).toEqual([[0, 999], [1000, 1999]])
    expect(TAMANHO_PAGINA).toBe(1000)
  })

  it('página exata de 1000 pede mais uma e pára na vazia', async () => {
    const pagina = vi.fn((de: number) => Promise.resolve({ data: de === 0 ? linhas(1000) : [], error: null }))
    expect(await buscarTodas(pagina)).toHaveLength(1000)
    expect(pagina).toHaveBeenCalledTimes(2)
  })

  it('data null conta como vazia', async () => {
    expect(await buscarTodas(() => Promise.resolve({ data: null, error: null }))).toEqual([])
  })

  it('propaga o erro tal como veio (código incluído)', async () => {
    const erro = { code: 'PGRST202', message: 'x' }
    await expect(buscarTodas(() => Promise.resolve({ data: null, error: erro }))).rejects.toBe(erro)
  })
})
