// ================================================================
// ENCIVIL — Instala o script da bomba num Shelly Pro 3 com UM comando
//
//   $env:PUMP_POLO2_SECRET = "<segredo>"      # PowerShell  (export no Git Bash)
//   $env:SHELLY_PASSWORD   = "<do aparelho>"  # só se o aparelho tiver password
//   node supabase/scripts/shelly-instalar.mjs --ip=192.168.1.156
//
//   --dry-run         só lê o aparelho e valida tudo; não escreve nada
//   --desinstalar     pára, desativa e apaga o script «encivil-bomba»
//   --gerar-segredo   imprime um segredo novo e o comando para o guardar no Supabase
//   --chave=<sb_publishable_…>   por defeito lê VITE_SUPABASE_PUBLISHABLE_KEY de .env.local
//
// Password do aparelho: SHELLY_PASSWORD (utilizador «admin», digest SHA-256). Ainda se aceita
// como argumento, com aviso: na linha de comando fica no histórico do terminal.
// Pré-teste: pump-status?probe=1 só dá OK com {"probe":"ok"} (segredo confirmado pelo servidor).
// Segredo da bomba: PUMP_POLO2_SECRET ou pedido sem eco no terminal. Nunca é impresso.
// Nunca liga o relé (só envia Switch.Set com on:false). Só IPs de redes privadas.
// Saída: 0 = ok · 1 = falhou (tenta deixar tudo parado e desligado) · 2 = uso errado.
// ================================================================
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ipPermitido, avaliarShelly } from './shelly-verificar.mjs'
import { prepararScript } from './shelly-preparar.mjs'

export const NOME_SCRIPT = 'encivil-bomba'
export const ESPERA_MS = 9000 // > 8 s: o script tem de continuar a correr depois do arranque
export const TAMANHO_BLOCO = 1024

const MARCA = { OK: '[ OK  ]', INFO: '[ info]', AVISO: '[AVISO]', ERRO: '[ERRO ]' }
const sha256 = texto => createHash('sha256').update(texto).digest('hex')

// ── Funções puras ─────────────────────────────────────────────────

// Parte o código em blocos de, no máximo, n bytes UTF-8 sem cortar caracteres a meio
export function partirEmBlocos(codigo, n = TAMANHO_BLOCO) {
  if (!Number.isInteger(n) || n < 4) throw new Error('Tamanho de bloco inválido.')
  const blocos = []
  let atual = '', bytes = 0
  for (const c of codigo) {
    const b = Buffer.byteLength(c)
    if (bytes + b > n) { blocos.push(atual); atual = ''; bytes = 0 }
    atual += c
    bytes += b
  }
  if (atual) blocos.push(atual)
  return blocos
}

export function parseDesafio(cabecalho) {
  const desafio = {}
  for (const m of String(cabecalho ?? '').replace(/^\s*Digest\s+/i, '').matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]+))/g)) {
    desafio[m[1].toLowerCase()] = m[2] ?? m[3]
  }
  return desafio
}

