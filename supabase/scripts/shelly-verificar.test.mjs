// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { avaliarShelly, ipPermitido } from './shelly-verificar.mjs'

// Respostas reais do aparelho de bancada (192.168.1.156), recolhidas só com leitura
const REAL = {
  info: { id: 'shellypro3-841fe8988948', model: 'SPSW-003XE16EU', gen: 2, ver: '2.0.1', app: 'Pro3', auth_en: false },
  status: {
    cloud: { connected: false }, eth: { ip: null }, mqtt: { connected: false }, ws: { connected: false },
    'switch:0': { id: 0, output: false, temperature: { tC: 40.6 } },
    sys: { restart_required: false, last_sync_ts: 1791297919, ram_free: 126264, available_updates: {} },
    wifi: { sta_ip: '192.168.1.156', status: 'got ip', ssid: 'ENCIVIL', rssi: -58 },
  },
  scripts: { scripts: [] },
}

const clone = o => JSON.parse(JSON.stringify(o))
const achados = (d, nivel) => avaliarShelly(d).filter(a => a.nivel === nivel).map(a => a.texto)

describe('avaliarShelly', () => {
  it('aparelho de bancada: nenhum ERRO; avisa password e Wi-Fi', () => {
    expect(achados(REAL, 'ERRO')).toEqual([])
    const avisos = achados(REAL, 'AVISO').join('\n')
    expect(avisos).toMatch(/password/i)
    expect(avisos).toMatch(/Wi-Fi/i)
  })

  it('relé ligado é ERRO (estado inseguro antes de instalar)', () => {
    const d = clone(REAL); d.status['switch:0'].output = true
    expect(achados(d, 'ERRO').join('\n')).toMatch(/relé.*ligado/i)
  })

  it('modelo ou geração inesperados são ERRO', () => {
    const d = clone(REAL); d.info.model = 'SNSW-001X16EU'; d.info.app = 'Plus1'
    expect(achados(d, 'ERRO').join('\n')).toMatch(/modelo/i)
  })

  it('nuvem/MQTT/WebSocket ligados são AVISO (controlo remoto fora da app)', () => {
    const d = clone(REAL); d.status.cloud.connected = true; d.status.mqtt.connected = true
    const a = achados(d, 'AVISO').join('\n')
    expect(a).toMatch(/nuvem/i)
    expect(a).toMatch(/MQTT/i)
  })

  it('com password ativa e cabo de rede não há avisos desses dois pontos', () => {
    const d = clone(REAL); d.info.auth_en = true; d.status.eth.ip = '192.168.1.50'
    const a = achados(d, 'AVISO').join('\n')
    expect(a).not.toMatch(/password/i)
    expect(a).not.toMatch(/Wi-Fi/i)
  })

  it('sinal Wi-Fi fraco, reinício pendente, atualização, hora sem sincronizar, temperatura e RAM são AVISO', () => {
    const d = clone(REAL)
    d.status.wifi.rssi = -82
    d.status.sys.restart_required = true
    d.status.sys.available_updates = { stable: { version: '2.1.0' } }
    d.status.sys.last_sync_ts = 0
    d.status['switch:0'].temperature.tC = 78
    d.status.sys.ram_free = 10_000
    const a = achados(d, 'AVISO').join('\n')
    for (const re of [/sinal/i, /reiniciar/i, /atualiza/i, /hora/i, /temperatura/i, /RAM/i]) expect(a).toMatch(re)
  })

  it('script já instalado: indica nome e se corre; scripts alheios são AVISO', () => {
    const d = clone(REAL)
    d.scripts = { scripts: [{ id: 1, name: 'encivil-bomba', enable: true, running: true }, { id: 2, name: 'outro', enable: true, running: false }] }
    expect(avaliarShelly(d).some(a => a.nivel === 'OK' && /encivil-bomba/.test(a.texto))).toBe(true)
    expect(achados(d, 'AVISO').join('\n')).toMatch(/outro/)
  })

  it('password ativa (401 nas leituras detalhadas) conta como OK', () => {
    const r = avaliarShelly({ info: { ...REAL.info, auth_en: true }, bloqueadoPorPassword: true })
    expect(r.some(a => a.nivel === 'OK' && /password/i.test(a.texto))).toBe(true)
    expect(r.filter(a => a.nivel === 'ERRO')).toEqual([])
  })

  it('sem resposta do aparelho é ERRO', () => {
    expect(avaliarShelly({ info: null }).map(a => a.nivel)).toEqual(['ERRO'])
  })
})

describe('ipPermitido', () => {
  it.each(['192.168.1.156', '10.0.0.5', '172.16.4.9', '172.31.255.1'])('aceita rede local %s', ip => {
    expect(ipPermitido(ip)).toBe(true)
  })
  it.each(['8.8.8.8', '172.32.0.1', 'shelly.local', '192.168.1.156/rpc', '192.168.1.1:80@evil.com', '', '999.1.1.1', '127.0.0.1'])('recusa %s', ip => {
    expect(ipPermitido(ip)).toBe(false)
  })
})
