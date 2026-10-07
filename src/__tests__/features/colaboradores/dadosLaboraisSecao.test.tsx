import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

const m = vi.hoisted(() => ({
  buscar: vi.fn(async (_id: string) => null as null | Record<string, unknown>),
  guardar: vi.fn(async (d: Record<string, unknown>) => d),
  toastError: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { error: m.toastError, success: vi.fn() } }))

vi.mock('@/features/colaboradores/services/dadosLaboraisService', () => ({
  buscarDadosLaborais: m.buscar,
  guardarDadosLaborais: m.guardar,
}))

import { DadosLaboraisSecao } from '@/features/colaboradores/components/DadosLaboraisSecao'

const NISS_OK = '12345678902'
const IBAN_OK = 'PT50 0002 0123 1234 5678 9015 4'

beforeEach(() => { vi.clearAllMocks() })
afterEach(cleanup)
Element.prototype.scrollIntoView = () => {}

async function abrir() {
  render(<DadosLaboraisSecao colaboradorId="c1" />)
  await waitFor(() => expect(m.buscar).toHaveBeenCalledWith('c1'))
  fireEvent.click(screen.getByText(/Dados laborais/))
}

describe('DadosLaboraisSecao', () => {
  it('NISS inválido mostra erro e não grava', async () => {
    await abrir()
    fireEvent.change(await screen.findByLabelText('NISS'), { target: { value: '12345678900' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar dados laborais' }))
    expect(await screen.findByText('NISS inválido')).toBeInTheDocument()
    expect(m.guardar).not.toHaveBeenCalled()
  })

  it('IBAN válido grava normalizado sem espaços', async () => {
    await abrir()
    fireEvent.change(await screen.findByLabelText('NISS'), { target: { value: NISS_OK } })
    fireEvent.change(screen.getByLabelText('IBAN'), { target: { value: IBAN_OK } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar dados laborais' }))
    await waitFor(() => expect(m.guardar).toHaveBeenCalled())
    expect(m.guardar.mock.calls[0][0]).toMatchObject({ colaborador_id: 'c1', niss: NISS_OK, iban: 'PT50000201231234567890154' })
  })

  it('falha ao ler mostra o erro, permite tentar de novo e bloqueia o guardar', async () => {
    m.buscar.mockRejectedValueOnce(new Error('Falha de leitura'))
    await abrir()
    expect(await screen.findByText('Falha de leitura')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar dados laborais' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    await waitFor(() => expect(m.buscar).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar dados laborais' })).toBeEnabled())
    expect(screen.queryByText('Falha de leitura')).toBeNull()
  })

  it('falha ao guardar mostra toast de erro', async () => {
    m.guardar.mockRejectedValueOnce(new Error('falhou'))
    await abrir()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar dados laborais' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Guardar dados laborais' }))
    await waitFor(() => expect(m.toastError).toHaveBeenCalledWith('falhou'))
  })

  it('fim de contrato anterior à admissão não grava', async () => {
    await abrir()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar dados laborais' })).toBeEnabled())
    fireEvent.change(screen.getByLabelText('Data de admissão'), { target: { value: '2026-05-01' } })
    fireEvent.click(screen.getByRole('combobox', { name: 'Tipo de contrato' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Termo certo' }))
    fireEvent.change(await screen.findByLabelText('Data de fim do contrato'), { target: { value: '2026-04-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar dados laborais' }))
    expect(await screen.findByText('A data de fim não pode ser anterior à admissão')).toBeInTheDocument()
    expect(m.guardar).not.toHaveBeenCalled()
  })
})
