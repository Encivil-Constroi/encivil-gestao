import { describe, it, expect, vi } from 'vitest'
import { dimensoesReduzidas, reduzirFoto, LADO_MAX } from '@/app/lib/reduzirFoto'
import { destinoFotoAbastecimento } from '@/features/combustivel/lib/fotoAbastecimento'

const foto = (bytes: number, type = 'image/jpeg') => new File([new Uint8Array(bytes)], 'IMG_0001.JPG', { type })

function falsos(largura: number, altura: number, bytesSaida: number | null) {
  const libertar = vi.fn()
  const carregar = vi.fn(async () => ({ largura, altura, fonte: {} as CanvasImageSource, libertar }))
  const converter = vi.fn(async () => bytesSaida === null ? null : new Blob([new Uint8Array(bytesSaida)], { type: 'image/jpeg' }))
  return { carregar, converter, libertar }
}

describe('dimensoesReduzidas', () => {
  it.each([
    [4032, 3024, { largura: 1600, altura: 1200 }],
    [3024, 4032, { largura: 1200, altura: 1600 }],
    [1601, 1000, { largura: 1600, altura: 999 }],
  ])('%i×%i → %o', (w, h, esperado) => {
    expect(dimensoesReduzidas(w, h)).toEqual(esperado)
  })

  it.each([[1600, 1200], [800, 600], [0, 0], [NaN, NaN]])('%i×%i não precisa de redução', (w, h) => {
    expect(dimensoesReduzidas(w, h)).toBeNull()
  })

  it('lado maior é o limite', () => expect(LADO_MAX).toBe(1600))
})

describe('reduzirFoto', () => {
  it('foto grande → JPEG reduzido com as dimensões certas', async () => {
    const f = falsos(4032, 3024, 300_000)
    const r = await reduzirFoto(foto(4_000_000), f)
    expect(r.type).toBe('image/jpeg')
    expect(r.size).toBe(300_000)
    expect(f.converter).toHaveBeenCalledWith(expect.anything(), 1600, 1200)
    expect(f.libertar).toHaveBeenCalledOnce()
  })

  it('HEIC grande sai em JPEG (formato aceite pela política de upload)', async () => {
    const r = await reduzirFoto(foto(3_000_000, 'image/heic'), falsos(4032, 3024, 250_000))
    expect(r.type).toBe('image/jpeg')
    expect(destinoFotoAbastecimento('v', 'p', r.type).caminho).toMatch(/\.jpg$/)
  })

  it('foto já pequena → original, sem converter', async () => {
    const f = falsos(1200, 900, 1)
    const original = foto(200_000)
    expect(await reduzirFoto(original, f)).toBe(original)
    expect(f.converter).not.toHaveBeenCalled()
    expect(f.libertar).toHaveBeenCalledOnce()
  })

  it('reduzida não fica mais pequena → original', async () => {
    const original = foto(100_000)
    expect(await reduzirFoto(original, falsos(4000, 3000, 100_000))).toBe(original)
  })

  it.each([
    ['canvas sem contexto / toBlob nulo', null],
    ['blob vazio', 0],
  ])('%s → original', async (_n, bytes) => {
    const original = foto(4_000_000)
    expect(await reduzirFoto(original, falsos(4000, 3000, bytes))).toBe(original)
  })

  it('browser não descodifica (ex.: HEIC no Android) → original', async () => {
    const original = foto(3_000_000, 'image/heic')
    const carregar = vi.fn(async () => { throw new Error('imagem ilegível') })
    expect(await reduzirFoto(original, { carregar })).toBe(original)
  })

  it('erro na conversão → original e liberta a imagem', async () => {
    const f = falsos(4000, 3000, 1)
    f.converter.mockRejectedValue(new Error('memória'))
    const original = foto(4_000_000)
    expect(await reduzirFoto(original, f)).toBe(original)
    expect(f.libertar).toHaveBeenCalledOnce()
  })
})
