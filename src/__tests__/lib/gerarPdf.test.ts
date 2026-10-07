import { describe, it, expect, vi, afterEach } from 'vitest'
import html2canvas from 'html2canvas-pro'

const addPage = vi.fn()
const addImage = vi.fn()

vi.mock('html2canvas-pro', () => ({
  default: vi.fn(async () => ({ width: 800, height: 2400, toDataURL: () => 'data:image/jpeg;base64,AA' })),
}))
vi.mock('jspdf', () => ({
  jsPDF: class {
    addImage = addImage
    addPage = addPage
    output() { return new Blob(['x']) }
  },
}))

import { gerarPdfDeElemento, partilharOuDescarregarPdf } from '@/app/lib/pdf/gerarPdf'

describe('gerarPdfDeElemento', () => {
  it('gera File PDF paginado', async () => {
    const f = await gerarPdfDeElemento(document.createElement('div'), 'relatorio')
    expect(f).toBeInstanceOf(File)
    expect(f.name).toBe('relatorio.pdf')
    expect(f.type).toBe('application/pdf')
    expect(addPage.mock.calls.length).toBeGreaterThanOrEqual(1)
    expect(addImage).toHaveBeenCalled()
  })

  it('escala adaptativa limita a área do canvas e força tema claro', async () => {
    const el = document.createElement('div')
    Object.defineProperty(el, 'scrollWidth', { value: 2000 })
    Object.defineProperty(el, 'scrollHeight', { value: 20000 })
    await gerarPdfDeElemento(el, 'x')
    const opts = vi.mocked(html2canvas).mock.calls.at(-1)![1] as unknown as { scale: number; onclone: (d: Document) => void }
    expect(opts.scale).toBeCloseTo(Math.sqrt(16e6 / 4e7), 5)
    const doc = document.implementation.createHTMLDocument('x')
    doc.documentElement.classList.add('dark')
    opts.onclone(doc)
    expect(doc.documentElement.classList.contains('dark')).toBe(false)
    expect(doc.documentElement.style.colorScheme).toBe('light')
  })

  it('onclone mostra cabeçalho/rodapé de impressão marcados com data-so-pdf', async () => {
    await gerarPdfDeElemento(document.createElement('div'), 'x')
    const opts = vi.mocked(html2canvas).mock.calls.at(-1)![1] as unknown as { onclone: (d: Document) => void }
    const doc = document.implementation.createHTMLDocument('x')
    doc.body.innerHTML = '<div data-so-pdf style="display:none"></div><div id="outro" style="display:none"></div>'
    opts.onclone(doc)
    expect((doc.querySelector('[data-so-pdf]') as HTMLElement).style.display).toBe('block')
    expect((doc.getElementById('outro') as HTMLElement).style.display).toBe('none')
  })

  it('escala não passa de 2 em elementos pequenos', async () => {
    const el = document.createElement('div')
    Object.defineProperty(el, 'scrollWidth', { value: 800 })
    Object.defineProperty(el, 'scrollHeight', { value: 1000 })
    await gerarPdfDeElemento(el, 'x')
    expect((vi.mocked(html2canvas).mock.calls.at(-1)![1] as unknown as { scale: number }).scale).toBe(2)
  })
})

describe('partilharOuDescarregarPdf', () => {
  const f = new File(['x'], 'a.pdf', { type: 'application/pdf' })
  afterEach(() => { vi.restoreAllMocks() })
  const comShare = (share: () => Promise<void>) => {
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
  }

  it('AbortError devolve cancelado sem descarregar', async () => {
    comShare(async () => { throw new DOMException('x', 'AbortError') })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    expect(await partilharOuDescarregarPdf(f, 't')).toBe('cancelado')
    expect(click).not.toHaveBeenCalled()
  })

  it('NotAllowedError recorre ao descarregamento', async () => {
    comShare(async () => { throw new DOMException('x', 'NotAllowedError') })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    expect(await partilharOuDescarregarPdf(f, 't')).toBe('descarregado')
    expect(click).toHaveBeenCalled()
  })

  it('partilha com sucesso', async () => {
    comShare(async () => {})
    expect(await partilharOuDescarregarPdf(f, 't')).toBe('partilhado')
  })
})
