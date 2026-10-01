import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import { dia } from './ferramentasHelpers'

const m = vi.hoisted(() => ({
  pode: true, repetida: null as unknown, criar: vi.fn(), atualizar: vi.fn(), fotoDono: null as unknown,
}))
vi.mock('@/features/auth/useRole', () => ({ useRole: () => ({ podeFerramentas: m.pode, loading: false }) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/app/components/FotoInput', () => ({
  FotoInput: (p: { dono: unknown; onChange: (c: string | null) => void }) => {
    m.fotoDono = p.dono
    return <button type="button" onClick={() => p.onChange('ferramentas/x/1.jpg')}>Tirar foto</button>
  },
}))
vi.mock('@/features/ferramentas/hooks/useFerramentas', () => ({
  useFerramenta: () => ({ tool: undefined, loading: false }),
  useCriarFerramenta: () => ({ criar: m.criar, loading: false }),
  useAtualizarFerramenta: () => ({ atualizar: m.atualizar, loading: false }),
  useNumeroSerieRepetido: () => ({ repetida: m.repetida, aVerificar: false }),
}))

import { FerramentaFormPage } from '@/app/pages/armazem/FerramentaFormPage'

const abrir = () => render(
  <MemoryRouter initialEntries={['/armazem/ferramenta/nova']}>
    <Routes>
      <Route path="/armazem/ferramenta/nova" element={<FerramentaFormPage />} />
      <Route path="*" element={<p>OUTRA</p>} />
    </Routes>
  </MemoryRouter>)

const escrever = (rotulo: RegExp | string, v: string) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: v } })

beforeEach(() => {
  m.pode = true; m.repetida = null
  m.criar.mockReset().mockResolvedValue({ id: 'novo' })
})
afterEach(cleanup)

describe('formulário de ferramenta', () => {
  it('avisa quando o n.º de série já existe noutra ferramenta e bloqueia o envio', async () => {
    m.repetida = { id: 'o', code: 'F-009', name: 'Berbequim velho' }
    abrir()
    escrever('Nome', 'Berbequim')
    escrever(/N.º de série/, 'SN-1')
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('F-009')
    fireEvent.click(screen.getByRole('button', { name: 'Criar ferramenta' }))
    expect(m.criar).not.toHaveBeenCalled()
  })

  it('"É nova?" mostra compra e garantia; atalhos somam anos à data de compra', () => {
    abrir()
    expect(screen.queryByLabelText('Data de compra')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox'))
    escrever('Data de compra', '2026-03-15')
    fireEvent.click(screen.getByRole('button', { name: '+2 anos' }))
    expect(screen.getByLabelText('Garantia do fabricante até')).toHaveValue('2028-03-15')
    fireEvent.click(screen.getByRole('button', { name: '+1 ano' }))
    expect(screen.getByLabelText('Garantia do fabricante até')).toHaveValue('2027-03-15')
  })

  it('alerta se a garantia termina em ≤30 dias ou já terminou', () => {
    abrir()
    fireEvent.click(screen.getByRole('checkbox'))
    escrever('Garantia do fabricante até', dia(12))
    expect(screen.getByTestId('alerta-garantia')).toHaveTextContent('termina em 12 dias')
    escrever('Garantia do fabricante até', dia(-2))
    expect(screen.getByTestId('alerta-garantia')).toHaveTextContent(/expirada/)
    escrever('Garantia do fabricante até', dia(300))
    expect(screen.queryByTestId('alerta-garantia')).toBeNull()
  })

  it('recusa garantia anterior à compra', () => {
    abrir()
    escrever('Nome', 'Serra')
    fireEvent.click(screen.getByRole('checkbox'))
    escrever('Data de compra', '2026-03-15')
    escrever('Garantia do fabricante até', '2026-01-01')
    expect(screen.getAllByRole('alert').some(a => /antes da data de compra/.test(a.textContent ?? ''))).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Criar ferramenta' }))
    expect(m.criar).not.toHaveBeenCalled()
  })

  it('cria com id gerado no browser (o mesmo da foto), foto e garantia', async () => {
    abrir()
    escrever('Nome', 'Berbequim')
    escrever(/^Marca/, 'Bosch')
    fireEvent.click(screen.getByRole('button', { name: 'Tirar foto' }))
    fireEvent.click(screen.getByRole('checkbox'))
    escrever('Data de compra', '2026-03-15')
    fireEvent.click(screen.getByRole('button', { name: '+3 anos' }))
    fireEvent.click(screen.getByRole('button', { name: 'Criar ferramenta' }))
    await waitFor(() => expect(m.criar).toHaveBeenCalledTimes(1))
    const arg = m.criar.mock.calls[0][0]
    expect(arg).toMatchObject({
      name: 'Berbequim', marca: 'Bosch', nova: true, fotoPath: 'ferramentas/x/1.jpg',
      dataCompra: '2026-03-15', garantiaAte: '2029-03-15',
    })
    expect(arg.id).toMatch(/^[0-9a-f-]{36}$/)
    expect((m.fotoDono as { id: string }).id).toBe(arg.id)
  })

  it('sem permissão: aviso e volta à lista', async () => {
    m.pode = false
    abrir()
    await waitFor(() => expect(screen.getByText('OUTRA')).toBeInTheDocument())
  })
})
