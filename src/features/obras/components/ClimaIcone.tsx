import { Sun, Cloud, CloudDrizzle, CloudRain, Wind, CloudFog, Thermometer, Snowflake, CloudLightning, type LucideIcon } from 'lucide-react'
import { CLIMAS } from '../lib/clima'

const ICONES: Record<string, LucideIcon> = { Sun, Cloud, CloudDrizzle, CloudRain, Wind, CloudFog, Thermometer, Snowflake, CloudLightning }

export function ClimaIcone({ clima, className = 'w-4 h-4' }: { clima: string | null | undefined; className?: string }) {
  const nome = CLIMAS.find(c => c.valor === clima)?.icone
  const Icone = nome ? ICONES[nome] : Cloud
  return <Icone className={className} aria-hidden="true" />
}
