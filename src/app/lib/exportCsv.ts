import { neutralizarFormula } from './neutralizarFormula'

// UTF-8 BOM necessário para o Excel abrir caracteres portugueses (ã, ç, €) corretamente
const BOM = '﻿'

function escapeCsv(val: unknown): string {
  const str = val == null ? '' : String(neutralizarFormula(val))
  // Citar se contiver vírgula, aspas ou newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function exportarCsv(rows: Record<string, unknown>[], nomeArquivo: string) {
  if (rows.length === 0) return
  const headers = Object.keys(rows[0])
  const lines = [
    headers.map(escapeCsv).join(','),
    ...rows.map(row => headers.map(h => escapeCsv(row[h])).join(',')),
  ]
  const blob = new Blob([BOM + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${nomeArquivo}_${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
