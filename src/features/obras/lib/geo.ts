const RAIO_TERRA_M = 6_371_000
const rad = (g: number) => (g * Math.PI) / 180

/** Haversine em metros; espelha `_distancia_m`. */
export function distanciaM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1)
  const dLon = rad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * RAIO_TERRA_M * Math.asin(Math.min(1, Math.sqrt(a)))
}

export type MotivoEvidencia = 'sem_gps' | 'obra_sem_coordenadas' | 'precisao_insuficiente' | 'fora_do_raio'

export type EntradaEvidencia = {
  lat: number | null
  lon: number | null
  precisaoM: number | null
  obraLat: number | null
  obraLon: number | null
  raioObraM: number | null
}

export type CfgEvidencia = { raio_padrao_m: number; precisao_max_m: number }

export type AvaliacaoEvidencia = {
  valida: boolean
  dentroObra: boolean | null
  distanciaM: number | null
  precisaoOk: boolean | null
  motivo: MotivoEvidencia | null
}

export const MOTIVO_EVIDENCIA: Record<MotivoEvidencia, string> = {
  sem_gps: 'Sem localização GPS.',
  obra_sem_coordenadas: 'A obra não tem coordenadas definidas.',
  precisao_insuficiente: 'Precisão do GPS insuficiente.',
  fora_do_raio: 'Fotografia tirada fora do raio da obra.',
}

/** Pré-visualização das marcas do servidor (`auto_registar_evidencia`); o servidor decide. */
export function avaliarEvidencia(e: EntradaEvidencia, cfg: CfgEvidencia): AvaliacaoEvidencia {
  const semGps = e.lat === null || e.lon === null
  const obraSemCoord = e.obraLat === null || e.obraLon === null
  const precisaoOk = e.precisaoM === null ? null : e.precisaoM <= cfg.precisao_max_m
  const dist = !semGps && !obraSemCoord
    ? Math.round(distanciaM(e.lat as number, e.lon as number, e.obraLat as number, e.obraLon as number) * 10) / 10
    : null
  const raio = e.raioObraM ?? cfg.raio_padrao_m
  const dentro = dist === null ? null : dist <= raio

  let motivo: MotivoEvidencia | null = null
  if (semGps) motivo = 'sem_gps'
  else if (obraSemCoord) motivo = 'obra_sem_coordenadas'
  else if (precisaoOk === false || e.precisaoM === null) motivo = 'precisao_insuficiente'
  else if (dentro === false) motivo = 'fora_do_raio'

  return { valida: motivo === null, dentroObra: dentro, distanciaM: dist, precisaoOk, motivo }
}

const MARGEM_FUTURO_MS = 2 * 60_000

/** Hora do telemóvel: rejeita futuro (> +2 min) e fotografias demasiado antigas. */
export function validarTiradaEm(tiradaEm: Date, agora: Date, idadeMaxMin: number): string | null {
  const diff = agora.getTime() - tiradaEm.getTime()
  if (Number.isNaN(diff)) return 'Hora da fotografia inválida.'
  if (diff < -MARGEM_FUTURO_MS) return 'A hora da fotografia está no futuro.'
  if (diff > idadeMaxMin * 60_000) return `A fotografia foi tirada há mais de ${idadeMaxMin} minutos.`
  return null
}

export function caminhoEvidenciaValido(path: string, obraId: string): boolean {
  const base = obraId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${base}/autos/[0-9]+-[A-Za-z0-9]+\\.[A-Za-z0-9]+$`).test(path)
}
