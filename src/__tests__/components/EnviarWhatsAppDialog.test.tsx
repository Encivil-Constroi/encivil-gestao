import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const memoria = new Map<string, string>()
vi.stubGlobal('localStorage', { getItem: (k: string) => memoria.get(k) ?? null, setItem: (k: string, v: string) => { memoria.set(k, v) }, removeItem: (k: string) => { memoria.delete(k) }, clear: () => memoria.clear() })

const gerarPdfDeElemento = vi.fn()
const partilharOuDescarregarPdf = vi.fn()
vi.mock('@/app/lib/pdf/gerarPdf', () => ({
  gerarPdfDeElemento: (...a: unknown[]) => gerarPdfDeElemento(...a),
  partilharOuDescarregarPdf: (...a: unknown[]) => partilharOuDescarregarPdf(...a),
}))
const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) } }))

import { EnviarWhatsAppDialog } from '@/app/components/EnviarWhatsAppDialog'
import { numerosRecentes, guardarNumeroRecente } from '@/app/lib/whatsapp'

describe('EnviarWhatsAppDialog', () => {
  afterEach(cleanup)
  beforeEach(() => {
    memoria.clear()
    vi.clearAllMocks()
    vi.spyOn(window, 'open').mockImplementation(() => null)
  })

  it('número vazio desativa; válido abre wa.me e guarda recente', () => {
    render(<EnviarWhatsAppDialog open onOpenChange={() => {}} texto="Olá" />)
    const abrir = screen.getByRole('button', { name: /abrir conversa/i })
    expect(abrir).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/número/i), { target: { value: '912 345 678' } })
    expect(screen.getByText('+351 912 345 678')).toBeInTheDocument()
    fireEvent.click(abrir)
    expect(window.open).toHaveBeenCalledWith('https://wa.me/351912345678?text=Ol%C3%A1', '_blank')
    expect(numerosRecentes()[0]).toBe('351912345678')
  })

  it('número inválido mostra erro e desativa', () => {
    render(<EnviarWhatsAppDialog open onOpenChange={() => {}} texto="x" obterElementoPdf={() => document.body} />)
    fireEvent.change(screen.getByLabelText(/número/i), { target: { value: '123' } })
    expect(screen.getByText(/número inválido/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /abrir conversa/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /enviar pdf/i })).toBeDisabled()
  })

  it('recentes preenchem o campo', () => {
    guardarNumeroRecente('351912345678')
    render(<EnviarWhatsAppDialog open onOpenChange={() => {}} texto="x" />)
    fireEvent.click(screen.getByRole('button', { name: '+351 912 345 678' }))
    expect(screen.getByLabelText(/número/i)).toHaveValue('+351 912 345 678')
    expect(screen.getByRole('button', { name: /abrir conversa/i })).toBeEnabled()
  })

  it('numeroInicial preenche o campo', () => {
    render(<EnviarWhatsAppDialog open onOpenChange={() => {}} texto="x" numeroInicial="912345678" />)
    expect(screen.getByLabelText(/número/i)).toHaveValue('912345678')
    expect(screen.getByText('+351 912 345 678')).toBeInTheDocument()
  })

  it('sem obterElementoPdf não há botão PDF', () => {
    render(<EnviarWhatsAppDialog open onOpenChange={() => {}} texto="x" />)
    expect(screen.queryByRole('button', { name: /enviar pdf/i })).toBeNull()
  })

  it('PDF descarregado não abre pop-up: mostra a ligação "Abrir conversa no WhatsApp" e avisa', async () => {
    const f = new File(['x'], 'a.pdf')
    gerarPdfDeElemento.mockResolvedValue(f)
    partilharOuDescarregarPdf.mockResolvedValue('descarregado')
    const onOpenChange = vi.fn()
    render(<EnviarWhatsAppDialog open onOpenChange={onOpenChange} texto="Olá" nomePdf="rel" obterElementoPdf={() => document.body} />)
    fireEvent.change(screen.getByLabelText(/número/i), { target: { value: '912345678' } })
    fireEvent.click(screen.getByRole('button', { name: /enviar pdf/i }))
    await waitFor(() => expect(partilharOuDescarregarPdf).toHaveBeenCalledWith(f, 'Olá'))
    expect(gerarPdfDeElemento).toHaveBeenCalledWith(document.body, 'rel')
    const ligacao = await screen.findByRole('link', { name: /abrir conversa no whatsapp/i })
    expect(ligacao).toHaveAttribute('href', 'https://wa.me/351912345678?text=Ol%C3%A1')
    expect(ligacao).toHaveAttribute('target', '_blank')
    expect(window.open).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(toastSuccess).toHaveBeenCalledWith('PDF descarregado — anexe-o na conversa')
  })

  it('partilha cancelada não faz nada (sem toast, sem fechar)', async () => {
    gerarPdfDeElemento.mockResolvedValue(new File(['x'], 'a.pdf'))
    partilharOuDescarregarPdf.mockResolvedValue('cancelado')
    const onOpenChange = vi.fn()
    render(<EnviarWhatsAppDialog open onOpenChange={onOpenChange} texto="x" obterElementoPdf={() => document.body} />)
    fireEvent.change(screen.getByLabelText(/número/i), { target: { value: '912345678' } })
    fireEvent.click(screen.getByRole('button', { name: /enviar pdf/i }))
    await waitFor(() => expect(partilharOuDescarregarPdf).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('button', { name: /enviar pdf/i })).toBeEnabled())
    expect(toastError).not.toHaveBeenCalled()
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(window.open).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('erro ao gerar PDF mostra toast', async () => {
    gerarPdfDeElemento.mockRejectedValue(new Error('x'))
    render(<EnviarWhatsAppDialog open onOpenChange={() => {}} texto="x" obterElementoPdf={() => document.body} />)
    fireEvent.change(screen.getByLabelText(/número/i), { target: { value: '912345678' } })
    fireEvent.click(screen.getByRole('button', { name: /enviar pdf/i }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Não foi possível gerar o PDF'))
  })
})