export function respostaDigest({ utilizador = 'admin', password, realm, nonce, metodo = 'POST', uri, nc, cnonce, qop = 'auth' }) {
  const ha1 = sha256(`${utilizador}:${realm}:${password}`)
  const ha2 = sha256(`${metodo}:${uri}`)
  return sha256(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
}

export function cabecalhoDigest({ utilizador = 'admin', password, desafio, metodo = 'POST', uri, nc = 1, cnonce = randomBytes(8).toString('hex') }) {
  const ncHex = Number(nc).toString(16).padStart(8, '0')
  const response = respostaDigest({ utilizador, password, realm: desafio.realm, nonce: desafio.nonce, metodo, uri, nc: ncHex, cnonce, qop: 'auth' })
  return `Digest username="${utilizador}", realm="${desafio.realm}", nonce="${desafio.nonce}", uri="${uri}", `
    + `algorithm=SHA-256, qop=auth, nc=${ncHex}, cnonce="${cnonce}", response="${response}"`
}

// Segredo aleatório (43 caracteres A-Z a-z 0-9 _ -, aceite por prepararScript)
export function gerarSegredo() {
  return randomBytes(32).toString('base64url')
}

// Verificação final (pura): recebe o que o aparelho devolveu e devolve achados
export function avaliarVerificacao({ enviado, lido, estado, config, rele }) {
  const r = []
  const ok = t => r.push({ nivel: 'OK', texto: t })
  const erro = t => r.push({ nivel: 'ERRO', texto: t })

  if (lido === enviado) ok('O código guardado no aparelho é igual ao enviado')
  else erro('O código guardado no aparelho é diferente do enviado (escrita incompleta).')

  if (estado?.running === true) ok('Script a correr (depois de aguardar o arranque)')
  else erro('O script não está a correr.')
  if (Array.isArray(estado?.errors) && estado.errors.length) erro(`O script reportou erros: ${estado.errors.join(', ')}`)
  else ok('Script sem erros')

  if (config?.initial_state === 'off') ok('Arranque do relé = desligado')
  else erro(`Estado inicial do relé = «${config?.initial_state ?? '?'}» (esperado «off»). O script não aplicou as proteções.`)
  if (config?.auto_off === true && config?.auto_off_delay === 3600) ok('Corte automático de hardware: 3600 s')
  else erro(`Corte automático inesperado (auto_off=${config?.auto_off}, delay=${config?.auto_off_delay}); esperado ligado a 3600 s.`)

  if (rele?.output === false) ok('Relé 0 desligado')
  else erro('O relé não está desligado.')
  return r
}

const temErro = achados => achados.some(a => a.nivel === 'ERRO')

// ── Cliente RPC Gen2 (HTTP POST, digest SHA-256 quando há 401) ───────

export class ErroShelly extends Error {
  constructor(mensagem, motivo) {
    super(mensagem)
    this.motivo = motivo
  }
}

export function criarCliente({ baseUrl, password, utilizador = 'admin', fetchImpl = fetch, tempoMs = 8000 }) {
  let desafio = null
  let nc = 0

  async function rpc(metodo, params = {}, podeDesafiar = true) {
    const uri = `/rpc/${metodo}`
    const headers = { 'content-type': 'application/json' }
    if (desafio && password) {
      nc += 1
      headers.authorization = cabecalhoDigest({ utilizador, password, desafio, uri, nc })
    }
    let res
    try {
      res = await fetchImpl(baseUrl + uri, { method: 'POST', headers, body: JSON.stringify(params), signal: AbortSignal.timeout(tempoMs) })
    } catch {
      throw new ErroShelly(`${metodo}: o aparelho não respondeu.`, 'rede')
    }
    if (res.status === 401) {
      if (!password) throw new ErroShelly('O aparelho exige password. Definir a variável SHELLY_PASSWORD e repetir.', 'sem-password')
      const cab = res.headers.get('www-authenticate')
      if (podeDesafiar && cab) {
        desafio = parseDesafio(cab)
        nc = 0
        return rpc(metodo, params, false)
      }
      throw new ErroShelly('O aparelho recusou a password.', 'password-errada')
    }
    let corpo = null
    try { corpo = await res.json() } catch { /* corpo vazio ou inválido */ }
    if (!res.ok) throw new ErroShelly(`${metodo}: ${corpo?.message ?? `HTTP ${res.status}`}`, 'rpc')
    return corpo
  }
  return { rpc }
}

// ── Fluxo ─────────────────────────────────────────────────────────

async function lerOpcional(cliente, metodo, params) {
  try { return await cliente.rpc(metodo, params) } catch (e) {
    if (e.motivo === 'sem-password' || e.motivo === 'password-errada') throw e
    return null
  }
}

// Leitura pura do aparelho (nenhuma escrita)
async function inspecionar(cliente) {
  const info = await lerOpcional(cliente, 'Shelly.GetDeviceInfo')
  if (!info) return { info: null }
  const status = await lerOpcional(cliente, 'Shelly.GetStatus')
  const scripts = status ? await lerOpcional(cliente, 'Script.List') : null
  return { info, status, scripts }
}

async function lerCodigo(cliente, id) {
  let dados = '', desloc = 0
  for (let i = 0; i < 1000; i += 1) {
    const r = await cliente.rpc('Script.GetCode', { id, offset: desloc, len: TAMANHO_BLOCO })
    dados += r?.data ?? ''
    if (!r?.left) break
    desloc += Buffer.byteLength(r.data ?? '')
  }
  return dados
}

// Estado seguro: script parado, desativado, relé desligado (só on:false)
async function reverter(cliente, id, log) {
  const passos = [
    ['Script.Stop', { id }],
    ['Script.SetConfig', { id, config: { enable: false } }],
    ['Switch.Set', { id: 0, on: false }],
  ]
  for (const [metodo, params] of passos) {
    try { await cliente.rpc(metodo, params) } catch { log(`${MARCA.AVISO} Reversão: ${metodo} falhou; confirmar o aparelho na interface web.`) }
  }
}

// Pré-teste do endpoint com os cabeçalhos que o script usará. probe=1: o servidor só
// valida o segredo (não toca na bomba) e diz a verdade — o poll normal responde
// "idle" mesmo com o segredo errado, por isso não serve de prova.
export async function pretestarEndpoint({ apiUrl, chave, segredo, fetchImpl = fetch }) {
  try {
    const res = await fetchImpl(`${apiUrl}?probe=1&pump_id=polo2&on=0&nivel=0`, {
      method: 'GET',
      headers: { apikey: chave, 'x-pump-secret': segredo },
      signal: AbortSignal.timeout(8000),
    })
    if (res.status === 401 || res.status === 403) return { nivel: 'ERRO', texto: `O servidor recusou a chave ou o segredo (HTTP ${res.status}). Confirmar PUMP_POLO2_SECRET no Supabase.` }
    if (!res.ok) return { nivel: 'ERRO', texto: `O endpoint pump-status respondeu HTTP ${res.status}.` }
    const corpo = await res.json().catch(() => null)
    if (corpo?.probe !== 'ok') return { nivel: 'ERRO', texto: 'O endpoint pump-status não confirmou o segredo (publicar a versão nova da Edge Function pump-status e repetir).' }
    return { nivel: 'OK', texto: 'Endpoint pump-status confirmou a chave e o segredo' }
  } catch {
    return { nivel: 'ERRO', texto: 'Não foi possível contactar o endpoint pump-status (sem internet?).' }
  }
}

function mostrar(log, achados) {
  for (const a of achados) log(`${MARCA[a.nivel]} ${a.texto}`)
}

function sqlHeartbeat() {
  return 'select pump_id, last_seen_at, relay_on, nivel_alarme from public.pump_heartbeat order by last_seen_at desc limit 3;'
}

export async function instalar({
  cliente, base, chave, segredo, dryRun = false, esperaMs = ESPERA_MS,
  fetchImpl = fetch, esperar = ms => new Promise(r => setTimeout(r, ms)), log = console.log,
}) {
  const achados = []
  const falha = () => 1

  // 1. Preflight (só leitura)
  let leitura
  try { leitura = await inspecionar(cliente) } catch (e) { log(`${MARCA.ERRO} ${e.message}`); return 1 }
  const pre = avaliarShelly({ info: leitura.info, status: leitura.status, scripts: leitura.scripts })
  mostrar(log, pre)
  if (temErro(pre)) { log('\nInstalação abortada: corrigir os ERROS acima.'); return 1 }
  if (!leitura.status) { log(`${MARCA.ERRO} Não foi possível ler o estado do aparelho.`); return 1 }

  // 2. Validar chave/segredo e pré-testar o endpoint
  let codigo = null
  if (segredo) {
    try { codigo = prepararScript(base, { chave, segredo }) } catch (e) { log(`${MARCA.ERRO} ${e.message}`); return 1 }
    const apiUrl = base.match(/api_url:\s*"([^"]+)"/)?.[1]
    const pt = await pretestarEndpoint({ apiUrl, chave, segredo, fetchImpl })
    mostrar(log, [pt])
    if (pt.nivel === 'ERRO') { log('\nInstalação abortada: o aparelho não conseguiria falar com o servidor.'); return 1 }
  } else if (dryRun) {
    log(`${MARCA.AVISO} Segredo não indicado: pré-teste do endpoint e preparação do script ignorados neste dry-run.`)
  } else {
    log(`${MARCA.ERRO} Falta o segredo da bomba (PUMP_POLO2_SECRET).`)
    return 1
  }

  const existente = (leitura.scripts?.scripts ?? []).find(s => s.name === NOME_SCRIPT)
  if (dryRun) {
    log(`\n[dry-run] Faria: ${existente ? `parar e atualizar o script «${NOME_SCRIPT}» (id ${existente.id})` : `criar o script «${NOME_SCRIPT}»`}, `
      + `enviar o código em ${codigo ? partirEmBlocos(codigo).length : '?'} blocos, ativar «Run on startup», iniciar e verificar. Nada foi escrito.`)
    return 0
  }

  // 3. Escrita
  let id = existente?.id
  try {
    if (existente) {
      await cliente.rpc('Script.Stop', { id }).catch(() => null) // já parado = erro inofensivo
      log(`${MARCA.INFO} A atualizar o script existente (id ${id})`)
    } else {
      id = (await cliente.rpc('Script.Create', { name: NOME_SCRIPT })).id
      log(`${MARCA.INFO} Script «${NOME_SCRIPT}» criado (id ${id})`)
    }
    const blocos = partirEmBlocos(codigo)
    for (let i = 0; i < blocos.length; i += 1) await cliente.rpc('Script.PutCode', { id, code: blocos[i], append: i > 0 })
    await cliente.rpc('Script.SetConfig', { id, config: { name: NOME_SCRIPT, enable: true } })
    await cliente.rpc('Script.Start', { id })
    log(`${MARCA.INFO} Código enviado (${blocos.length} blocos); a aguardar ${Math.round(esperaMs / 1000)} s pelo arranque…`)
    await esperar(esperaMs)

    // 4. Verificação
    const lido = await lerCodigo(cliente, id)
    const estado = await cliente.rpc('Script.GetStatus', { id })
    const config = await cliente.rpc('Switch.GetConfig', { id: 0 })
    const rele = await cliente.rpc('Switch.GetStatus', { id: 0 })
    const ver = avaliarVerificacao({ enviado: codigo, lido, estado, config, rele })
    mostrar(log, ver)
    achados.push(...ver)
  } catch (e) {
    log(`${MARCA.ERRO} ${e.message}`)
    achados.push({ nivel: 'ERRO', texto: e.message })
  }

  if (temErro(achados)) {
    log('\nA verificação falhou: a parar o script e a garantir o relé desligado.')
    if (id !== undefined) await reverter(cliente, id, log)
    return falha()
  }
  log(`\nInstalado e verificado. Prova de que o segredo bate certo (SQL só de leitura, dentro de ~10 s):\n  ${sqlHeartbeat()}`)
  return 0
}

