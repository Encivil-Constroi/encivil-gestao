// Emulador mínimo da API de scripting do Shelly Pro 3 (Gen2) — o suficiente
// para correr o shelly-polo2.js real fora do aparelho (simulador e testes).
//
// Estrito de propósito: parâmetros que o firmware não aceita devolvem erro,
// para apanhar aqui o que falharia em silêncio no aparelho
// (ex.: HTTP.GET não envia headers — só HTTP.Request).

const PARAMS_PERMITIDOS = {
  'HTTP.GET':         ['url', 'timeout', 'ssl_ca'],
  'HTTP.Request':     ['method', 'url', 'body', 'headers', 'timeout', 'ssl_ca'],
  'Switch.Set':       ['id', 'on', 'toggle_after'],
  'Switch.SetConfig': ['id', 'config'],
}

const ERR_ARGUMENTO = -103
const ERR_METODO    = -114
const ERR_REDE      = -104

export function criarShellyEmulado({ fetch: fetchFn, log = console.log, aoMudarRele = () => {}, aoHttp = () => {} }) {
  const rele   = { output: false, timer: null, ate: null }
  const config = { initial_state: 'restore_last', auto_off: false, auto_off_delay: 0, in_mode: 'follow' }
  const entrada = { state: false }
  const timers = new Set()
  const inicio = Date.now()
  // Falhas injetadas pelos testes: cada contador é consumido por uma chamada
  const falhas = { switchSetErro: 0, switchSetIgnorar: 0, httpSemResposta: false }

  function mudarRele(on, segundos, origem) {
    clearTimeout(rele.timer)
    rele.timer = null
    rele.ate = null
    rele.output = on
    // toggle_after tem prioridade; sem ele aplica-se o auto_off configurado
    const delay = segundos ?? (on && config.auto_off ? config.auto_off_delay : null)
    if (delay) {
      rele.ate = Date.now() + delay * 1000
      rele.timer = setTimeout(() => mudarRele(!on, null, 'temporizador'), delay * 1000)
    }
    aoMudarRele({ on, segundos: delay, origem })
  }

  // O firmware passa o 4.º argumento de Shelly.call ao callback (user_data)
  function responderBase(cb, resultado, erro, msg, ud) {
    Promise.resolve().then(() => cb?.(resultado, erro, msg, ud))
  }

  async function http(metodo, url, headers, timeoutSeg) {
    let timeoutId
    const limite = new Promise((_, rej) => {
      timeoutId = setTimeout(() => rej(new Error('timeout')), (timeoutSeg ?? 15) * 1000)
    })
    try {
      const res = await Promise.race([fetchFn(url, { method: metodo, headers }), limite])
      return { code: res.status, message: res.statusText ?? '', headers: {}, body: await res.text() }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  const Shelly = {
    call(metodo, params = {}, cb, ud) {
      const responder = (c, resultado, erro = 0, msg = '') => responderBase(c, resultado, erro, msg, ud)
      const permitidos = PARAMS_PERMITIDOS[metodo]
      if (!permitidos) return responder(cb, undefined, ERR_METODO, `Método desconhecido: ${metodo}`)
      const invalidos = Object.keys(params).filter(k => !permitidos.includes(k))
      if (invalidos.length) {
        return responder(cb, undefined, ERR_ARGUMENTO, `${metodo} não aceita: ${invalidos.join(', ')}`)
      }

      if (metodo === 'Switch.SetConfig') {
        if (params.id !== 0) return responder(cb, undefined, ERR_ARGUMENTO, 'id inválido')
        Object.assign(config, params.config)
        return responder(cb, { restart_required: false })
      }
      if (metodo === 'Switch.Set') {
        if (params.id !== 0) return responder(cb, undefined, ERR_ARGUMENTO, 'id inválido')
        if (falhas.switchSetErro > 0) { falhas.switchSetErro--; return responder(cb, undefined, ERR_REDE, 'falha injetada') }
        if (falhas.switchSetIgnorar > 0) { falhas.switchSetIgnorar--; return responder(cb, { was_on: rele.output }) }
        const estava = rele.output
        mudarRele(params.on === true, params.toggle_after ?? null, 'Switch.Set')
        return responder(cb, { was_on: estava })
      }

      if (falhas.httpSemResposta) return
      const req = metodo === 'HTTP.GET'
        ? http('GET', params.url, undefined, params.timeout)
        : http(params.method ?? 'GET', params.url, params.headers, params.timeout)
      req.then(
        r => { aoHttp({ code: r.code, body: r.body }); responder(cb, r) },
        e => { aoHttp({ erro: String(e?.message ?? e) }); responder(cb, undefined, ERR_REDE, String(e?.message ?? e)) },
      )
    },

    getUptimeMs() { return Date.now() - inicio },

    getComponentStatus(tipo, id) {
      const [t, i] = String(tipo).includes(':') ? String(tipo).split(':') : [tipo, id]
      if (Number(i) !== 0) return null
      if (t === 'switch') return { id: 0, output: rele.output }
      if (t === 'input')  return { id: 0, state: entrada.state }
      return null
    },
  }

  const Timer = {
    set(ms, repetir, fn, dados) {
      const h = repetir ? setInterval(() => fn(dados), ms) : setTimeout(() => fn(dados), ms)
      timers.add(h)
      return h
    },
    clear(h) { clearInterval(h); clearTimeout(h); timers.delete(h) },
  }

  return {
    executar(codigo) {
      new Function('Shelly', 'Timer', 'print', codigo)(Shelly, Timer, (...a) => log(a.join(' ')))
    },
    rele: () => ({ ligado: rele.output, desligaEm: rele.ate }),
    config: () => ({ ...config }),
    definirNivel(alarme) { entrada.state = alarme },
    injetar(f) { Object.assign(falhas, f) },
    // Simula alguém a ligar o relé pela app Shelly / Web UI (sem toggle_after)
    ligarManualmente() { mudarRele(true, null, 'manual') },
    parar() {
      for (const h of timers) { clearInterval(h); clearTimeout(h) }
      timers.clear()
      clearTimeout(rele.timer)
    },
  }
}
