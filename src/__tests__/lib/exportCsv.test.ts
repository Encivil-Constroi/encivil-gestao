import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { exportarCsv } from '@/app/lib/exportCsv'

// ── Setup: jsdom não implementa URL.createObjectURL / revokeObjectURL ─────────
// Definir ANTES dos testes; vi.spyOn falha se a propriedade não existir.

const createObjectURL = vi.fn()
const revokeObjectURL = vi.fn()

beforeAll(() => {
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true, writable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true, writable: true })
})

let capturedBlob: Blob | null = null
let anchorEl: { href: string; download: string; click: ReturnType<typeof vi.fn> }

beforeEach(() => {
  capturedBlob = null
  anchorEl = { href: '', download: '', click: vi.fn() }

  createObjectURL.mockImplementation((b: Blob) => {
    capturedBlob = b
    return 'blob:mock-url'
  })
  revokeObjectURL.mockReset()

  vi.spyOn(document, 'createElement').mockImplementation(tag =>
    tag === 'a' ? (anchorEl as unknown as HTMLAnchorElement) : document.createElement(tag)
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

async function csvText(): Promise<string> {
  if (!capturedBlob) throw new Error('nenhum Blob criado')
  return capturedBlob.text()
}

// ── Testes ────────────────────────────────────────────────────────────────────

describe('exportarCsv', () => {
  it('não faz nada quando o array está vazio', () => {
    exportarCsv([], 'vazio')
    expect(capturedBlob).toBeNull()
    expect(anchorEl.click).not.toHaveBeenCalled()
  })

  it('inicia o download com o nome correcto incluindo a data de hoje', () => {
    exportarCsv([{ a: 1 }], 'relatorio')
    const hoje = new Date().toISOString().split('T')[0]
    expect(anchorEl.download).toBe(`relatorio_${hoje}.csv`)
    expect(anchorEl.click).toHaveBeenCalledTimes(1)
  })

  it('liberta a blob URL após o download', () => {
    exportarCsv([{ a: 1 }], 'x')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('cria blob com content-type CSV + UTF-8', async () => {
    exportarCsv([{ a: 1 }], 'x')
    expect(capturedBlob!.type).toContain('text/csv')
    expect(capturedBlob!.type).toContain('utf-8')
  })

  it('inclui BOM UTF-8 no início (necessário para Excel abrir caracteres PT)', async () => {
    exportarCsv([{ Produto: 'Cimento' }], 'x')
    // Blob.text() segue a spec WHATWG e remove o BOM ao decodificar — verificar bytes raw
    const buf = await capturedBlob!.arrayBuffer()
    const bytes = new Uint8Array(buf)
    // UTF-8 BOM: EF BB BF
    expect(bytes[0]).toBe(0xEF)
    expect(bytes[1]).toBe(0xBB)
    expect(bytes[2]).toBe(0xBF)
  })

  it('usa as chaves do primeiro objecto como cabeçalhos', async () => {
    exportarCsv([{ Nome: 'Ana', Valor: 42 }], 'x')
    const text = await csvText()
    const [header, dataLine] = text.replace('﻿', '').split('\r\n')
    expect(header).toBe('Nome,Valor')
    expect(dataLine).toBe('Ana,42')
  })

  it('exporta múltiplas linhas em ordem', async () => {
    exportarCsv([{ n: 'A', v: 1 }, { n: 'B', v: 2 }, { n: 'C', v: 3 }], 'x')
    const text = await csvText()
    const lines = text.replace('﻿', '').split('\r\n')
    expect(lines).toHaveLength(4)  // header + 3 dados
    expect(lines[1]).toBe('A,1')
    expect(lines[3]).toBe('C,3')
  })

  it('cita campos com vírgulas (RFC 4180)', async () => {
    exportarCsv([{ desc: 'Areia, brita e gravilha' }], 'x')
    const text = await csvText()
    expect(text).toContain('"Areia, brita e gravilha"')
  })

  it('escapa aspas internas duplicando-as (RFC 4180)', async () => {
    exportarCsv([{ frase: 'ele disse "olá"' }], 'x')
    const text = await csvText()
    expect(text).toContain('"ele disse ""olá"""')
  })

  it('cita campos com newlines', async () => {
    exportarCsv([{ nota: 'linha1\nlinha2' }], 'x')
    const text = await csvText()
    expect(text).toContain('"linha1\nlinha2"')
  })

  it('representa null e undefined como string vazia', async () => {
    exportarCsv([{ a: null as unknown as string, b: undefined as unknown as string }], 'x')
    const text = await csvText()
    const dataLine = text.replace('﻿', '').split('\r\n')[1]
    expect(dataLine).toBe(',')
  })

  it('lida com caracteres portugueses sem corrupção (ã, ç, €)', async () => {
    exportarCsv([{ cidade: 'Castelo Branco', custo: '1.234,56 €' }], 'x')
    const text = await csvText()
    expect(text).toContain('Castelo Branco')
    expect(text).toContain('1.234,56 €')
  })
})
