// @vitest-environment node
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, afterEach } from 'vitest'
import {
  partirEmBlocos, respostaDigest, cabecalhoDigest, parseDesafio, gerarSegredo, avaliarVerificacao,
  criarCliente, instalar, desinstalar, executar, lerArgumentos, ESPERA_MS, NOME_SCRIPT,
} from './shelly-instalar.mjs'
import { prepararScript } from './shelly-preparar.mjs'

const BASE = readFileSync(fileURLToPath(new URL('./shelly-polo2.js', import.meta.url)), 'utf8')
const CHAVE = 'sb_publishable_AbCdEf123456'
const SEGREDO = 'segredo-de-teste-0123456789'
const PASSWORD = 'password-do-aparelho-XYZ'
const sha = t => createHash('sha256').update(t).digest('hex')

const INFO = { id: 'shellypro3-841fe8988948', model: 'SPSW-003XE16EU', gen: 2, ver: '2.0.1', app: 'Pro3', auth_en: true }
const LEITURAS = ['Shelly.GetDeviceInfo', 'Shelly.GetStatus', 'Script.List', 'Script.GetCode', 'Script.GetStatus', 'Switch.GetConfig', 'Switch.GetStatus']

// Shelly falso: implementa os métodos RPC usados e regista todas as chamadas
async function criarFake(op = {}) {
  const o = { password: null, relayOn: false, aplicaProtecoes: true, errosAoIniciar: [], morreDepois: false, corrompe: false, info: INFO, scripts: [], ...op }
  const st = {
    chamadas: [], proximoId: 5, nonces: new Set(), digestOk: 0,
    scripts: new Map(o.scripts.map(s => [s.id, { code: '', enable: false, running: false, ...s }])),
    cfg: { id: 0, initial_state: 'on', auto_off: false, auto_off_delay: 0 },
    output: o.relayOn, estadosLidos: 0,
  }
  const rpc = {
    'Shelly.GetDeviceInfo': () => o.info,
    'Shelly.GetStatus': () => ({
      'switch:0': { id: 0, output: st.output }, cloud: { connected: false }, eth: { ip: '192.168.1.50' },
      mqtt: { connected: false }, ws: { connected: false },
      sys: { restart_required: false, last_sync_ts: 1, ram_free: 100000, available_updates: {} },
    }),
    'Script.List': () => ({ scripts: [...st.scripts.values()].map(s => ({ id: s.id, name: s.name, enable: s.enable, running: s.running })) }),
    'Script.Create': p => { const id = st.proximoId++; st.scripts.set(id, { id, name: p.name, code: '', enable: false, running: false }); return { id } },
    'Script.PutCode': p => { const s = st.scripts.get(p.id); s.code = (p.append ? s.code : '') + p.code; return { len: s.code.length } },
    'Script.GetCode': p => {
      const s = st.scripts.get(p.id)
      const bytes = Buffer.from(o.corrompe ? s.code + '//x' : s.code)
      const parte = bytes.subarray(p.offset ?? 0, (p.offset ?? 0) + (p.len ?? bytes.length))
      return { data: parte.toString(), left: bytes.length - (p.offset ?? 0) - parte.length }
    },
    'Script.SetConfig': p => { Object.assign(st.scripts.get(p.id), p.config); return { restart_required: false } },
    'Script.Start': p => {
      const s = st.scripts.get(p.id); s.running = true
      if (o.aplicaProtecoes) Object.assign(st.cfg, { initial_state: 'off', auto_off: true, auto_off_delay: 3600 })
      if (o.ligaReleAoIniciar) st.output = true
      return { was_running: false }
    },
    'Script.Stop': p => { const s = st.scripts.get(p.id); s.running = false; return { was_running: true } },
    'Script.Delete': p => { st.scripts.delete(p.id); return null },
    'Script.GetStatus': p => {
      st.estadosLidos += 1
      const s = st.scripts.get(p.id)
      const running = o.morreDepois ? false : s.running
      return { id: p.id, running, errors: o.errosAoIniciar }
    },
    'Switch.GetConfig': () => st.cfg,
    'Switch.GetStatus': () => ({ id: 0, output: st.output }),
    'Switch.Set': p => { st.output = p.on; return { was_on: false } },
  }
  const servidor = createServer((req, res) => {
    let corpo = ''
    req.on('data', c => { corpo += c })
    req.on('end', () => {
      const metodo = req.url.replace('/rpc/', '')
      const params = corpo ? JSON.parse(corpo) : {}
      st.chamadas.push({ metodo, params, auth: !!req.headers.authorization })
      if (o.password) {
        const cab = req.headers.authorization
        let autenticado = false
        if (cab) {
          const d = parseDesafio(cab)
          const esperado = sha(`${sha(`admin:${INFO.id}:${o.password}`)}:${d.nonce}:${d.nc}:${d.cnonce}:auth:${sha(`POST:/rpc/${metodo}`)}`)
          autenticado = d.response === esperado && st.nonces.has(d.nonce) && d.uri === `/rpc/${metodo}` && d.algorithm === 'SHA-256'
          if (autenticado) st.digestOk += 1
        }
        if (!autenticado) {
          const nonce = String(Date.now()) + Math.random().toString(16).slice(2); st.nonces.add(nonce)
          res.writeHead(401, { 'WWW-Authenticate': `Digest qop="auth", realm="${INFO.id}", nonce="${nonce}", algorithm=SHA-256` })
          return res.end()
        }
      }
      const f = rpc[metodo]
      res.writeHead(f ? 200 : 404, { 'content-type': 'application/json' })
      res.end(JSON.stringify(f ? f(params) : { code: 404, message: 'No handler' }))
    })
  })
  await new Promise(r => servidor.listen(0, '127.0.0.1', r))
  const baseUrl = `http://127.0.0.1:${servidor.address().port}`
  return { st, baseUrl, fechar: () => new Promise(r => servidor.close(r)), metodos: () => st.chamadas.map(c => c.metodo) }
}

