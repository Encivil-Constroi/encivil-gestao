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

// ── v2: falha segura (estado seguro = relé desligado) ────────────────────────
describe('shelly-polo2.js — falha segura', () => {
  const offline = n => { for (let i = 0; i < n; i++) respostas.push(new Error('offline')) }

  it('dead-man: relé ligado e sem resposta válida do servidor há > 20 s ⇒ desliga', async () => {
    respostas.push(resposta({ status: 'authorized', seconds: 600 }))
    offline(20)
    arrancar()
    await avancar(0)
    expect(shelly.rele().ligado).toBe(true)
    await avancar(19_000)
    expect(shelly.rele().ligado).toBe(true)
    await avancar(4_000)
    expect(shelly.rele().ligado).toBe(false)
    expect(logs.join('\n')).toMatch(/sem contacto/i)
  })

  it('dead-man: resposta com status desconhecido não conta como contacto', async () => {
    respostas.push(resposta({ status: 'authorized', seconds: 600 }))
    for (let i = 0; i < 20; i++) respostas.push(resposta({ status: 'ligar-tudo' }))
    arrancar()
    await avancar(0)
    await avancar(23_000)
    expect(shelly.rele().ligado).toBe(false)
  })

  it('com contacto normal (idle) o relé não é cortado pelo dead-man', async () => {
    respostas.push(resposta({ status: 'authorized', seconds: 600 }))
    arrancar()
    await avancar(0)
    await avancar(120_000)
    expect(shelly.rele().ligado).toBe(true)
  })

  it('ao recuperar a rede o relé NÃO volta a ligar sozinho e reporta on=0', async () => {
    respostas.push(resposta({ status: 'authorized', seconds: 600 }))
    offline(5)
    arrancar()
    await avancar(0)
    await avancar(30_000)
    expect(shelly.rele().ligado).toBe(false)
    const antes = pedidos.length
    await avancar(10_000)
    expect(shelly.rele().ligado).toBe(false)
    expect(pedidos.length).toBeGreaterThan(antes)
    expect(pedidos.at(-1).url).toContain('&on=0')
    expect(logs.join('\n')).toMatch(/restabelecid/i)
  })

  it('ligar: falha pontual do comando é repetida e o relé liga', async () => {
    respostas.push(resposta({ status: 'authorized', seconds: 300 }))
    shelly = criarShellyEmulado({ fetch: async (url, o) => { pedidos.push({ url, headers: o.headers }); return respostas.shift() ?? resposta({ status: 'idle' }) }, log: m => logs.push(m) })
    shelly.injetar({ switchSetErro: 2 })
    shelly.executar(CODIGO)
    await avancar(2_000)
    expect(shelly.rele().ligado).toBe(true)
  })

  it('ligar: comando aceite mas ignorado pelo aparelho é detetado (estado verificado) e repetido', async () => {
    respostas.push(resposta({ status: 'authorized', seconds: 300 }))
    shelly = criarShellyEmulado({ fetch: async (url, o) => { pedidos.push({ url, headers: o.headers }); return respostas.shift() ?? resposta({ status: 'idle' }) }, log: m => logs.push(m) })
    shelly.injetar({ switchSetIgnorar: 1 })
    shelly.executar(CODIGO)
    await avancar(2_000)
    expect(shelly.rele().ligado).toBe(true)
  })

  it('ligar: falha persistente ⇒ relé fica desligado, ERRO registado e polling continua', async () => {
    respostas.push(resposta({ status: 'authorized', seconds: 300 }))
    shelly = criarShellyEmulado({ fetch: async (url, o) => { pedidos.push({ url, headers: o.headers }); return respostas.shift() ?? resposta({ status: 'idle' }) }, log: m => logs.push(m) })
    shelly.injetar({ switchSetErro: 99 })
    shelly.executar(CODIGO)
    await avancar(4_000)
    expect(shelly.rele().ligado).toBe(false)
    expect(logs.join('\n')).toMatch(/ERRO.*ligar/i)
    const n = pedidos.length
    await avancar(10_000)
    expect(pedidos.length).toBeGreaterThan(n)
  })

  it('desligar: falha pontual no STOP é repetida até o relé desligar', async () => {
    respostas.push(resposta({ status: 'authorized', seconds: 900 }), resposta({ status: 'stop' }))
    arrancar()
    await avancar(0)
    expect(shelly.rele().ligado).toBe(true)
    shelly.injetar({ switchSetErro: 2 })
    await avancar(5_000)
    await avancar(2_000)
    expect(shelly.rele().ligado).toBe(false)
  })

  it('"authorized" repetido com o relé já ligado não prolonga o tempo', async () => {
    respostas.push(resposta({ status: 'authorized', seconds: 300 }), resposta({ status: 'authorized', seconds: 300 }))
    arrancar()
    await avancar(0)
    const fim = shelly.rele().desligaEm
    await avancar(5_000)
    expect(shelly.rele().desligaEm).toBe(fim)
    expect(logs.join('\n')).toMatch(/já ligad/i)
  })

  it('poll preso (callback HTTP que nunca volta) é libertado pelo watchdog', async () => {
    shelly = criarShellyEmulado({ fetch: async (url, o) => { pedidos.push({ url, headers: o.headers }); return resposta({ status: 'idle' }) }, log: m => logs.push(m) })
    shelly.injetar({ httpSemResposta: true })
    shelly.executar(CODIGO)
    await avancar(1_000)
    shelly.injetar({ httpSemResposta: false })
    await avancar(15_000)
    expect(pedidos.length).toBeGreaterThanOrEqual(1)
  })

  it('arranque com o relé ligado (ex.: script reiniciado) ⇒ desliga', async () => {
    shelly = criarShellyEmulado({ fetch: async () => resposta({ status: 'idle' }), log: m => logs.push(m) })
    shelly.ligarManualmente()
    shelly.executar(CODIGO)
    await avancar(1_000)
    expect(shelly.rele().ligado).toBe(false)
  })

  it('placeholders por substituir ⇒ recusa arrancar: sem pedidos, relé desligado, aviso claro', async () => {
    const cru = readFileSync(fileURLToPath(new URL('./shelly-polo2.js', import.meta.url)), 'utf8')
    shelly = criarShellyEmulado({ fetch: async (url) => { pedidos.push({ url }); return resposta({ status: 'idle' }) }, log: m => logs.push(m) })
    shelly.executar(cru)
    await avancar(20_000)
    expect(pedidos).toHaveLength(0)
    expect(shelly.rele().ligado).toBe(false)
    expect(logs.join('\n')).toMatch(/CONFIGURA/)
  })
})

describe('shelly-polo2.js — compatível com o mJS do aparelho', () => {
  const semComentarios = CODIGO.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\/\/[^"'\n]*$/gm, '')

  // O mJS não garante closures nem muitos níveis de funções anónimas aninhadas; a
  // documentação da Shelly manda usar callbacks com nome + user_data.
  it('sem funções anónimas (só callbacks com nome e user_data)', () => {
    expect(semComentarios.match(/function\s*\(/g) ?? []).toHaveLength(0)
  })

  it.each([
    ['const',            /\bconst\s/],
    ['arrow function',   /=>/],
    ['template string',  /`/],
    ['classe',           /\bclass\s/],
    ['async/await',      /\b(async|await)\b/],
    ['optional chaining', /\?\./],
  ])('sem %s', (_n, re) => {
    expect(semComentarios).not.toMatch(re)
  })

  it('máximo de 5 timers: 2 periódicos no arranque', () => {
    expect((semComentarios.match(/Timer\.set\([^;]*true/g) ?? []).length).toBe(2)
  })
})
