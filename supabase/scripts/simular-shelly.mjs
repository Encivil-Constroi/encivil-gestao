// ================================================================
// ENCIVIL — Simulador do Shelly da bomba Polo 2
//
// Corre o shelly-polo2.js REAL contra produção, sem hardware: permite ensaiar
// o fluxo completo com o telemóvel (QR → autorizar → contagem → Terminei).
//
//   node supabase/scripts/simular-shelly.mjs --secret=<PUMP_POLO2_SECRET>
//   node supabase/scripts/simular-shelly.mjs --secret=... --nivel   (simula LIVELLO aceso)
//
// NUNCA correr ao mesmo tempo que o Shelly real: os dois consumiriam as
// mesmas autorizações e a bomba podia não ligar.
// Parar: Ctrl+C
// ================================================================
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { criarShellyEmulado } from './shelly-emulador.mjs'

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, ...v] = a.replace(/^--/, '').split('=')
  return [k, v.length ? v.join('=') : true]
}))

function chavePublicaDoEnv() {
  try {
    const env = readFileSync(fileURLToPath(new URL('../../.env.local', import.meta.url)), 'utf8')
    return env.match(/^\s*VITE_SUPABASE_PUBLISHABLE_KEY\s*=\s*"?([^"\r\n]+)"?/m)?.[1].trim()
  } catch { return undefined }
}

const segredo = typeof args.secret === 'string' ? args.secret : process.env.PUMP_POLO2_SECRET
const apiKey  = typeof args.apikey === 'string' ? args.apikey : chavePublicaDoEnv()
if (!segredo) { console.error('Falta o segredo: --secret=<PUMP_POLO2_SECRET>'); process.exit(1) }
if (!apiKey)  { console.error('Falta a chave pública: --apikey=<sb_publishable_…> (ou .env.local)'); process.exit(1) }

const hora  = () => new Date().toLocaleTimeString('pt-PT')
const cor   = (c, t) => `\x1b[${c}m${t}\x1b[0m`
const linha = t => console.log(`${cor(90, hora())}  ${t}`)
let ultimaResposta = ''

const shelly = criarShellyEmulado({
  fetch: (url, opts) => fetch(url, opts),
  log: m => linha(m),
  aoMudarRele: ({ on, segundos, origem }) => linha(on
    ? cor('1;32', `[RELÉ] LIGADO — bomba a trabalhar${segundos ? `, desliga sozinho em ${segundos}s` : ''}`)
    : cor('1;31', `[RELÉ] DESLIGADO (${origem})`)),
  aoHttp: r => {
    const resumo = r.erro ? `sem ligação (${r.erro})` : `HTTP ${r.code} ${r.body}`
    if (resumo === ultimaResposta) return
    ultimaResposta = resumo
    linha(cor(r.erro || r.code !== 200 ? 33 : 90, `[cloud] ${resumo}`))
  },
})

if (args.nivel) shelly.definirNivel(true)

const codigo = readFileSync(fileURLToPath(new URL('./shelly-polo2.js', import.meta.url)), 'utf8')
  .replace('"SUBSTITUIR_PELO_PUMP_POLO2_SECRET"', JSON.stringify(segredo))
  .replace('"SUBSTITUIR_PELA_CHAVE_PUBLICA"', JSON.stringify(apiKey))

console.log(cor('1;36', '\n  Simulador Shelly Pro 3 — Bomba Polo 2 (produção)'))
console.log(cor(90, `  LIVELLO: ${args.nivel ? 'ALARME' : 'normal'} · Ctrl+C para parar\n`))
shelly.executar(codigo)

process.on('SIGINT', () => {
  shelly.parar()
  linha(shelly.rele().ligado ? cor('1;33', 'Simulador parado com o relé LIGADO') : 'Simulador parado.')
  process.exit(0)
})
