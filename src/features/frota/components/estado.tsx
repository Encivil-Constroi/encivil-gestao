import { Truck, Tractor, Zap } from 'lucide-react'
import type { EstadoOperacional } from '../db'
import { ESTADO_TEXTO, nivelPrazo, type NivelPrazo } from '../lib/viaturas'

const ESTADO_CLS: Record<EstadoOperacional, string> = {
  LIVRE:   'bg-success/10 text-success',
  EM_USO:  'bg-warning/15 text-warning',
  OFICINA: 'bg-destructive/10 text-destructive',
}

export function BadgeEstadoViatura({ estado }: { estado: EstadoOperacional }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${ESTADO_CLS[estado]}`}>
      {ESTADO_TEXTO[estado]}
    </span>
  )
}

export function IconeTipoViatura({ tipo, className = 'w-5 h-5' }: { tipo: string; className?: string }) {
  const Icone = tipo === 'gerador' ? Zap : tipo === 'maquina' || tipo === 'outro' ? Tractor : Truck
  return <Icone className={className} aria-hidden="true" />
}

const PRAZO_COR: Record<NivelPrazo, string> = {
  EXPIRADO: 'bg-destructive',
  A_VENCER: 'bg-warning',
  OK:       'bg-success',
  SEM_DATA: 'bg-muted-foreground/40',
}
const PRAZO_TXT: Record<NivelPrazo, string> = {
  EXPIRADO: 'expirado',
  A_VENCER: 'a vencer',
  OK:       'em dia',
  SEM_DATA: 'sem data',
}

// Ponto de cor + rótulo; o estado também vai em texto para não depender só da cor
export function PastilhaPrazo({ rotulo, nivel }: { rotulo: string; nivel: NivelPrazo }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title={`${rotulo}: ${PRAZO_TXT[nivel]}`}>
      <span className={`w-2.5 h-2.5 rounded-full ${PRAZO_COR[nivel]}`} aria-hidden="true" />
      {rotulo}
      <span className="sr-only">: {PRAZO_TXT[nivel]}</span>
    </span>
  )
}

export function PastilhaDocumento({ rotulo, data }: { rotulo: string; data: string | null }) {
  return <PastilhaPrazo rotulo={rotulo} nivel={nivelPrazo(data)} />
}

export function BadgeDocumento({ nivel }: { nivel: NivelPrazo }) {
  const cls = nivel === 'EXPIRADO' ? 'bg-destructive/10 text-destructive'
    : nivel === 'A_VENCER' ? 'bg-warning/15 text-warning'
    : nivel === 'OK' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
  const txt = nivel === 'EXPIRADO' ? 'Expirado' : nivel === 'A_VENCER' ? 'A vencer' : nivel === 'OK' ? 'Em dia' : 'Sem data'
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{txt}</span>
}