export async function desinstalar({ cliente, log = console.log }) {
  let leitura
  try { leitura = await inspecionar(cliente) } catch (e) { log(`${MARCA.ERRO} ${e.message}`); return 1 }
  if (!leitura.info || !leitura.scripts) { log(`${MARCA.ERRO} Não foi possível ler o aparelho.`); return 1 }
  const existente = leitura.scripts.scripts.find(s => s.name === NOME_SCRIPT)
  if (!existente) { log(`${MARCA.OK} O script «${NOME_SCRIPT}» não está instalado; nada a fazer.`); return 0 }
  try {
    await cliente.rpc('Script.Stop', { id: existente.id }).catch(() => null)
    await cliente.rpc('Script.SetConfig', { id: existente.id, config: { enable: false } })
    if (leitura.status?.['switch:0']?.output === true) await cliente.rpc('Switch.Set', { id: 0, on: false })
    await cliente.rpc('Script.Delete', { id: existente.id })
    const depois = await cliente.rpc('Script.List')
    if (depois.scripts.some(s => s.id === existente.id)) throw new ErroShelly('O script continua instalado.')
  } catch (e) { log(`${MARCA.ERRO} ${e.message}`); return 1 }
  log(`${MARCA.OK} Script «${NOME_SCRIPT}» parado e removido. Relé deixado desligado.`)
  return 0
}