const abertos = []
const fake = async op => { const f = await criarFake(op); abertos.push(f); return f }
afterEach(async () => { while (abertos.length) await abertos.pop().fechar() })

const fetchOk = () => async () => ({ ok: true, status: 200, json: async () => ({ probe: 'ok' }) })
const novoLog = () => { const linhas = []; return { linhas, log: l => linhas.push(String(l)) } }
async function correr(f, extra = {}, op = {}) {
  const { linhas, log } = novoLog()
  const cliente = criarCliente({ baseUrl: f.baseUrl, password: op.password })
  const codigo = await instalar({ cliente, base: BASE, chave: CHAVE, segredo: SEGREDO, esperaMs: 0, esperar: async () => {}, fetchImpl: fetchOk(), log, ...extra, ...(op.extra ?? {}) })
  return { codigo, saida: linhas.join('\n') }
}

describe('funções puras', () => {
  it('partirEmBlocos: junta de volta ao original e respeita o limite em bytes', () => {
    const codigo = 'abc ção é ✓ '.repeat(300)
    const blocos = partirEmBlocos(codigo, 100)
    expect(blocos.join('')).toBe(codigo)
    expect(blocos.every(b => Buffer.byteLength(b) <= 100)).toBe(true)
    expect(blocos.length).toBeGreaterThan(1)
    expect(partirEmBlocos('', 100)).toEqual([])
  })

  it('digest SHA-256: resposta igual ao cálculo de referência e cabeçalho completo', () => {
    const args = { password: 'p', realm: 'r', nonce: 'n', uri: '/rpc/X', nc: '00000001', cnonce: 'c' }
    expect(respostaDigest(args)).toBe(sha(`${sha('admin:r:p')}:n:00000001:c:auth:${sha('POST:/rpc/X')}`))
    const cab = cabecalhoDigest({ password: 'p', desafio: { realm: 'r', nonce: 'n' }, uri: '/rpc/X', nc: 1, cnonce: 'c' })
    expect(parseDesafio(cab)).toMatchObject({ username: 'admin', realm: 'r', nonce: 'n', uri: '/rpc/X', nc: '00000001', cnonce: 'c', algorithm: 'SHA-256', qop: 'auth' })
    expect(cab).not.toContain('"p"')
  })

  it('gerarSegredo: ≥ 32 caracteres, aceite pelo prepararScript, aleatório', () => {
    const a = gerarSegredo(), b = gerarSegredo()
    expect(a.length).toBeGreaterThanOrEqual(32)
    expect(a).not.toBe(b)
    expect(() => prepararScript(BASE, { chave: CHAVE, segredo: a })).not.toThrow()
  })

  it('avaliarVerificacao: tudo certo não tem ERRO; cada desvio é ERRO', () => {
    const bom = { enviado: 'x', lido: 'x', estado: { running: true, errors: [] }, config: { initial_state: 'off', auto_off: true, auto_off_delay: 3600 }, rele: { output: false } }
    const erros = d => avaliarVerificacao({ ...bom, ...d }).filter(a => a.nivel === 'ERRO').length
    expect(erros({})).toBe(0)
    expect(erros({ lido: 'y' })).toBe(1)
    expect(erros({ estado: { running: false, errors: [] } })).toBe(1)
    expect(erros({ estado: { running: true, errors: ['syntax'] } })).toBe(1)
    expect(erros({ config: { ...bom.config, initial_state: 'on' } })).toBe(1)
    expect(erros({ config: { ...bom.config, auto_off_delay: 60 } })).toBe(1)
    expect(erros({ rele: { output: true } })).toBe(1)
  })

  it('a espera após o arranque é de pelo menos 8 s; lerArgumentos aceita --k=v e --k v', () => {
    expect(ESPERA_MS).toBeGreaterThanOrEqual(8000)
    expect(lerArgumentos(['--ip', '10.0.0.5', '--dry-run', '--password=a=b'])).toEqual({ ip: '10.0.0.5', 'dry-run': true, password: 'a=b' })
  })
})

