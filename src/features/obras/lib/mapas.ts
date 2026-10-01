// Mapas sem chave de API: lê coordenadas escritas à mão ou coladas de um link do
// Google Maps e monta os endereços de pré-visualização (iframe), abrir e navegar.

export type Coordenadas = { lat: number; lon: number }

export type Interpretacao =
  | { ok: true; lat: number; lon: number; origem: 'coordenadas' | 'link' }
  | { ok: false; motivo: 'vazio' | 'link_curto' | 'sem_coordenadas' | 'fora_de_intervalo'; mensagem: string }

const NUM = String.raw`-?\d+(?:[.,]\d+)?`

export function coordenadasValidas(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
}

const paraNumero = (s: string) => Number(s.replace(',', '.'))

// Seis casas decimais (~11 cm): o mesmo que a coluna numeric(9,6) guarda
export function arredondar6(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

export function formatarCoordenadas(lat: number, lon: number): string {
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`
}

function par(a: string, b: string): Coordenadas | null {
  const lat = paraNumero(a)
  const lon = paraNumero(b)
  return coordenadasValidas(lat, lon) ? { lat, lon } : null
}

// "38.7223, -9.1399" · "38,7223 -9,1399" · "38.7223;-9.1399"
function parCru(texto: string): Coordenadas | null {
  const m = new RegExp(String.raw`^\s*\(?\s*(${NUM})\s*[,;\s]\s*(${NUM})\s*\)?\s*$`).exec(texto)
  return m ? par(m[1], m[2]) : null
}

// 38.7223°N 9.1399°W · 38°43'20.3"N 9°08'23.4"W (também O de Oeste)
function comHemisferio(texto: string): Coordenadas | null {
  const re = new RegExp(
    String.raw`(\d+(?:[.,]\d+)?)\s*[°º]?\s*(?:(\d+(?:[.,]\d+)?)\s*['′’]\s*)?(?:(\d+(?:[.,]\d+)?)\s*(?:"|″|”|'')\s*)?([NSEWO])`,
    'gi',
  )
  const achados = [...texto.matchAll(re)]
  if (achados.length !== 2) return null
  let lat: number | null = null
  let lon: number | null = null
  for (const a of achados) {
    const graus = paraNumero(a[1]) + (a[2] ? paraNumero(a[2]) / 60 : 0) + (a[3] ? paraNumero(a[3]) / 3600 : 0)
    const h = a[4].toUpperCase()
    if (h === 'N' || h === 'S') lat = h === 'S' ? -graus : graus
    else lon = h === 'W' || h === 'O' ? -graus : graus
  }
  if (lat == null || lon == null) return null
  return coordenadasValidas(lat, lon) ? { lat, lon } : null
}

const DEC = String.raw`-?\d+\.\d+`

function deLinkGoogle(bruto: string): Coordenadas | null {
  let texto = bruto
  try { texto = decodeURIComponent(bruto.replace(/\+/g, ' ')) } catch { /* mantém o texto cru */ }

  // O pino do local (!3d..!4d..) é mais exato do que o centro da vista (@lat,lon)
  const pino = new RegExp(`!3d(${DEC})!4d(${DEC})`).exec(texto)
  if (pino) return par(pino[1], pino[2])
  const embed = new RegExp(`!2d(${DEC})!3d(${DEC})`).exec(texto)
  if (embed) return par(embed[2], embed[1])
  const vista = new RegExp(`@(${DEC}),(${DEC})`).exec(texto)
  if (vista) return par(vista[1], vista[2])

  for (const chave of ['q', 'query', 'll', 'destination', 'daddr', 'center', 'saddr']) {
    const m = new RegExp(`[?&]${chave}=([^&#]+)`).exec(texto)
    if (!m) continue
    const valor = m[1].trim()
    const c = parCru(valor) ?? comHemisferio(valor)
    if (c) return c
  }

  const geo = new RegExp(`^geo:(${DEC}),(${DEC})`).exec(texto.trim())
  if (geo) return par(geo[1], geo[2])

  const caminho = new RegExp(`/(${DEC}),\\s*(${DEC})(?:[/?#,]|$)`).exec(texto)
  if (caminho) return par(caminho[1], caminho[2])
  return null
}

function eLinkCurto(texto: string): boolean {
  return /(?:^|\/\/)(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)/i.test(texto.trim())
}

function pareceLink(texto: string): boolean {
  return /^(?:https?:\/\/|geo:|www\.|maps\.google|google\.[a-z.]+\/maps)/i.test(texto.trim())
}

export function parseCoordenadas(texto: string): Coordenadas | null {
  const t = texto.trim()
  if (!t) return null
  if (pareceLink(t)) return deLinkGoogle(t)
  return parCru(t) ?? comHemisferio(t)
}

export function interpretarLocalizacao(texto: string): Interpretacao {
  const t = texto.trim()
  if (!t) return { ok: false, motivo: 'vazio', mensagem: 'Cole um link do Google Maps ou escreva as coordenadas.' }
  if (eLinkCurto(t)) {
    return {
      ok: false, motivo: 'link_curto',
      mensagem: 'Os links curtos (maps.app.goo.gl) não podem ser lidos aqui. Abra o link, copie o endereço completo da barra do browser (ou as coordenadas) e cole-o.',
    }
  }
  const link = pareceLink(t)
  const c = parseCoordenadas(t)
  if (c) return { ok: true, lat: arredondar6(c.lat), lon: arredondar6(c.lon), origem: link ? 'link' : 'coordenadas' }
  const cru = /^\s*\(?\s*-?\d+(?:[.,]\d+)?\s*[,;\s]\s*-?\d+(?:[.,]\d+)?\s*\)?\s*$/.test(t)
  if (cru) {
    return { ok: false, motivo: 'fora_de_intervalo', mensagem: 'Coordenadas fora do intervalo: latitude entre −90 e 90, longitude entre −180 e 180.' }
  }
  return {
    ok: false, motivo: 'sem_coordenadas',
    mensagem: link
      ? 'Não encontrei coordenadas neste link. No Google Maps toque longamente no local, abra o pino e copie o link ou as coordenadas.'
      : 'Formato não reconhecido. Exemplo: 38.7223, -9.1399',
  }
}

const GOOGLE_MAPS = 'https://www.google.com/maps'

const par6 = (lat: number, lon: number) => `${lat},${lon}`

export function urlEmbed(lat: number, lon: number, zoom = 16): string {
  return `https://maps.google.com/maps?q=${par6(lat, lon)}&z=${zoom}&output=embed`
}

export function urlEmbedTexto(texto: string, zoom = 15): string {
  return `https://maps.google.com/maps?q=${encodeURIComponent(texto)}&z=${zoom}&output=embed`
}

export function urlAbrir(lat: number, lon: number): string {
  return `${GOOGLE_MAPS}/search/?api=1&query=${par6(lat, lon)}`
}

export function urlAbrirTexto(texto: string): string {
  return `${GOOGLE_MAPS}/search/?api=1&query=${encodeURIComponent(texto)}`
}

export function urlNavegar(lat: number, lon: number): string {
  return `${GOOGLE_MAPS}/dir/?api=1&destination=${par6(lat, lon)}`
}

export function urlNavegarTexto(texto: string): string {
  return `${GOOGLE_MAPS}/dir/?api=1&destination=${encodeURIComponent(texto)}`
}
