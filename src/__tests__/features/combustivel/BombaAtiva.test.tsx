import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { BombaAtiva } from '@/features/combustivel/components/BombaAtiva'
import type { EstadoPedidoBomba } from '@/features/combustivel/services/bombaService'

const mocks = vi.hoisted(() => ({
  estado: null as EstadoPedidoBomba | null,
  parar:  vi.fn<(pedidoId?: string) => Promise<boolean>>(),
}))

vi.mock('@/features/combustivel/hooks/useBombaPolo2', () => ({
  useEstadoPedidoBomba: () => mocks.estado,
  usePararBomba: () => ({ parar: mocks.parar, loading: false, error: null }),
}))

const estado = (o: Partial<EstadoPedidoBomba> = {}): EstadoPedidoBomba => ({
  estado: 'AUTORIZADO', pumpActivatedAt: new Date().toISOString(), pumpMaxSeconds: 300,
  bombaOcupada: false, bloqueioMotivo: null, sessaoAtiva: true, motivoFim: null,
  desligadaConfirmada: false, ...o,
})

// Avança o relógio e deixa o componente re-renderizar (o tick de 1s força o render)
const avancar = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

function montar() {
  render(<BombaAtiva ativadaEm={new Date().toISOString()} maxSegundos={300} pedidoId="p1" />)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-28T10:00:00Z'))
  mocks.estado = estado()
  mocks.parar.mockReset()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('BombaAtiva', () => {
  it('mostra a contagem e o botão Terminei enquanto a sessão está ativa', () => {
    montar()
    expect(screen.getByText('5:00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Terminei/ })).toBeInTheDocument()
  })

  it('Terminei → "A desligar…" → só confirma quando o servidor confirma', async () => {
    mocks.parar.mockResolvedValue(true)
    montar()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Terminei/ })) })
    expect(mocks.parar).toHaveBeenCalledWith('p1')
    expect(screen.getByText('A desligar a bomba…')).toBeInTheDocument()

    mocks.estado = estado({ sessaoAtiva: false, motivoFim: 'TERMINEI', desligadaConfirmada: false })
    await avancar(5_000)
    expect(screen.getByText('A desligar a bomba…')).toBeInTheDocument()

    mocks.estado = estado({ sessaoAtiva: false, motivoFim: 'TERMINEI', desligadaConfirmada: true })
    await avancar(1_000)
    expect(screen.getByRole('status')).toHaveTextContent('Bomba desligada — desligada por ti')
  })

  it('sem confirmação em 20s manda usar a EMERGENZA', async () => {
    mocks.parar.mockResolvedValue(true)
    montar()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Terminei/ })) })
    await avancar(19_000)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await avancar(3_000)
    expect(screen.getByRole('alert')).toHaveTextContent(/EMERGENZA/)
  })

  it('falha ao enviar o Terminei mantém o botão e avisa', async () => {
    mocks.parar.mockResolvedValue(false)
    montar()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Terminei/ })) })
    expect(screen.getByRole('button', { name: /Terminei/ })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível desligar pela app')
  })

  it('Shelly offline: ao chegar a 0:00 não fica preso — confirma ou alerta', async () => {
    montar() // sessaoAtiva continua true: o servidor nunca soube que o relé desligou
    await avancar(300_000)
    expect(screen.queryByRole('button', { name: /Terminei/ })).not.toBeInTheDocument()
    expect(screen.getByText('A confirmar que a bomba desligou…')).toBeInTheDocument()
    await avancar(21_000)
    expect(screen.getByRole('alert')).toHaveTextContent(/EMERGENZA/)
  })

  it('sessão terminada pelo responsável mostra o motivo', async () => {
    montar()
    mocks.estado = estado({ sessaoAtiva: false, motivoFim: 'EMERGENCIA', desligadaConfirmada: true })
    await avancar(1_000)
    expect(screen.getByRole('status')).toHaveTextContent('Bomba desligada — desligada pelo responsável')
  })
})
