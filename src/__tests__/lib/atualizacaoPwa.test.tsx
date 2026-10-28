import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({ needRefresh: [false], updateServiceWorker: vi.fn() }),
}))
const captureError = vi.fn()
vi.mock('@/app/lib/sentry', () => ({ captureError: (...a: unknown[]) => captureError(...a) }))

import { UpdatePrompt } from '@/app/components/UpdatePrompt'
import { useProtegerSaida } from '@/app/lib/protegerSaida'
import { RouteErrorPage } from '@/app/routes'

function Trabalho() { useProtegerSaida(true); return null }

describe('UpdatePrompt com trabalho por guardar', () => {
  let ouvinte: (() => void) | undefined
  const hrefOriginal = window.location

  beforeEach(() => {
    ouvinte = undefined
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: {},
        addEventListener: (_: string, f: () => void) => { ouvinte = f },
        removeEventListener: vi.fn(),
      },
    })
    const loc = { href: 'http://localhost/atual' }
    Object.defineProperty(window, 'location', { configurable: true, value: loc })
    sessionStorage.clear()
  })
  afterEach(() => {
    cleanup()
    Object.defineProperty(window, 'location', { configurable: true, value: hrefOriginal })
  })

  it('controllerchange não navega e mostra o aviso', () => {
    render(<><Trabalho /><UpdatePrompt /></>)
    act(() => { ouvinte?.() })
    expect(window.location.href).toBe('http://localhost/atual')
    expect(screen.getByText('Atualizar')).toBeTruthy()
  })

  it('sem trabalho por guardar continua a recarregar', () => {
    render(<UpdatePrompt />)
    act(() => { ouvinte?.() })
    expect(window.location.href).toBe('/')
  })
})

describe('RouteErrorPage', () => {
  beforeEach(() => captureError.mockClear())

  it('envia o erro de rota ao Sentry uma vez', () => {
    const erro = new Error('falhou')
    const router = createMemoryRouter(
      [{ path: '/', element: <Boom erro={erro} />, errorElement: <RouteErrorPage /> }],
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<RouterProvider router={router} />)
    expect(captureError).toHaveBeenCalledTimes(1)
    expect(captureError.mock.calls[0][0]).toBe(erro)
  })
})

function Boom({ erro }: { erro: Error }): never { throw erro }