describe('instalar (Shelly falso)', () => {
  it('instalação nova: cria, envia em blocos, ativa, inicia e verifica', async () => {
    const f = await fake()
    const { codigo, saida } = await correr(f)
    expect(codigo).toBe(0)
    const m = f.metodos()
    expect(m).toContain('Script.Create')
    expect(m.filter(x => x === 'Script.PutCode').length).toBeGreaterThan(1)
    const puts = f.st.chamadas.filter(c => c.metodo === 'Script.PutCode').map(c => c.params)
    expect(puts[0].append).toBe(false)
    expect(puts.slice(1).every(p => p.append === true)).toBe(true)
    expect(m.indexOf('Script.SetConfig')).toBeLessThan(m.indexOf('Script.Start'))
    const s = [...f.st.scripts.values()][0]
    expect(s.name).toBe(NOME_SCRIPT)
    expect(s.enable).toBe(true)
    expect(s.running).toBe(true)
    expect(s.code).toBe(prepararScript(BASE, { chave: CHAVE, segredo: SEGREDO }))
    expect(saida).toMatch(/pump_heartbeat/)
  })

  it('reinstalação: pára o existente e atualiza-o sem criar outro', async () => {
    const f = await fake({ scripts: [{ id: 2, name: NOME_SCRIPT, code: 'antigo', enable: true, running: true }] })
    const { codigo } = await correr(f)
    expect(codigo).toBe(0)
    expect(f.metodos()).not.toContain('Script.Create')
    expect(f.metodos().indexOf('Script.Stop')).toBeLessThan(f.metodos().indexOf('Script.PutCode'))
    expect(f.st.scripts.size).toBe(1)
    expect(f.st.scripts.get(2).code).toBe(prepararScript(BASE, { chave: CHAVE, segredo: SEGREDO }))
  })

  it('com password: faz digest SHA-256 e todas as chamadas autenticam', async () => {
    const f = await fake({ password: PASSWORD })
    const { codigo } = await correr(f, {}, { password: PASSWORD })
    expect(codigo).toBe(0)
    expect(f.st.digestOk).toBeGreaterThan(5)
  })

  it('401 sem password: erro claro e nada escrito', async () => {
    const f = await fake({ password: PASSWORD })
    const { codigo, saida } = await correr(f)
    expect(codigo).toBe(1)
    expect(saida).toMatch(/SHELLY_PASSWORD/)
    expect(saida).not.toMatch(/--password/)
    expect(f.metodos().filter(m => !m.includes('Get') && m !== 'Script.List')).toEqual([])
  })

  it('password errada: recusa e nada escrito', async () => {
    const f = await fake({ password: PASSWORD })
    const { codigo, saida } = await correr(f, {}, { password: 'errada' })
    expect(codigo).toBe(1)
    expect(saida).toMatch(/recusou a password/i)
    expect(f.st.scripts.size).toBe(0)
  })

  it('preflight com ERRO (modelo errado) aborta sem escrever', async () => {
    const f = await fake({ info: { ...INFO, model: 'SNSW-001X16EU', app: 'Plus1' } })
    const { codigo } = await correr(f)
    expect(codigo).toBe(1)
    expect(f.metodos().every(m => LEITURAS.includes(m))).toBe(true)
  })

  it('relé ligado aborta sem escrever e sem tocar no relé', async () => {
    const f = await fake({ relayOn: true })
    const { codigo, saida } = await correr(f)
    expect(codigo).toBe(1)
    expect(saida).toMatch(/relé.*ligado/i)
    expect(f.metodos().every(m => LEITURAS.includes(m))).toBe(true)
    expect(f.st.output).toBe(true) // não foi mexido
  })

  it('pré-teste do endpoint falha ⇒ aborta antes de escrever', async () => {
    const f = await fake()
    const { codigo, saida } = await correr(f, { fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }) })
    expect(codigo).toBe(1)
    expect(saida).toMatch(/recusou a chave ou o segredo/i)
    expect(f.st.scripts.size).toBe(0)
  })

  it('o pré-teste envia a chave e o segredo como o script o fará', async () => {
    const f = await fake()
    const pedidos = []
    await correr(f, { fetchImpl: async (url, o) => { pedidos.push({ url, h: o.headers }); return { ok: true, status: 200, json: async () => ({ probe: 'ok' }) } } })
    expect(pedidos[0].url).toMatch(/pump-status\?probe=1&pump_id=polo2&on=0/)
    expect(pedidos[0].h).toEqual({ apikey: CHAVE, 'x-pump-secret': SEGREDO })
  })

  it('o pré-teste só dá OK com {"probe":"ok"}: "idle" (função antiga ou segredo errado mascarado) aborta', async () => {
    const f = await fake()
    const { codigo, saida } = await correr(f, { fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ status: 'idle' }) }) })
    expect(codigo).toBe(1)
    expect(saida).toMatch(/não confirmou o segredo/i)
    expect(f.st.scripts.size).toBe(0)
  })

  it('o pré-teste com segredo errado (HTTP 401 do probe) aborta', async () => {
    const f = await fake()
    const { codigo, saida } = await correr(f, { fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ probe: 'recusado' }) }) })
    expect(codigo).toBe(1)
    expect(saida).toMatch(/recusou a chave ou o segredo/i)
  })

  it.each([
    ['proteções não aplicadas', { aplicaProtecoes: false }],
    ['script com erros', { errosAoIniciar: ['syntax error'] }],
    ['script morre depois do arranque', { morreDepois: true }],
    ['código lido diferente do enviado', { corrompe: true }],
  ])('falha de verificação (%s) ⇒ rollback (Stop, relé OFF) e código 1', async (_n, op) => {
    const f = await fake(op)
    const { codigo, saida } = await correr(f)
    expect(codigo).toBe(1)
    const m = f.metodos()
    expect(m.lastIndexOf('Script.Stop')).toBeGreaterThan(m.indexOf('Script.Start'))
    const s = [...f.st.scripts.values()][0]
    expect(s.running).toBe(false)
    expect(s.enable).toBe(false)
    expect(f.st.output).toBe(false)
    expect(saida).toMatch(/\[ERRO \]/)
  })

  it('rollback desliga mesmo o relé que ficou ligado durante a verificação (Switch.Set on:false)', async () => {
    const f = await fake({ aplicaProtecoes: false, ligaReleAoIniciar: true })
    const { codigo } = await correr(f)
    expect(codigo).toBe(1)
    expect(f.st.output).toBe(false)
    expect(f.st.chamadas.some(c => c.metodo === 'Switch.Set' && c.params.on === false)).toBe(true)
  })

  it('dry-run: só lê, não escreve nada e sai com 0', async () => {
    const f = await fake()
    const { codigo, saida } = await correr(f, { dryRun: true })
    expect(codigo).toBe(0)
    expect(f.metodos().every(m => LEITURAS.includes(m))).toBe(true)
    expect(f.st.scripts.size).toBe(0)
    expect(saida).toMatch(/dry-run/)
  })

  it('dry-run sem segredo continua a funcionar (só leitura)', async () => {
    const f = await fake()
    const { codigo } = await correr(f, { dryRun: true, segredo: undefined })
    expect(codigo).toBe(0)
    expect(f.metodos().every(m => LEITURAS.includes(m))).toBe(true)
  })

  it('instalar sem segredo falha antes de escrever', async () => {
    const f = await fake()
    const { codigo } = await correr(f, { segredo: undefined })
    expect(codigo).toBe(1)
    expect(f.st.scripts.size).toBe(0)
  })

  it('nunca chama Switch.Set com on:true (nem em instalação, nem em rollback, nem a desinstalar)', async () => {
    for (const op of [{}, { aplicaProtecoes: false }, { errosAoIniciar: ['x'] }]) {
      const f = await fake(op)
      await correr(f)
      expect(f.st.chamadas.filter(c => c.metodo === 'Switch.Set' && c.params.on !== false)).toEqual([])
    }
    const f = await fake({ scripts: [{ id: 1, name: NOME_SCRIPT, code: 'x', enable: true, running: true }] })
    await desinstalar({ cliente: criarCliente({ baseUrl: f.baseUrl }), log: () => {} })
    expect(f.st.chamadas.filter(c => c.metodo === 'Switch.Set' && c.params.on !== false)).toEqual([])
  })

  it('nunca imprime o segredo nem a password (sucesso, falha e erros)', async () => {
    const casos = [{}, { aplicaProtecoes: false }, { password: PASSWORD }]
    for (const op of casos) {
      const f = await fake(op)
      const { saida } = await correr(f, {}, { password: op.password })
      expect(saida).not.toContain(SEGREDO)
      expect(saida).not.toContain(PASSWORD)
    }
  })
})

