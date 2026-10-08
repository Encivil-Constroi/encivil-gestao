import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(),
}))
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: { email: 'ana@x.pt' } }) }))
vi.mock('@/features/auth/useRole', () => ({ useRole: () => ({ role: 'armazem', isAdmin: false, nome: 'Ana' }) }))

import { HelpPage, textoComNegrito } from '@/app/pages/HelpPage'

describe('textoComNegrito', () => {
  it('marca como negrito o texto entre **', () => {
    expect(textoComNegrito('Clica em **Guardar** no fim')).toEqual([
      { texto: 'Clica em ', negrito: false },
      { texto: 'Guardar', negrito: true },
      { texto: ' no fim', negrito: false },
    ])
  })
  it('HTML no texto fica como texto literal', () => {
    const partes = textoComNegrito('<img src=x onerror=alert(1)>')
    expect(partes).toEqual([{ texto: '<img src=x onerror=alert(1)>', negrito: false }])
  })
})

describe('HelpPage', () => {
  it('mostra o negrito dos passos em <strong>, sem espaços a mais', () => {
    const { container } = render(<HelpPage />)
    const strong = container.querySelector('li strong') as HTMLElement
    expect(strong.tagName).toBe('STRONG')
    expect(strong.textContent).toBe(strong.textContent?.trim())
    expect(container.querySelector('[onerror]')).toBeNull()
  })
})
