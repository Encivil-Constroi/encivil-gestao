// @vitest-environment node
// Corre o shelly-polo2.js REAL (o que vai para o aparelho) no emulador.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { criarShellyEmulado } from './shelly-emulador.mjs'

const SEGREDO = 'segredo-de-teste'
const CHAVE   = 'sb_publishable_teste'
const CODIGO = readFileSync(fileURLToPath(new URL('./shelly-polo2.js', import.meta.url)), 'utf8')
  .replace('"SUBSTITUIR_PELO_PUMP_POLO2_SECRET"', JSON.stringify(SEGREDO))
  .replace('"SUBSTITUIR_PELA_CHAVE_PUBLICA"', JSON.stringify(CHAVE))

const resposta = (body, status = 200) => ({ status, statusText: '', text: async () => JSON.stringify(body) })

let pedidos, respostas, shelly, logs

function arrancar() {
  shelly = criarShellyEmulado({
    fetch: async (url, opts) => {
      pedidos.push({ url, headers: opts.headers ?? {} })
      const r = respostas.shift() ?? resposta({ status: 'idle' })
      if (r instanceof Error) throw r
      return r
    },
    log: m => logs.push(m),
  })
  shelly.executar(CODIGO)
}

beforeEach(() => {
  vi.useFakeTimers()
  pedidos = []; respostas = []; logs = []
})
afterEach(() => {
  shelly?.parar()
  vi.useRealTimers()
})

const avancar = ms => vi.advanceTimersByTimeAsync(ms)

describe('shelly-polo2.js no emulador', () => {
  it('ao arrancar aplica as proteções de hardware', async () => {
    arrancar()
    await avancar(0)
    expect(shelly.config()).toMatchObject({
      initial_state: 'off', auto_off: true, auto_off_delay: 3600, in_mode: 'detached',
    })
    expect(logs.join('\n')).not.toMatch(/ERRO/)
  })

  it('envia chave pública e segredo nos headers e reporta relé e nível no URL', async () => {
    arrancar()
    await avancar(0)
    // Sem apikey a gateway da Supabase responde 401 (confirmado em produção)
    expect(pedidos[0].headers.apikey).toBe(CHAVE)
    expect(pedidos[0].headers['x-pump-secret']).toBe(SEGREDO)
    expect(pedidos[0].url).toContain('pump_id=polo2')
    expect(pedidos[0].url).toContain('&on=0&nivel=0')
  })

  it('faz polling a cada 5s', async () => {
    arrancar()
    await avancar(0)
    await avancar(15_000)
    expect(pedidos).toHaveLength(4)
  })

  it('"authorized" liga o relé e ele desliga sozinho no fim do tempo', async () => {
    respostas.push(resposta({ status: 'authorized', seconds: 300 }))
    arrancar()
    await avancar(0)
    expect(shelly.rele().ligado).toBe(true)

    await avancar(299_000)
    expect(shelly.rele().ligado).toBe(true)
    await avancar(1_000)
    expect(shelly.rele().ligado).toBe(false)
  })

  it('o poll seguinte reporta o relé ligado', async () => {
    respostas.push(resposta({ status: 'authorized', seconds: 300 }))
    arrancar()
    await avancar(5_000)
    expect(pedidos[1].url).toContain('&on=1')
  })

  it('"stop" desliga o relé imediatamente', async () => {
    respostas.push(resposta({ status: 'authorized', seconds: 900 }), resposta({ status: 'stop' }))
    arrancar()
    await avancar(0)
    expect(shelly.rele().ligado).toBe(true)
    await avancar(5_000)
    expect(shelly.rele().ligado).toBe(false)
  })

  it('segundos acima de 3600 ficam limitados a 3600', async () => {
    respostas.push(resposta({ status: 'authorized', seconds: 99_999 }))
    arrancar()
    await avancar(0)
    await avancar(3_600_000)
    expect(shelly.rele().ligado).toBe(false)
  })

  it('segundos inválidos usam 180', async () => {
    respostas.push(resposta({ status: 'authorized', seconds: 'x' }))
    arrancar()
    await avancar(179_000)
    expect(shelly.rele().ligado).toBe(true)
    await avancar(1_000)
    expect(shelly.rele().ligado).toBe(false)
  })

  it.each([
    ['erro de rede',      new Error('offline')],
    ['HTTP 500',          resposta({ erro: 'x' }, 500)],
    ['JSON inválido',     { status: 200, statusText: '', text: async () => '<html>' }],
    ['status desconhecido', resposta({ status: 'ligar-tudo' })],
  ])('%s: não liga o relé e o polling continua', async (_n, r) => {
    respostas.push(r)
    arrancar()
    await avancar(0)
    expect(shelly.rele().ligado).toBe(false)
    await avancar(5_000)
    expect(pedidos).toHaveLength(2)
  })

  it('servidor lento: timeout de 4s liberta o polling (sem pedidos sobrepostos)', async () => {
    let pendentes = 0
    shelly = criarShellyEmulado({
      fetch: () => { pendentes++; pedidos.push({}); return new Promise(() => {}) },
      log: m => logs.push(m),
    })
    shelly.executar(CODIGO)
    await avancar(4_000)
    expect(pedidos).toHaveLength(1)
    await avancar(1_000)
    expect(pedidos).toHaveLength(2)
    expect(pendentes).toBe(2)
  })

  it('alarme LIVELLO na entrada S1 é reportado', async () => {
    arrancar()
    await avancar(0)
    shelly.definirNivel(true)
    await avancar(5_000)
    expect(pedidos[1].url).toContain('&nivel=1')
  })

  it('relé ligado à mão (app Shelly) desliga sozinho ao fim de 60 min', async () => {
    arrancar()
    await avancar(0)
    shelly.ligarManualmente()
    await avancar(3_600_000)
    expect(shelly.rele().ligado).toBe(false)
  })
})

describe('emulador é estrito como o firmware', () => {
  it('HTTP.GET com headers é rejeitado e nada é enviado', async () => {
    const msgs = []
    const fetch = vi.fn()
    const e = criarShellyEmulado({ fetch, log: m => msgs.push(m) })
    e.executar('Shelly.call("HTTP.GET", { url: "x", headers: {} }, function (r, err, msg) { print(err + " " + msg) })')
    await avancar(0)
    expect(msgs[0]).toBe('-103 HTTP.GET não aceita: headers')
    expect(fetch).not.toHaveBeenCalled()
  })
})
