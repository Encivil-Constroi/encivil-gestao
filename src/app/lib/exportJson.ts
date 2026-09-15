export function exportarJson(data: unknown, nomeArquivo: string): void {
  const json  = JSON.stringify(data, null, 2)
  const blob  = new Blob([json], { type: 'application/json;charset=utf-8;' })
  const url   = URL.createObjectURL(blob)
  const a     = document.createElement('a')
  a.href      = url
  a.download  = `${nomeArquivo}_${new Date().toISOString().split('T')[0]}.json`
  a.click()
  URL.revokeObjectURL(url)
}
