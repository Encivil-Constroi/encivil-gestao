import { describe, it, expect } from 'vitest'
import {
  parseCoordenadas, interpretarLocalizacao, coordenadasValidas, formatarCoordenadas, arredondar6,
  urlEmbed, urlEmbedTexto, urlAbrir, urlNavegar, urlNavegarTexto, urlAbrirTexto,
} from '@/features/obras/lib/mapas'

const LISBOA = { lat: 38.7223, lon: -9.1399 }

describe('parseCoordenadas — coordenadas escritas à mão', () => {
  it.each([
    ['38.7223, -9.1399'],
    ['38.7223,-9.1399'],
    ['38.7223 -9.1399'],
    ['38.7223;-9.1399'],
    ['  38.7223 ,  -9.1399  '],
    ['(38.7223, -9.1399)'],
    ['38,7223; -9,1399'],
    ['38,7223 -9,1399'],
    ['38,7223, -9,1399'],
    ['38.7223\t-9.1399'],
  ])('lê "%s"', texto => {
    expect(parseCoordenadas(texto)).toEqual(LISBOA)
  })

  it('aceita inteiros e hemisfério sul/oeste negativos', () => {
    expect(parseCoordenadas('-33, 151')).toEqual({ lat: -33, lon: 151 })
    expect(parseCoordenadas('-33.8688, 151.2093')).toEqual({ lat: -33.8688, lon: 151.2093 })
  })

  it('lê graus decimais com hemisfério (N/S/E/W e O de Oeste)', () => {
    expect(parseCoordenadas('38.7223°N 9.1399°W')).toEqual(LISBOA)
    expect(parseCoordenadas('38.7223N, 9.1399W')).toEqual(LISBOA)
    expect(parseCoordenadas('38.7223° N, 9.1399° O')).toEqual(LISBOA)
    expect(parseCoordenadas('33.8688 S 151.2093 E')).toEqual({ lat: -33.8688, lon: 151.2093 })
  })

  it('lê graus, minutos e segundos (formato copiado do Google Maps)', () => {
    const c = parseCoordenadas(`38°43'20.3"N 9°08'23.4"W`)
    expect(c?.lat).toBeCloseTo(38.722306, 5)
    expect(c?.lon).toBeCloseTo(-9.139833, 5)
  })

  it('rejeita lixo, vazio e valores fora de intervalo', () => {
    expect(parseCoordenadas('')).toBeNull()
    expect(parseCoordenadas('   ')).toBeNull()
    expect(parseCoordenadas('Rua das Flores 12')).toBeNull()
    expect(parseCoordenadas('91, 10')).toBeNull()
    expect(parseCoordenadas('10, 181')).toBeNull()
    expect(parseCoordenadas('38.7223')).toBeNull()
  })
})

describe('parseCoordenadas — links do Google Maps', () => {
  it('usa o pino do local (!3d!4d) em vez do centro da vista', () => {
    const url = 'https://www.google.com/maps/place/Lisboa/@38.7077,-9.1365,13z/data=!3m1!4b1!4m6!3m5!1s0xd1933:0x1!8m2!3d38.7223!4d-9.1399!16zL20vMDRsbXM'
    expect(parseCoordenadas(url)).toEqual(LISBOA)
  })

  it('lê o centro da vista (@lat,lon,zoom)', () => {
    expect(parseCoordenadas('https://www.google.com/maps/@38.7223,-9.1399,17z')).toEqual(LISBOA)
    expect(parseCoordenadas('https://www.google.pt/maps/place/Rua+X/@38.7223,-9.1399,15z')).toEqual(LISBOA)
  })

  it('lê ?q=, ?query=, ?ll=, ?center= e ?destination=', () => {
    expect(parseCoordenadas('https://maps.google.com/?q=38.7223,-9.1399')).toEqual(LISBOA)
    expect(parseCoordenadas('https://maps.google.com/maps?q=38.7223,-9.1399&z=16&output=embed')).toEqual(LISBOA)
    expect(parseCoordenadas('https://www.google.com/maps/search/?api=1&query=38.7223,-9.1399')).toEqual(LISBOA)
    expect(parseCoordenadas('https://www.google.com/maps/search/?api=1&query=38.7223%2C-9.1399')).toEqual(LISBOA)
    expect(parseCoordenadas('https://maps.google.com/?ll=38.7223,-9.1399')).toEqual(LISBOA)
    expect(parseCoordenadas('https://www.google.com/maps?center=38.7223,-9.1399')).toEqual(LISBOA)
    expect(parseCoordenadas('https://www.google.com/maps/dir/?api=1&destination=38.7223,-9.1399')).toEqual(LISBOA)
  })

  it('lê coordenadas no caminho (/place/lat,lon, /search/lat,lon, /dir//lat,lon)', () => {
    expect(parseCoordenadas('https://www.google.com/maps/place/38.7223,-9.1399')).toEqual(LISBOA)
    expect(parseCoordenadas('https://www.google.com/maps/search/38.7223,+-9.1399')).toEqual(LISBOA)
    expect(parseCoordenadas('https://www.google.com/maps/dir//38.7223,-9.1399/')).toEqual(LISBOA)
  })

  it('lê o pb dos embeds (!2dLON!3dLAT)', () => {
    expect(parseCoordenadas('https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3!2d-9.1399!3d38.7223!2m3!1f0')).toEqual(LISBOA)
  })

  it('lê geo: e links sem protocolo', () => {
    expect(parseCoordenadas('geo:38.7223,-9.1399')).toEqual(LISBOA)
    expect(parseCoordenadas('www.google.com/maps/@38.7223,-9.1399,17z')).toEqual(LISBOA)
    expect(parseCoordenadas('maps.google.com/?q=38.7223,-9.1399')).toEqual(LISBOA)
  })

  it('aceita coordenadas do hemisfério sul/oeste em links', () => {
    expect(parseCoordenadas('https://www.google.com/maps/@-33.8688,151.2093,12z')).toEqual({ lat: -33.8688, lon: 151.2093 })
  })

  it('devolve null para links sem coordenadas (pesquisa por nome)', () => {
    expect(parseCoordenadas('https://www.google.com/maps/place/Torre+de+Belem')).toBeNull()
    expect(parseCoordenadas('https://www.google.com/maps/search/?api=1&query=Rua+das+Flores')).toBeNull()
  })
})

