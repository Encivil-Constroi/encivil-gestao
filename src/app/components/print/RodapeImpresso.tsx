import { PRINT, dataHoraLisboa } from './printTheme'

export function RodapeImpresso({ nota }: { nota?: string }) {
  return (
    <div style={{ borderTop: `1px solid ${PRINT.LINHA}`, marginTop: 16, paddingTop: 8, fontSize: 9, color: PRINT.SUAVE, fontFamily: PRINT.FONTE }}>
      {`ENCIVIL Gestão · gerado em ${dataHoraLisboa()} · ${nota ?? 'Documento interno'}`}
    </div>
  )
}
