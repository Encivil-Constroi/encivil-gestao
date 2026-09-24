// Importação dinâmica — xlsx só carrega quando o utilizador clica em exportar,
// sem impacto no bundle inicial.
import type * as XLSXType from 'xlsx'

// Colunas cujo nome sugere valor monetário → formato "€ 1.234,56"
function ehColunaMonetaria(chave: string): boolean {
  const k = chave.toLowerCase()
  return (
    k.includes('€') ||
    k.includes('custo') ||
    k.includes('valor') ||
    k.includes('total') ||
    k.includes('preco') ||
    k.includes('preço') ||
    k.includes('liquido') ||
    k.includes('líquido') ||
    k.includes('subtotal')
  )
}

export async function exportarXlsx(
  rows: Record<string, unknown>[],
  nomeArquivo: string,
  nomePagina = 'Dados',
) {
  if (rows.length === 0) return

  const XLSX: typeof XLSXType = await import('xlsx')
  const headers = Object.keys(rows[0])

  // Gerar worksheet a partir do array de objetos
  const ws = XLSX.utils.json_to_sheet(rows)

  // Largura automática de cada coluna (máximo entre cabeçalho e conteúdo, cap 55)
  ws['!cols'] = headers.map(h => ({
    wch: Math.min(
      Math.max(h.length, ...rows.map(r => String(r[h] ?? '').length)) + 2,
      55,
    ),
  }))

  // Congelar primeira linha (cabeçalhos ficam visíveis ao fazer scroll)
  ws['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 1, topLeftCell: 'A2' }]

  // Aplicar formato monetário às células numéricas em colunas €
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
  headers.forEach((h, colIdx) => {
    if (!ehColunaMonetaria(h)) return
    for (let row = range.s.r + 1; row <= range.e.r; row++) {
      const addr = XLSX.utils.encode_cell({ r: row, c: colIdx })
      const cell = ws[addr]
      if (cell?.t === 'n') cell.z = '"€" #,##0.00'
    }
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, nomePagina)

  const hoje = new Date().toISOString().split('T')[0]
  XLSX.writeFile(wb, `${nomeArquivo}_${hoje}.xlsx`)
}
