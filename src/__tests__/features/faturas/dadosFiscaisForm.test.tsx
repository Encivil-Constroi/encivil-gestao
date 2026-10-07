import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import type { FaturaFornecedor } from '@/app/types'

const m = vi.hoisted(() => ({ atualizar: vi.fn(async (_id: string, _d: Record<string, unknown>) => ({ id: 'f1' })), toastError: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: m.toastError, success: vi.fn() } }))
vi.mock('@/features/faturas/services/faturasService', () => ({ atualizarDadosFiscaisFatura: m.atualizar }))

import { DadosFiscaisForm } from '@/features/faturas/components/DadosFiscaisForm'

const fatura = { id: 'f1', fornecedor: 'Cimpor', estado: 'EXTRAIDA', dataRecepcao: new Date(), createdAt: new Date(), updatedAt: new Date() } as FaturaFornecedor

beforeEach(() => { vi.clearAllMocks() })
afterEach(cleanup)

describe('DadosFiscaisForm', () => {
  it('NIF inválido não grava', async () => {
    render(<DadosFiscaisForm fatura={fatura} onSaved={() => {}} />)
    fireEvent.change(screen.getByLabelText('NIF do fornecedor'), { target: { value: '123456788' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('NIF inválido')).toBeInTheDocument()
    expect(m.atualizar).not.toHaveBeenCalled()
  })

  it('grava NIF válido e valores com vírgula', async () => {
    const onSaved = vi.fn()
    render(<DadosFiscaisForm fatura={fatura} onSaved={onSaved} />)
    fireEvent.change(screen.getByLabelText('NIF do fornecedor'), { target: { value: '500 000 000' } })
    fireEvent.change(screen.getByLabelText('Base tributável (€)'), { target: { value: '100,50' } })
    fireEvent.change(screen.getByLabelText('IVA (€)'), { target: { value: '23,12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(m.atualizar).toHaveBeenCalledWith('f1', { nifFornecedor: '500000000', baseTributavel: 100.5, valorIva: 23.12 }))
    expect(onSaved).toHaveBeenCalled()
  })

  it('falha ao guardar mostra toast e não chama onSaved', async () => {
    m.atualizar.mockRejectedValueOnce(new Error('falhou'))
    const onSaved = vi.fn()
    render(<DadosFiscaisForm fatura={fatura} onSaved={onSaved} />)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(m.toastError).toHaveBeenCalledWith('falhou'))
    expect(onSaved).not.toHaveBeenCalled()
  })
})
