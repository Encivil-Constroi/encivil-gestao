import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: { email: 'ana@x.pt' } }) }))
vi.mock('@/features/auth/useRole', () => ({ useRole: () => ({ isAdmin: false }) }))

import { HelpPage, textoComNegrito } from '@/app/pages/HelpPage'

describe('textoComNegrito', () => {
  it('marca como negrito o texto entre dois espaços de cada lado', () => {
    expect(textoComNegrito('Clica em  Guardar  no fim')).toEqual([
      { texto: 'Clica em', negrito: false },
      { texto: 'Guardar', negrito: true },
      { texto: 'no fim', negrito: false },
    ])
  })
  it('HTML no texto fica como texto literal', () => {
    const partes = textoComNegrito('<img src=x onerror=alert(1)>')
    expect(partes).toEqual([{ texto: '<img src=x onerror=alert(1)>', negrito: false }])
  })
})

describe('HelpPage', () => {
  it('mostra o negrito dos passos em <strong>', () => {
    const { container } = render(<HelpPage />)
    const strong = container.querySelector('p strong') as HTMLElement
    expect(strong.textContent).toBe(' + ')
    expect(strong.tagName).toBe('STRONG')
    expect(container.querySelector('p [onerror]')).toBeNull()
  })
})
