import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import type { LeituraIA, TipoLeitura } from '@/features/combustivel/services/fotosService'

const m = vi.hoisted(() => ({
  enviar: vi.fn<(v: string, p: string, f: File) => Promise<string>>(),
  ler: vi.fn<(c: string, l: TipoLeitura) => Promise<LeituraIA | null>>(),
}))
vi.mock('@/features/combustivel/services/fotosService', () => ({
  enviarFotoAbastecimento: m.enviar,
  lerFotoComIA: m.ler,
}))

import { LeituraPorFoto, type LeituraConfirmada } from '@/features/combustivel/components/pedidos/LeituraPorFoto'

const confirmar = vi.fn<(l: LeituraConfirmada) => Promise<void>>()

function montar(o: Partial<Parameters<typeof LeituraPorFoto>[0]> = {}) {
  render(
    <LeituraPorFoto veiculoId="v1" pedidoId="p1" leitura="CONTADOR" titulo="Foto do contador" instrucao="Fotografe"
      rotuloValor="Leitura" unidade="L" textoConfirmar="Confirmar" aGuardar={false} onConfirmar={confirmar} {...o} />,
  )
}

function tirarFoto(idadeMs = 0) {
  const foto = new File(['x'], 'foto.jpg', { type: 'image/jpeg', lastModified: Date.now() - idadeMs })
  fireEvent.change(screen.getByLabelText('Foto do contador'), { target: { files: [foto] } })
  return foto
}

beforeEach(() => {
  m.enviar.mockReset().mockResolvedValue('v1/2026-09-30_p1_1.jpg')
  m.ler.mockReset()
  confirmar.mockReset().mockResolvedValue()
  URL.createObjectURL = vi.fn(() => 'blob:previa')
  URL.revokeObjectURL = vi.fn()
})
afterEach(cleanup)

describe('LeituraPorFoto', () => {
  it('abre a câmara traseira (foto na hora), não a galeria', () => {
    montar()
    const input = screen.getByLabelText('Foto do contador')
    expect(input).toHaveAttribute('capture', 'environment')
    expect(input).toHaveAttribute('accept', 'image/*')
  })

  it('IA leu com confiança: valor preenchido, confirmado tal e qual → origem IA', async () => {
    m.ler.mockResolvedValue({ valor: 1042.5, custo: null, confianca: 'alta' })
    montar()
    tirarFoto()
    expect(await screen.findByText(/Lido pela IA/)).toBeInTheDocument()
    expect(m.enviar).toHaveBeenCalledWith('v1', 'p1', expect.any(File))
    expect(m.ler).toHaveBeenCalledWith('v1/2026-09-30_p1_1.jpg', 'CONTADOR')
    expect(screen.getByLabelText('Leitura')).toHaveValue('1042,5')
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(confirmar).toHaveBeenCalledWith({ fotoPath: 'v1/2026-09-30_p1_1.jpg', valor: 1042.5, custo: null, origem: 'IA' }))
  })

  it('motorista corrige o valor da IA → origem MANUAL', async () => {
    m.ler.mockResolvedValue({ valor: 1042.5, custo: null, confianca: 'media' })
    montar()
    tirarFoto()
    fireEvent.change(await screen.findByLabelText('Leitura'), { target: { value: '1043' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(confirmar).toHaveBeenCalledWith(expect.objectContaining({ valor: 1043, origem: 'MANUAL' })))
  })

  it.each([
    ['falhou', null],
    ['confiança baixa', { valor: 99, custo: null, confianca: 'baixa' } as LeituraIA],
  ])('IA %s: campo vazio e obrigatório', async (_n, resposta) => {
    m.ler.mockResolvedValue(resposta)
    montar()
    tirarFoto()
    expect(await screen.findByText(/não conseguiu ler/)).toBeInTheDocument()
    expect(screen.getByLabelText('Leitura')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Leitura'), { target: { value: '12,5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(confirmar).toHaveBeenCalledWith(expect.objectContaining({ valor: 12.5, origem: 'MANUAL' })))
  })

  it('foto antiga (escolhida da galeria) é recusada sem enviar', async () => {
    montar()
    tirarFoto(60 * 60_000)
    expect(await screen.findByRole('alert')).toHaveTextContent(/Tire a foto agora/)
    expect(m.enviar).not.toHaveBeenCalled()
  })

  it('falha no envio: mostra o erro e volta a pedir a foto', async () => {
    m.enviar.mockRejectedValue(new Error('Sem rede'))
    montar()
    tirarFoto()
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem rede')
    expect(screen.getByRole('button', { name: /Tirar foto/ })).toBeInTheDocument()
    expect(m.ler).not.toHaveBeenCalled()
  })

  it('valor que não passa a validação: erro visível e botão bloqueado', async () => {
    m.ler.mockResolvedValue({ valor: 400, custo: null, confianca: 'alta' })
    montar({ validar: v => (v <= 500 ? 'Tem de ser maior que 500' : null) })
    tirarFoto()
    expect(await screen.findByText('Tem de ser maior que 500')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled()
  })

  it('texto que não é número: aviso e botão bloqueado', async () => {
    m.ler.mockResolvedValue(null)
    montar()
    tirarFoto()
    fireEvent.change(await screen.findByLabelText('Leitura'), { target: { value: 'abc' } })
    expect(screen.getByText('Número inválido.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled()
  })

  it('talão: pede também o valor pago; IA preenche os dois', async () => {
    m.ler.mockResolvedValue({ valor: 40, custo: 72.5, confianca: 'alta' })
    montar({ leitura: 'TALAO', pedirCusto: true, titulo: 'Foto do contador' })
    tirarFoto()
    expect(await screen.findByLabelText('Valor pago (talão)')).toHaveValue('72,5')
    fireEvent.change(screen.getByLabelText('Valor pago (talão)'), { target: { value: '' } })
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Valor pago (talão)'), { target: { value: '72,5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(confirmar).toHaveBeenCalledWith(expect.objectContaining({ valor: 40, custo: 72.5, origem: 'IA' })))
  })
})
