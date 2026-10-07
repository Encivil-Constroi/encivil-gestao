import type { ReactNode } from 'react'
import { PRINT, dataHoraLisboa } from './printTheme'

export function CabecalhoImpresso({ titulo, subtitulo, direita }: { titulo: string; subtitulo?: string; direita?: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, paddingBottom: 12, borderBottom: `3px solid ${PRINT.MARCA}`, fontFamily: PRINT.FONTE, color: PRINT.TINTA }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <img src="/icone_oficial.png" alt="ENCIVIL" style={{ width: 40, height: 40, objectFit: 'contain' }} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: PRINT.MARCA, letterSpacing: '0.12em' }}>ENCIVIL</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: PRINT.TINTA }}>{titulo}</div>
          {subtitulo && <div style={{ fontSize: 12, color: PRINT.SUAVE }}>{subtitulo}</div>}
        </div>
      </div>
      <div style={{ textAlign: 'right', fontSize: 11, color: PRINT.SUAVE }}>
        {direita ?? `Emitido em ${dataHoraLisboa()}`}
      </div>
    </div>
  )
}
