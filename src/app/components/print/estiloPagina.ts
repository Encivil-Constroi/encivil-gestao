import { PRINT } from './printTheme'

export function estiloPaginaImpressa(rootId: string): string {
  return `
@page { size: A4; margin: 14mm 12mm 16mm; @bottom-right { content: "Pág. " counter(page) " / " counter(pages); font: 9px ${PRINT.FONTE}; color: ${PRINT.SUAVE}; } }
@media print {
  #${rootId} { font-family: ${PRINT.FONTE}; color: ${PRINT.TINTA}; background: #fff; }
  #${rootId} * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  #${rootId} .no-print { display: none !important; }
}`
}
