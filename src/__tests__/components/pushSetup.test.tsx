import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

const toastMock = vi.fn()
vi.mock('sonner', () => ({ toast: Object.assign((...a: unknown[]) => toastMock(...a), { dismiss: vi.fn() }) }))
vi.mock('@/features/auth/useRole', () => ({ useRole: () => ({ role: 'admin' }) }))
vi.mock('@/app/lib/push', () => ({
  estadoPush: () => 'por-pedir',
  pedirNotificacoes: vi.fn(),
  subscreverSeNecessario: vi.fn(),
}))
vi.mock('@/app/lib/sentry', () => ({ captureError: vi.fn() }))

import { PushSetup } from '@/app/components/PushSetup'

describe('PushSetup', () => {
  beforeEach(() => { vi.useFakeTimers(); toastMock.mockClear() })
  afterEach(() => { cleanup(); vi.useRealTimers(); document.body.innerHTML = '' })

  it('mostra o convite em baixo ao centro com id fixo', () => {
    render(<PushSetup />)
    vi.advanceTimersByTime(5_000)
    expect(toastMock).toHaveBeenCalledTimes(1)
    expect(toastMock.mock.calls[0][1]).toMatchObject({ position: 'bottom-center', id: 'convite-push' })
  })

  it('adia enquanto houver um diálogo modal aberto', () => {
    const modal = document.createElement('div')
    modal.setAttribute('aria-modal', 'true')
    document.body.appendChild(modal)
    render(<PushSetup />)
    vi.advanceTimersByTime(5_000)
    expect(toastMock).not.toHaveBeenCalled()
    modal.remove()
    vi.advanceTimersByTime(5_000)
    expect(toastMock).toHaveBeenCalledTimes(1)
  })
})
