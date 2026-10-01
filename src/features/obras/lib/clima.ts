import type { ClimaObra } from '../db'

// `icone` é o nome do ícone lucide (ver components/ClimaIcone.tsx)
export const CLIMAS: { valor: ClimaObra; rotulo: string; icone: string; adverso: boolean }[] = [
  { valor: 'SOL',           rotulo: 'Sol',             icone: 'Sun',            adverso: false },
  { valor: 'NUBLADO',       rotulo: 'Nublado',         icone: 'Cloud',          adverso: false },
  { valor: 'CHUVA_FRACA',   rotulo: 'Chuva fraca',     icone: 'CloudDrizzle',   adverso: false },
  { valor: 'CHUVA_FORTE',   rotulo: 'Chuva forte',     icone: 'CloudRain',      adverso: true },
  { valor: 'VENTO',         rotulo: 'Vento',           icone: 'Wind',           adverso: false },
  { valor: 'NEVOEIRO',      rotulo: 'Nevoeiro',        icone: 'CloudFog',       adverso: false },
  { valor: 'CALOR_EXTREMO', rotulo: 'Calor extremo',   icone: 'Thermometer',    adverso: true },
  { valor: 'FRIO',          rotulo: 'Frio',            icone: 'Snowflake',      adverso: false },
  { valor: 'TEMPESTADE',    rotulo: 'Tempestade',      icone: 'CloudLightning', adverso: true },
]

export function rotuloClima(c: ClimaObra | string | null | undefined): string {
  return CLIMAS.find(x => x.valor === c)?.rotulo ?? '—'
}

export function climaAdverso(c: ClimaObra | string | null | undefined): boolean {
  return CLIMAS.find(x => x.valor === c)?.adverso ?? false
}