// ── CLI ───────────────────────────────────────────────────────────

export function lerArgumentos(argv) {
  const a = {}
  for (let i = 0; i < argv.length; i += 1) {
    const m = argv[i].match(/^--([\w-]+)(?:=(.*))?$/)
    if (!m) continue
    if (m[2] !== undefined) a[m[1]] = m[2]
    else if (['dry-run', 'desinstalar', 'gerar-segredo'].includes(m[1])) a[m[1]] = true
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) { a[m[1]] = argv[i + 1]; i += 1 }
    else a[m[1]] = true
  }
  return a
}

function chaveDoEnv() {
  try {
    const env = readFileSync(fileURLToPath(new URL('../../.env.local', import.meta.url)), 'utf8')
    return env.match(/^\s*VITE_SUPABASE_PUBLISHABLE_KEY\s*=\s*"?([^"\r\n]+)"?/m)?.[1].trim()
  } catch { return undefined }
}

function pedirOculto(pergunta) {
  return new Promise(resolve => {
    const { stdin, stdout } = process
    if (!stdin.isTTY) return resolve('')
    stdout.write(pergunta)
    let texto = ''
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    const fim = () => { stdin.setRawMode(false); stdin.pause(); stdin.off('data', aoLer); stdout.write('\n'); resolve(texto) }
    const aoLer = c => {
      for (const ch of c) {
        if (ch === '\r' || ch === '\n') return fim()
        if (ch === '\u0003') { stdin.setRawMode(false); process.exit(130) }
        if (ch === '\u007f' || ch === '\b') texto = texto.slice(0, -1)
        else texto += ch
      }
    }
    stdin.on('data', aoLer)
  })
}

