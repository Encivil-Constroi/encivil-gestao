import type { VistaDano } from '../db'

// Todas as vistas partilham o viewBox 200x120: as coordenadas normalizadas (0–1) dos danos
// ficam assim comparáveis entre ecrãs e tamanhos.
export const VIEWBOX_VISTA = '0 0 200 120'

const TRACO = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

function Frente() {
  return (
    <g {...TRACO}>
      <path d="M45 88V62q0-8 8-12l10-22q3-6 10-6h54q7 0 10 6l10 22q8 4 8 12v26z" />
      <path d="M68 32h64l7 18H61z" />
      <rect x="40" y="88" width="120" height="10" rx="3" />
      <rect x="52" y="64" width="22" height="10" rx="3" />
      <rect x="126" y="64" width="22" height="10" rx="3" />
      <rect x="84" y="70" width="32" height="12" rx="2" />
      <rect x="44" y="98" width="20" height="14" rx="3" />
      <rect x="136" y="98" width="20" height="14" rx="3" />
    </g>
  )
}

function Tras() {
  return (
    <g {...TRACO}>
      <path d="M45 88V60q0-8 8-12l8-16q3-6 10-6h58q7 0 10 6l8 16q8 4 8 12v28z" />
      <path d="M70 34h60l6 14H64z" />
      <rect x="40" y="88" width="120" height="10" rx="3" />
      <rect x="50" y="62" width="26" height="9" rx="3" />
      <rect x="124" y="62" width="26" height="9" rx="3" />
      <rect x="88" y="74" width="24" height="8" rx="2" />
      <rect x="44" y="98" width="20" height="14" rx="3" />
      <rect x="136" y="98" width="20" height="14" rx="3" />
    </g>
  )
}

function Lado({ esquerdo }: { esquerdo: boolean }) {
  return (
    <g {...TRACO} transform={esquerdo ? undefined : 'translate(200 0) scale(-1 1)'}>
      <path d="M12 86V70q0-6 6-8l22-6 20-22q3-4 8-4h48q6 0 10 4l22 22 22 6q6 2 6 8v16z" />
      <path d="M62 56l15-18h26v18zM110 56V38h14l16 18z" />
      <path d="M12 76h176" />
      <circle cx="52" cy="88" r="14" />
      <circle cx="52" cy="88" r="6" />
      <circle cx="150" cy="88" r="14" />
      <circle cx="150" cy="88" r="6" />
    </g>
  )
}

function Cima() {
  return (
    <g {...TRACO}>
      <rect x="62" y="6" width="76" height="108" rx="30" />
      <path d="M70 34q30-8 60 0l-4 14h-52z" />
      <rect x="72" y="50" width="56" height="30" rx="4" />
      <path d="M74 84h52l4 16q-30 6-60 0z" />
      <rect x="54" y="24" width="8" height="20" rx="2" />
      <rect x="138" y="24" width="8" height="20" rx="2" />
      <rect x="54" y="78" width="8" height="20" rx="2" />
      <rect x="138" y="78" width="8" height="20" rx="2" />
    </g>
  )
}

export function DesenhoVista({ vista }: { vista: VistaDano }) {
  return (
    <svg viewBox={VIEWBOX_VISTA} className="absolute inset-0 w-full h-full text-muted-foreground/70 pointer-events-none" aria-hidden="true">
      {vista === 'frente' && <Frente />}
      {vista === 'tras' && <Tras />}
      {vista === 'lado_esq' && <Lado esquerdo />}
      {vista === 'lado_dir' && <Lado esquerdo={false} />}
      {vista === 'cima' && <Cima />}
    </svg>
  )
}