describe('desinstalar', () => {
  it('pára, desativa e apaga o script', async () => {
    const f = await fake({ scripts: [{ id: 3, name: NOME_SCRIPT, code: 'x', enable: true, running: true }] })
    const { linhas, log } = novoLog()
    expect(await desinstalar({ cliente: criarCliente({ baseUrl: f.baseUrl }), log })).toBe(0)
    const m = f.metodos()
    expect(m.indexOf('Script.Stop')).toBeLessThan(m.indexOf('Script.Delete'))
    expect(f.st.scripts.size).toBe(0)
    expect(linhas.join('\n')).toMatch(/removido/)
  })

  it('sem o script instalado não escreve nada', async () => {
    const f = await fake()
    expect(await desinstalar({ cliente: criarCliente({ baseUrl: f.baseUrl }), log: () => {} })).toBe(0)
    expect(f.metodos().every(m => LEITURAS.includes(m))).toBe(true)
  })
})

describe('CLI (executar)', () => {
  const io = () => { const l = novoLog(); const e = []; return { ...l, err: x => e.push(x), e } }

  it.each(['8.8.8.8', '127.0.0.1', '', 'abc', '192.168.1.999'])('recusa IP não privado ou inválido «%s» (código 2) sem pedir nada à rede', async ip => {
    const { log, err, e } = io()
    expect(await executar([`--ip=${ip}`, '--dry-run'], {}, { log, err, perguntar: async () => '' })).toBe(2)
    expect(e.join('')).toMatch(/Uso/)
  })

  it('sem --ip dá erro de uso (código 2) e não sugere a password na linha de comando', async () => {
    const { log, err, e } = io()
    expect(await executar([], {}, { log, err })).toBe(2)
    expect(e.join('\n')).not.toMatch(/--password/)
    expect(e.join('\n')).toMatch(/SHELLY_PASSWORD/)
  })

  it('password como argumento: aviso para usar SHELLY_PASSWORD, sem a imprimir', async () => {
    const { linhas, log, err, e } = io()
    expect(await executar(['--ip=8.8.8.8', `--password=${PASSWORD}`], {}, { log, err })).toBe(2)
    const texto = [...linhas, ...e].join('\n')
    expect(texto).toMatch(/SHELLY_PASSWORD/)
    expect(texto).not.toContain(PASSWORD)
  })

  it('--gerar-segredo imprime um segredo válido e o comando do Supabase, sem usar a rede', async () => {
    const { linhas, log, err } = io()
    expect(await executar(['--gerar-segredo'], {}, { log, err })).toBe(0)
    const texto = linhas.join('\n')
    expect(texto).toMatch(/npx supabase secrets set PUMP_POLO2_SECRET=/)
    const segredo = texto.match(/^\s{2}([A-Za-z0-9_-]{32,})$/m)?.[1]
    expect(segredo).toBeTruthy()
    expect(() => prepararScript(BASE, { chave: CHAVE, segredo })).not.toThrow()
  })
})