export async function executar(argv, env = process.env, { log = console.log, err = console.error, perguntar = pedirOculto } = {}) {
  const args = lerArgumentos(argv)

  if (args['gerar-segredo']) {
    log(`\nSegredo novo (guardar já; não voltar a aparecer):\n  ${gerarSegredo()}\n`)
    log('Para o guardar no Supabase (substituir <segredo> pelo valor acima) e depois instalar no aparelho:')
    log('  npx supabase secrets set PUMP_POLO2_SECRET=<segredo>')
    log('  $env:PUMP_POLO2_SECRET = "<segredo>"; node supabase/scripts/shelly-instalar.mjs --ip=<IP>\n')
    return 0
  }

  if (typeof args.password === 'string') {
    log(`${MARCA.AVISO} Password passada como argumento: fica no histórico do terminal. Usar a variável SHELLY_PASSWORD.`)
  }
  const ip = typeof args.ip === 'string' ? args.ip : ''
  if (!ipPermitido(ip)) {
    err('Uso: node supabase/scripts/shelly-instalar.mjs --ip=<IP da rede local> [--dry-run | --desinstalar | --gerar-segredo]')
    err('Password do aparelho (se tiver): variável SHELLY_PASSWORD.')
    return 2
  }
  const password = (typeof args.password === 'string' ? args.password : '') || env.SHELLY_PASSWORD || undefined
  const cliente = criarCliente({ baseUrl: `http://${ip}`, password })
  log(`\nShelly ${ip}\n`)

  if (args.desinstalar) return desinstalar({ cliente, log })

  let segredo = env.PUMP_POLO2_SECRET
  if (!segredo && !args['dry-run']) segredo = await perguntar('Segredo da bomba (PUMP_POLO2_SECRET, sem eco): ')
  const chave = (typeof args.chave === 'string' ? args.chave : '') || chaveDoEnv()
  const base = readFileSync(fileURLToPath(new URL('./shelly-polo2.js', import.meta.url)), 'utf8')
  return instalar({ cliente, base, chave, segredo, dryRun: !!args['dry-run'], log })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  executar(process.argv.slice(2)).then(c => { process.exitCode = c })
}
