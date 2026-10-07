// Importação dinâmica — xlsx só carrega quando o utilizador clica em exportar,
// sem impacto no bundle inicial.
import type * as XLSXType from 'xlsx'
import { neutralizarFormula } from './neutralizarFormula'

// Colunas cujo nome sugere valor monetário → formato "€ 1.234,56"
function ehColunaMonetaria(chave: string): boolean {
  const k = chave.toLowerCase()
  if (k.includes('horas')) return false
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


type Linhas = Record<string, unknown>[]

// Constrói o worksheet com larguras, cabeçalho congelado e formato monetário.
function construirFolha(XLSX: typeof XLSXType, rows: Linhas): XLSXType.WorkSheet {
  const headers = Object.keys(rows[0])
  // Neutraliza fórmulas (=, +, -, @) antes de escrever as células
  const seguras = rows.map(r =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, neutralizarFormula(v)])))
  const ws = XLSX.utils.json_to_sheet(seguras)

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
  return ws
}

function nomeFicheiro(nomeArquivo: string): string {
  const hoje = new Date().toISOString().split('T')[0]
  return `${nomeArquivo}_${hoje}.xlsx`
}

export async function exportarXlsx(
  rows: Linhas,
  nomeArquivo: string,
  nomePagina = 'Dados',
) {
  if (rows.length === 0) return

  const XLSX: typeof XLSXType = await import('xlsx')
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, construirFolha(XLSX, rows), nomePagina)
  XLSX.writeFile(wb, nomeFicheiro(nomeArquivo))
}

export async function exportarXlsxMultiFolha(
  folhas: { nome: string; linhas: Linhas }[],
  nomeArquivo: string,
) {
  if (folhas.length === 0) return

  const XLSX: typeof XLSXType = await import('xlsx')
  const wb = XLSX.utils.book_new()
  for (const f of folhas) {
    const linhas = f.linhas.length > 0 ? f.linhas : [{ Aviso: 'Sem dados no período' }]
    XLSX.utils.book_append_sheet(wb, construirFolha(XLSX, linhas), f.nome.slice(0, 31))
  }
  XLSX.writeFile(wb, nomeFicheiro(nomeArquivo))
}
