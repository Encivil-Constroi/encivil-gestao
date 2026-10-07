export async function gerarPdfDeElemento(el: HTMLElement, nomeFicheiro: string): Promise<File> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')])
  // Limita a área do canvas: em telemóveis, canvas enormes falham silenciosamente.
  const area = Math.max(1, el.scrollWidth * el.scrollHeight)
  const scale = Math.min(2, Math.sqrt(16_000_000 / area))
  const canvas = await html2canvas(el, {
    scale,
    backgroundColor: '#ffffff',
    useCORS: true,
    onclone: (doc: Document) => {
      doc.documentElement.classList.remove('dark')
      doc.documentElement.style.colorScheme = 'light'
      // Cabeçalho/rodapé de impressão (ocultos no ecrã) entram no PDF
      doc.querySelectorAll<HTMLElement>('[data-so-pdf]').forEach(n => { n.style.display = 'block' })
    },
  })
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const larg = 210
  const alt = 297
  const altImg = (canvas.height * larg) / canvas.width
  const img = canvas.toDataURL('image/jpeg', 0.92)
  let y = 0
  pdf.addImage(img, 'JPEG', 0, y, larg, altImg)
  while (altImg + y > alt) {
    y -= alt
    pdf.addPage()
    pdf.addImage(img, 'JPEG', 0, y, larg, altImg)
  }
  const nome = nomeFicheiro.endsWith('.pdf') ? nomeFicheiro : `${nomeFicheiro}.pdf`
  return new File([pdf.output('blob')], nome, { type: 'application/pdf' })
}

export async function partilharOuDescarregarPdf(
  ficheiro: File,
  texto: string,
): Promise<'partilhado' | 'descarregado' | 'cancelado'> {
  if (navigator.canShare?.({ files: [ficheiro] })) {
    try {
      await navigator.share({ files: [ficheiro], text: texto })
      return 'partilhado'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelado'
      // Ex.: NotAllowedError por perda de ativação do utilizador — recorre ao descarregamento
    }
  }
  const url = URL.createObjectURL(ficheiro)
  const a = document.createElement('a')
  a.href = url
  a.download = ficheiro.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'descarregado'
}
