import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'

vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ signIn: vi.fn(), session: { user: { id: 'u' } } }) }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {} } }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }))

import { LoginPage } from '@/app/pages/LoginPage'

afterEach(cleanup)

describe('LoginPage com sessão já iniciada', () => {
  it('redireciona para a página inicial sem navegar durante o render', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<p>INICIO</p>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('INICIO')).toBeInTheDocument()
    // navigate() em render faz o React Router avisar ("should call navigate() in a React.useEffect()")
    const mensagens = [...erro.mock.calls, ...aviso.mock.calls].flat().map(String).join('\n')
    expect(mensagens).not.toMatch(/useEffect/)
    erro.mockRestore(); aviso.mockRestore()
  })
})
