import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'

const m = vi.hoisted(() => ({ fetch: vi.fn(), contar: vi.fn() }))
vi.mock('@/features/auth/services/eventosSegurancaService', () => ({
  fetchEventosSeguranca: (...a: unknown[]) => m.fetch(...a),
  contarLoginsFalhados24h: () => m.contar(),
}))

import { EventosSegurancaPainel, rotuloEvento } from '@/app/pages/auditoria/EventosSegurancaPainel'

const evento = (id: string, tipo: string, extra: Record<string, unknown> = {}) => ({
  id, tipo, utilizadorId: null, email: 'ana@x.pt', detalhe: {}, criadoEm: '2026-10-06T10:00:00Z', ...extra,
})

beforeEach(() => {
  m.fetch.mockReset()
  m.contar.mockReset()
  m.fetch.mockResolvedValue([])
  m.contar.mockResolvedValue(0)
})
afterEach(cleanup)

describe('rotuloEvento', () => {
  it('traduz os tipos para pt-PT', () => {
    expect(rotuloEvento('login_falhado')).toBe('Login falhado')
    expect(rotuloEvento('rate_limit')).toBe('Limite de pedidos atingido')
    expect(rotuloEvento('mfa_removido_admin')).toBe('MFA removido por administrador')
    expect(rotuloEvento('login_ok')).toBe('Login com sucesso')
    expect(rotuloEvento('tipo_novo')).toBe('tipo_novo')
  })
})

describe('EventosSegurancaPainel', () => {
  it('destaca 10 ou mais logins falhados em 24 h', async () => {
    m.contar.mockResolvedValue(12)
    render(<EventosSegurancaPainel />)
    const cartao = await screen.findByText('Logins falhados (24 h): 12')
    expect(cartao.className).toContain('bg-destructive')
    expect(cartao.className).toContain('text-destructive-foreground')
  })
  it('abaixo de 10 fica neutro', async () => {
    m.contar.mockResolvedValue(3)
    render(<EventosSegurancaPainel />)
    const cartao = await screen.findByText('Logins falhados (24 h): 3')
    expect(cartao.className).not.toContain('bg-destructive')
  })
  it('lista os eventos com rótulos pt-PT', async () => {
    m.fetch.mockResolvedValue([
      evento('1', 'login_falhado'),
      evento('2', 'rate_limit', { email: null, detalhe: { chave: 'extrair-fatura' } }),
      evento('3', 'mfa_removido_admin'),
    ])
    render(<EventosSegurancaPainel />)
    const lista = await screen.findByRole('list')
    expect(within(lista).getByText('Login falhado')).toBeInTheDocument()
    expect(within(lista).getByText('Limite de pedidos atingido')).toBeInTheDocument()
    expect(within(lista).getByText('MFA removido por administrador')).toBeInTheDocument()
  })
  it('filtra por tipo', async () => {
    render(<EventosSegurancaPainel />)
    await waitFor(() => expect(m.fetch).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'login_falhado' } })
    await waitFor(() => expect(m.fetch).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: 'login_falhado' })))
  })
  it('sem eventos mostra o estado vazio', async () => {
    render(<EventosSegurancaPainel />)
    expect(await screen.findByText('Sem eventos neste período.')).toBeInTheDocument()
  })
})
