import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { EstadoPedidoBomba } from '@/features/combustivel/services/bombaService'
import { AbastecimentoPublicPage } from '@/app/pages/pub/AbastecimentoPublicPage'

const mocks = vi.hoisted(() => ({
  pedido: vi.fn<(id: string) => Promise<EstadoPedidoBomba | null>>(),
}))

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ insert: async () => ({ error: null }) }),
    functions: { invoke: async () => ({ data: null, error: null }) },
  },
}))
vi.mock('@/features/combustivel/services/bombaService', () => ({
  fetchEstadoBomba: vi.fn(async () => null),
  fetchEstadoPedidoBomba: mocks.pedido,
}))
vi.mock('@/features/combustivel/components/BombaAtiva', () => ({ BombaAtiva: () => null }))

const estado = (o: Partial<EstadoPedidoBomba> = {}): EstadoPedidoBomba => ({
  estado: 'AGUARDA_AUTORIZACAO', pumpActivatedAt: null, pumpMaxSeconds: 180,
  bombaOcupada: false, bloqueioMotivo: null, sessaoAtiva: false, motivoFim: null,
  desligadaConfirmada: false, ...o,
})

let oculto = false
const avancar = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const mudarVisibilidade = (o: boolean) => act(async () => {
  oculto = o
  document.dispatchEvent(new Event('visibilitychange'))
  await vi.advanceTimersByTimeAsync(0)
})

// Sessão restaurada: a página arranca diretamente em AGUARDAR com o pedido p1
function montarAguardar() {
  sessionStorage.setItem('encivil_fuel', JSON.stringify({ pendId: 'p1', tipo: 'POLO2', vehicleId: 'v1' }))
  render(
    <MemoryRouter initialEntries={['/pub/combustivel?v=v1&vn=Carrinha']}>
      <AbastecimentoPublicPage />
    </MemoryRouter>
  )
}

async function submeterPedido() {
  const nome = screen.getByPlaceholderText('Ex: João Silva')
  fireEvent.change(nome, { target: { value: 'Rui' } })
  await act(async () => {
    fireEvent.submit(nome.closest('form')!)
    await vi.advanceTimersByTimeAsync(0)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  oculto = false
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => oculto })
  mocks.pedido.mockReset()
  mocks.pedido.mockResolvedValue(estado())
  sessionStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
})

describe('AbastecimentoPublicPage — polling', () => {
  it('consulta o pedido a cada 3 s enquanto aguarda autorização', async () => {
    montarAguardar()
    expect(screen.getByText('A aguardar autorização')).toBeInTheDocument()
    expect(mocks.pedido).not.toHaveBeenCalled()
    await avancar(9_000)
    expect(mocks.pedido).toHaveBeenCalledTimes(3)
    expect(mocks.pedido).toHaveBeenCalledWith('p1')
  })

  it('com o ecrã bloqueado não consulta; ao voltar consulta logo e avança', async () => {
    montarAguardar()
    await mudarVisibilidade(true)
    await avancar(60_000)
    expect(mocks.pedido).not.toHaveBeenCalled()

    mocks.pedido.mockResolvedValue(estado({ estado: 'AUTORIZADO' }))
    await mudarVisibilidade(false)
    expect(mocks.pedido).toHaveBeenCalledTimes(1)
    expect(screen.getByText('A abrir bomba…')).toBeInTheDocument()
  })

  it('pedido rejeitado para de consultar', async () => {
    mocks.pedido.mockResolvedValue(estado({ estado: 'REJEITADO' }))
    montarAguardar()
    await avancar(3_000)
    expect(screen.getByText('Pedido Rejeitado')).toBeInTheDocument()
    await avancar(30_000)
    expect(mocks.pedido).toHaveBeenCalledTimes(1)
  })

  it('10 min sem resposta → tempo esgotado e para de consultar', async () => {
    montarAguardar()
    await avancar(201 * 3_000)
    expect(screen.getByText('Tempo esgotado')).toBeInTheDocument()
    expect(mocks.pedido).toHaveBeenCalledTimes(200)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('novo pedido depois do tempo esgotado volta a ter 10 min', async () => {
    montarAguardar()
    await avancar(201 * 3_000)
    fireEvent.click(screen.getByRole('button', { name: 'Tentar Novamente' }))
    await submeterPedido()
    expect(screen.getByText('A aguardar autorização')).toBeInTheDocument()
    mocks.pedido.mockClear()
    await avancar(30_000)
    expect(mocks.pedido).toHaveBeenCalledTimes(10)
    expect(screen.queryByText('Tempo esgotado')).not.toBeInTheDocument()
  })

  it('bomba: consulta a cada 2 s, passa à foto quando liga', async () => {
    mocks.pedido.mockResolvedValue(estado({ estado: 'AUTORIZADO' }))
    montarAguardar()
    await avancar(3_000)
    expect(screen.getByText('A abrir bomba…')).toBeInTheDocument()

    mocks.pedido.mockClear()
    await avancar(4_000)
    expect(mocks.pedido).toHaveBeenCalledTimes(2)

    mocks.pedido.mockResolvedValue(estado({ estado: 'AUTORIZADO', pumpActivatedAt: new Date().toISOString() }))
    await avancar(2_000)
    expect(screen.getByText('Autorizado!')).toBeInTheDocument()
    mocks.pedido.mockClear()
    await avancar(10_000)
    expect(mocks.pedido).not.toHaveBeenCalled()
  })

  it('bomba: 30 s sem confirmação → confirmação lenta e para de consultar', async () => {
    mocks.pedido.mockResolvedValue(estado({ estado: 'AUTORIZADO' }))
    montarAguardar()
    await avancar(3_000)
    mocks.pedido.mockClear()
    await avancar(16 * 2_000)
    expect(screen.getByText('Confirmação lenta')).toBeInTheDocument()
    expect(mocks.pedido).toHaveBeenCalledTimes(15)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bomba: novo pedido depois de rejeitado volta a ter 30 s', async () => {
    mocks.pedido.mockResolvedValue(estado({ estado: 'AUTORIZADO' }))
    montarAguardar()
    await avancar(3_000)
    // Um act por tick: dentro de um único act o React só re-renderiza no fim
    for (let i = 0; i < 10; i++) await avancar(2_000)
    mocks.pedido.mockResolvedValue(estado({ estado: 'REJEITADO' }))
    await avancar(2_000)
    fireEvent.click(screen.getByRole('button', { name: 'Tentar Novamente' }))
    fireEvent.click(screen.getByRole('button', { name: /Polo 2/ }))
    await submeterPedido()

    mocks.pedido.mockResolvedValue(estado({ estado: 'AUTORIZADO' }))
    await avancar(3_000)
    expect(screen.getByText('A abrir bomba…')).toBeInTheDocument()
    await avancar(14 * 2_000)
    expect(screen.queryByText('Confirmação lenta')).not.toBeInTheDocument()
  })
})
