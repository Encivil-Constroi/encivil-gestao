// ================================================================
// ENCIVIL — Verificação do Shelly Pro 3 antes de instalar o script da bomba
//
//   node supabase/scripts/shelly-verificar.mjs --ip=192.168.1.156
//
// SÓ LEITURA: faz GET a 4 métodos RPC fixos (Shelly.GetDeviceInfo, Shelly.GetStatus,
// Switch.GetConfig, Script.List). Não liga relés, não escreve configuração, não instala nada.
// Recusa IPs fora de redes privadas. Sai com código 1 se houver algum ERRO.
// Com password ativa no aparelho as leituras detalhadas devolvem 401: isso conta como OK.
// ================================================================
import { pathToFileURL } from 'node:url'

const octetos = ip => (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip.split('.').map(Number) : null)

// Só redes privadas (não é um cliente HTTP genérico)
export function ipPermitido(ip) {
  const o = octetos(String(ip ?? ''))
  if (!o || o.some(n => n > 255)) return false
  return o[0] === 10 || (o[0] === 192 && o[1] === 168) || (o[0] === 172 && o[1] >= 16 && o[1] <= 31)
}

const ok = texto => ({ nivel: 'OK', texto })
const info = texto => ({ nivel: 'INFO', texto })
const aviso = texto => ({ nivel: 'AVISO', texto })
const erro = texto => ({ nivel: 'ERRO', texto })

// Avaliação pura (testada com respostas reais): recebe o que o aparelho devolveu, devolve achados.
export function avaliarShelly({ info: dev, status, scripts, bloqueadoPorPassword = false }) {
  if (!dev) return [erro('O aparelho não respondeu (IP errado, desligado ou fora da rede).')]
  const r = []

  if (dev.app === 'Pro3' && /^SPSW-003/.test(dev.model ?? '') && dev.gen >= 2) {
    r.push(ok(`Shelly Pro 3 (${dev.model}), firmware ${dev.ver}`))
  } else {
    r.push(erro(`Modelo inesperado: ${dev.model ?? '?'} (${dev.app ?? '?'}). O script foi feito para o Shelly Pro 3.`))
  }

  if (dev.auth_en) r.push(ok('Password ativa no aparelho'))
  else r.push(aviso('Sem password: qualquer pessoa na rede pode ligar o relé. Ativar em Settings → Authentication ANTES de ligar à bomba (o script não depende disto).'))

  if (bloqueadoPorPassword) {
    r.push(ok('Leituras detalhadas exigem autenticação (esperado com password ativa); verificar o resto na interface web.'))
    return r
  }
  if (!status) return [...r, erro('Não foi possível ler o estado do aparelho.')]

  const rele = status['switch:0']
  if (rele?.output === true) r.push(erro('O relé está ligado agora. Desligar antes de instalar o script (estado seguro = desligado).'))
  else r.push(ok('Relé 0 desligado'))

  if (status.cloud?.connected) r.push(aviso('Ligado à nuvem Shelly: permite controlo remoto fora da app ENCIVIL. Desativar se não for necessário.'))
  if (status.mqtt?.connected) r.push(aviso('MQTT ligado: outro sistema pode comandar o relé.'))
  if (status.ws?.connected) r.push(aviso('WebSocket de saída ligado: outro sistema pode comandar o relé.'))

  const porCabo = !!status.eth?.ip
  if (porCabo) r.push(ok(`Ligação por cabo (${status.eth.ip})`))
  else r.push(aviso('A ligar por Wi-Fi. Para a bomba, preferir cabo de rede (mais estável; o dead-man corta a bomba se a ligação cair mais de 20 s).'))
  const rssi = status.wifi?.rssi
  if (!porCabo && typeof rssi === 'number' && rssi < -75) r.push(aviso(`Sinal fraco (${rssi} dBm): risco de cortes durante o abastecimento.`))

  const sys = status.sys ?? {}
  if (sys.restart_required) r.push(aviso('O aparelho precisa de reiniciar para aplicar configuração pendente.'))
  if (sys.available_updates && Object.keys(sys.available_updates).length) r.push(aviso('Há atualização de firmware disponível (instalar fora do horário de abastecimento).'))
  if (!sys.last_sync_ts) r.push(aviso('Hora ainda não sincronizada (NTP): confirmar acesso à internet.'))
  if (typeof sys.ram_free === 'number' && sys.ram_free < 30000) r.push(aviso(`Pouca RAM livre (${sys.ram_free} bytes).`))
  const temp = rele?.temperature?.tC
  if (typeof temp === 'number' && temp > 70) r.push(aviso(`Temperatura alta (${temp} °C).`))

  const lista = scripts?.scripts ?? []
  if (lista.length === 0) r.push(ok('Nenhum script instalado (pronto para instalar o da bomba)'))
  for (const s of lista) {
    if (/encivil/i.test(s.name ?? '')) r.push(ok(`Script «${s.name}» instalado (${s.running ? 'a correr' : 'parado'})`))
    else r.push(aviso(`Script alheio «${s.name ?? s.id}»: pode comandar o relé. Confirmar o que faz.`))
  }

  r.push(info('Proteções de hardware (arranque desligado, corte automático 3600 s) são aplicadas pelo script ao arrancar.'))
  return r
}

async function ler(ip, metodo) {
  const res = await fetch(`http://${ip}/rpc/${metodo}`, { method: 'GET', signal: AbortSignal.timeout(5000) })
  if (res.status === 401) return { bloqueado: true }
  if (!res.ok) throw new Error(`${metodo}: HTTP ${res.status}`)
  return { dados: await res.json() }
}

async function principal() {
  const ip = (process.argv.find(a => a.startsWith('--ip=')) ?? '').slice(5)
  if (!ipPermitido(ip)) {
    console.error('Uso: node supabase/scripts/shelly-verificar.mjs --ip=<IP da rede local, ex. 192.168.1.156>')
    process.exitCode = 2
    return
  }

  let dev = null, status = null, scripts = null, bloqueadoPorPassword = false
  try { dev = (await ler(ip, 'Shelly.GetDeviceInfo')).dados } catch { /* aparelho inacessível */ }
  if (dev) {
    try {
      const s = await ler(ip, 'Shelly.GetStatus')
      if (s.bloqueado) bloqueadoPorPassword = true
      else {
        status = s.dados
        scripts = (await ler(ip, 'Script.List')).dados
      }
    } catch (e) { console.error(`Leitura falhou: ${e.message}`) }
  }

  const achados = avaliarShelly({ info: dev, status, scripts, bloqueadoPorPassword })
  const marca = { OK: '[ OK  ]', INFO: '[ info]', AVISO: '[AVISO]', ERRO: '[ERRO ]' }
  console.log(`\nShelly ${ip}\n`)
  for (const a of achados) console.log(`${marca[a.nivel]} ${a.texto}`)
  const n = nivel => achados.filter(a => a.nivel === nivel).length
  console.log(`\n${n('OK')} ok · ${n('AVISO')} avisos · ${n('ERRO')} erros\n`)
  process.exitCode = n('ERRO') ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal()
