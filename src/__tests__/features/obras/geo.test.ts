import { describe, expect, it } from 'vitest'
import { avaliarEvidencia, caminhoEvidenciaValido, distanciaM, validarTiradaEm, type EntradaEvidencia } from '@/features/obras/lib/geo'

const cfg = { raio_padrao_m: 300, precisao_max_m: 50 }
const base: EntradaEvidencia = { lat: 38.7223, lon: -9.1393, precisaoM: 10, obraLat: 38.7223, obraLon: -9.1393, raioObraM: null }

describe('distanciaM', () => {
  it('é zero para o mesmo ponto', () => expect(distanciaM(38.7, -9.1, 38.7, -9.1)).toBe(0))
  it('um grau de latitude ≈ 111,2 km', () => {
    expect(distanciaM(38, -9, 39, -9)).toBeGreaterThan(111_000)
    expect(distanciaM(38, -9, 39, -9)).toBeLessThan(111_400)
  })
  it('Lisboa–Porto ≈ 274 km', () => {
    const d = distanciaM(38.7223, -9.1393, 41.1579, -8.6291) / 1000
    expect(d).toBeGreaterThan(268)
    expect(d).toBeLessThan(280)
  })
  it('é simétrica', () => {
    expect(distanciaM(38, -9, 41, -8)).toBeCloseTo(distanciaM(41, -8, 38, -9), 6)
  })
})

describe('avaliarEvidencia', () => {
  it('válida dentro do raio com boa precisão', () => {
    expect(avaliarEvidencia(base, cfg)).toEqual({ valida: true, dentroObra: true, distanciaM: 0, precisaoOk: true, motivo: null })
  })
  it('sem GPS', () => {
    const r = avaliarEvidencia({ ...base, lat: null, lon: null }, cfg)
    expect(r.valida).toBe(false)
    expect(r.motivo).toBe('sem_gps')
    expect(r.distanciaM).toBeNull()
  })
  it('obra sem coordenadas', () => {
    const r = avaliarEvidencia({ ...base, obraLat: null, obraLon: null }, cfg)
    expect(r).toMatchObject({ valida: false, motivo: 'obra_sem_coordenadas', dentroObra: null })
  })
  it('precisão acima do máximo', () => {
    expect(avaliarEvidencia({ ...base, precisaoM: 50.1 }, cfg)).toMatchObject({ valida: false, precisaoOk: false, motivo: 'precisao_insuficiente' })
  })
  it('precisão no limite é aceite', () => {
    expect(avaliarEvidencia({ ...base, precisaoM: 50 }, cfg).valida).toBe(true)
  })
  it('precisão desconhecida invalida', () => {
    expect(avaliarEvidencia({ ...base, precisaoM: null }, cfg)).toMatchObject({ valida: false, precisaoOk: null, motivo: 'precisao_insuficiente' })
  })
  it('fora do raio padrão', () => {
    const r = avaliarEvidencia({ ...base, lat: 38.7260 }, cfg)
    expect(r.dentroObra).toBe(false)
    expect(r.motivo).toBe('fora_do_raio')
    expect(r.distanciaM).toBeGreaterThan(300)
  })
  it('usa o raio da obra quando definido', () => {
    const lat = 38.7260
    expect(avaliarEvidencia({ ...base, lat, raioObraM: 1000 }, cfg).valida).toBe(true)
    expect(avaliarEvidencia({ ...base, lat, raioObraM: 100 }, cfg).valida).toBe(false)
  })
  it('distância é arredondada a 1 casa decimal', () => {
    const r = avaliarEvidencia({ ...base, lat: 38.7225 }, cfg)
    expect(Math.round((r.distanciaM as number) * 10) / 10).toBe(r.distanciaM)
  })
})

describe('validarTiradaEm', () => {
  const agora = new Date('2026-10-04T12:00:00Z')
  it('aceita fotografia recente', () => expect(validarTiradaEm(new Date('2026-10-04T11:50:00Z'), agora, 120)).toBeNull())
  it('aceita até 2 minutos no futuro', () => expect(validarTiradaEm(new Date('2026-10-04T12:02:00Z'), agora, 120)).toBeNull())
  it('recusa mais de 2 minutos no futuro', () => expect(validarTiradaEm(new Date('2026-10-04T12:02:01Z'), agora, 120)).toMatch(/futuro/))
  it('aceita no limite de idade e recusa acima', () => {
    expect(validarTiradaEm(new Date('2026-10-04T10:00:00Z'), agora, 120)).toBeNull()
    expect(validarTiradaEm(new Date('2026-10-04T09:59:59Z'), agora, 120)).toMatch(/120 minutos/)
  })
  it('recusa data inválida', () => expect(validarTiradaEm(new Date('x'), agora, 120)).toMatch(/inválida/))
})

describe('caminhoEvidenciaValido', () => {
  const obra = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed'
  it('aceita <obra>/autos/<ts>-<rand>.<ext>', () => expect(caminhoEvidenciaValido(`${obra}/autos/1759000000000-ab12cd.jpg`, obra)).toBe(true))
  it('recusa outra obra, outra pasta ou sem extensão', () => {
    expect(caminhoEvidenciaValido(`outra/autos/1-a.jpg`, obra)).toBe(false)
    expect(caminhoEvidenciaValido(`${obra}/galeria/1-a.jpg`, obra)).toBe(false)
    expect(caminhoEvidenciaValido(`${obra}/autos/1-a`, obra)).toBe(false)
  })
})
