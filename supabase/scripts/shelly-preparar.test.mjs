// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { prepararScript } from './shelly-preparar.mjs'
import { criarShellyEmulado } from './shelly-emulador.mjs'

const BASE = readFileSync(fileURLToPath(new URL('./shelly-polo2.js', import.meta.url)), 'utf8')
const CHAVE = 'sb_publishable_AbCdEf123456'
const SEGREDO = 'segredo-de-teste-0123456789'

describe('prepararScript', () => {
  it('preenche chave e segredo só no CONFIG e deixa o resto igual', () => {
    const r = prepararScript(BASE, { chave: CHAVE, segredo: SEGREDO })
    expect(r).toContain(`api_key:     ${JSON.stringify(CHAVE)}`)
    expect(r).toContain(`pump_secret: ${JSON.stringify(SEGREDO)}`)
    expect(r.match(/SUBSTITUIR/g)?.length ?? 0).toBe((BASE.match(/SUBSTITUIR/g) ?? []).length - 2)
    expect(r.replace(JSON.stringify(CHAVE), '"SUBSTITUIR_PELA_CHAVE_PUBLICA"').replace(JSON.stringify(SEGREDO), '"SUBSTITUIR_PELO_PUMP_POLO2_SECRET"')).toBe(BASE)
  })

  it('recusa a chave secreta de serviço (nunca vai para o aparelho)', () => {
    expect(() => prepararScript(BASE, { chave: 'sb_secret_' + 'x'.repeat(12), segredo: SEGREDO })).toThrow(/publishable/i)
  })

  it.each([
    ['sem segredo', ''],
    ['segredo curto', 'abc'],
    ['aspas', 'segredo"com"aspas0123456'],
    ['barra', 'segredo\\0123456789abc'],
    ['quebra de linha', 'segredo\n0123456789abc'],
    ['espaços', 'segredo com espacos 12345'],
  ])('recusa segredo inválido: %s', (_n, segredo) => {
    expect(() => prepararScript(BASE, { chave: CHAVE, segredo })).toThrow(/segredo/i)
  })

  it('recusa chave vazia ou com formato errado', () => {
    expect(() => prepararScript(BASE, { chave: '', segredo: SEGREDO })).toThrow(/chave/i)
    expect(() => prepararScript(BASE, { chave: 'qualquer', segredo: SEGREDO })).toThrow(/chave/i)
  })

  it('falha se o script base não tiver os dois marcadores (não gera um ficheiro enganador)', () => {
    expect(() => prepararScript('let CONFIG = {};', { chave: CHAVE, segredo: SEGREDO })).toThrow(/marcador/i)
  })
})

describe('script preparado no emulador', () => {
  afterEach(() => vi.useRealTimers())

  it('arranca, envia o segredo e mantém o relé desligado', async () => {
    vi.useFakeTimers()
    const pedidos = []
    const e = criarShellyEmulado({
      fetch: async (url, o) => { pedidos.push(o.headers); return { status: 200, statusText: '', text: async () => '{"status":"idle"}' } },
      log: () => {},
    })
    e.executar(prepararScript(BASE, { chave: CHAVE, segredo: SEGREDO }))
    await vi.advanceTimersByTimeAsync(6_000)
    expect(pedidos[0]).toEqual({ apikey: CHAVE, 'x-pump-secret': SEGREDO })
    expect(e.rele().ligado).toBe(false)
    e.parar()
  })
})