describe('interpretarLocalizacao', () => {
  it('devolve coordenadas arredondadas a 6 casas e a origem', () => {
    expect(interpretarLocalizacao('38.72230044, -9.13990099')).toEqual({ ok: true, lat: 38.7223, lon: -9.139901, origem: 'coordenadas' })
    expect(interpretarLocalizacao('https://www.google.com/maps/@38.7223,-9.1399,17z')).toMatchObject({ ok: true, origem: 'link' })
  })

  it('explica o que fazer com links curtos', () => {
    for (const curto of ['https://maps.app.goo.gl/AbCdEf123', 'maps.app.goo.gl/AbCdEf123', 'https://goo.gl/maps/xyz']) {
      const r = interpretarLocalizacao(curto)
      expect(r).toMatchObject({ ok: false, motivo: 'link_curto' })
      if (!r.ok) expect(r.mensagem).toMatch(/link/i)
    }
  })

  it('distingue vazio, fora de intervalo e formato desconhecido', () => {
    expect(interpretarLocalizacao('  ')).toMatchObject({ ok: false, motivo: 'vazio' })
    expect(interpretarLocalizacao('95, 10')).toMatchObject({ ok: false, motivo: 'fora_de_intervalo' })
    expect(interpretarLocalizacao('Rua das Flores')).toMatchObject({ ok: false, motivo: 'sem_coordenadas' })
    expect(interpretarLocalizacao('https://www.google.com/maps/place/Torre+de+Belem')).toMatchObject({ ok: false, motivo: 'sem_coordenadas' })
  })
})

describe('URLs do Google Maps', () => {
  it('monta embed, abrir e navegar sem chave de API', () => {
    expect(urlEmbed(38.7223, -9.1399)).toBe('https://maps.google.com/maps?q=38.7223,-9.1399&z=16&output=embed')
    expect(urlAbrir(38.7223, -9.1399)).toBe('https://www.google.com/maps/search/?api=1&query=38.7223,-9.1399')
    expect(urlNavegar(38.7223, -9.1399)).toBe('https://www.google.com/maps/dir/?api=1&destination=38.7223,-9.1399')
    expect(urlEmbed(38.7, -9.1)).not.toMatch(/key=/)
  })

  it('as variantes por texto codificam a morada', () => {
    expect(urlEmbedTexto('Rua A, 12 Lisboa')).toBe('https://maps.google.com/maps?q=Rua%20A%2C%2012%20Lisboa&z=15&output=embed')
    expect(urlAbrirTexto('Rua A')).toContain('query=Rua%20A')
    expect(urlNavegarTexto('Rua A')).toContain('destination=Rua%20A')
  })

  it('um link gerado volta a ser lido (ida e volta)', () => {
    for (const url of [urlEmbed(38.7223, -9.1399), urlAbrir(38.7223, -9.1399), urlNavegar(38.7223, -9.1399)]) {
      expect(parseCoordenadas(url)).toEqual(LISBOA)
    }
  })
})

describe('auxiliares', () => {
  it('coordenadasValidas', () => {
    expect(coordenadasValidas(0, 0)).toBe(true)
    expect(coordenadasValidas(90, 180)).toBe(true)
    expect(coordenadasValidas(90.1, 0)).toBe(false)
    expect(coordenadasValidas(0, -180.1)).toBe(false)
    expect(coordenadasValidas(NaN, 0)).toBe(false)
  })
  it('formata e arredonda a 6 casas', () => {
    expect(formatarCoordenadas(38.7223, -9.1399)).toBe('38.722300, -9.139900')
    expect(arredondar6(1.23456789)).toBe(1.234568)
  })
})
