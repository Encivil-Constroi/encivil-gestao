import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { clearAsyncCache, useAsync } from '@/app/lib/useAsync'

const m = vi.hoisted(() => ({ listener: null as null | ((event: AuthChangeEvent, session: Session | null) => Promise<void>) }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: {
    getSession: async () => ({ data: { session: { user: { id: 'sessao-a' } } } }),
    onAuthStateChange: (fn: typeof m.listener) => { m.listener = fn; return { data: { subscription: { unsubscribe: () => {} } } } },
  },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'admin', nome: 'Administrador de teste' }, error: null }) }) }) }),
} }))
import { AuthProvider, useAuth } from '@/features/auth/AuthContext'
function Estado() { const auth = useAuth(); return <p>{auth.loading ? 'A iniciar' : auth.user ? 'Autenticado' : 'Sem sessão'}</p> }
function ConsultaPersistente() {
  const auth = useAuth()
  const { data } = useAsync(async () => auth.user?.id ?? 'sem dados', [], { enabled: !!auth.user, cacheKey: 'obra-painel-auth' })
  return <p>{data ?? 'A carregar dados da sessão'}</p>
}
afterEach(() => { cleanup(); clearAsyncCache() })
it('troca de identidade atualiza um painel que permanece montado', async () => {
  render(<AuthProvider><ConsultaPersistente /></AuthProvider>)
  await screen.findByText('sessao-a')
  await act(async () => m.listener?.('SIGNED_IN', { user: { id: 'sessao-b' } } as Session))
  expect(screen.queryByText('sessao-a')).not.toBeInTheDocument()
  expect(await screen.findByText('sessao-b')).toBeInTheDocument()
})
it('saída real do AuthProvider elimina dados de obras da sessão anterior', async () => {
  render(<AuthProvider><Estado /></AuthProvider>)
  await screen.findByText('Autenticado')
  const old = renderHook(() => useAsync(async () => 'obra da sessão A', [], { cacheKey: 'obra-visao-auth' }))
  await waitFor(() => expect(old.result.current.data).toBe('obra da sessão A'))
  old.unmount()
  await act(async () => m.listener?.('SIGNED_OUT', null))
  expect(screen.getByText('Sem sessão')).toBeInTheDocument()
  const current = renderHook(() => useAsync(async () => 'consulta da sessão atual', [], { cacheKey: 'obra-visao-auth' }))
  expect(current.result.current.data).not.toBe('obra da sessão A')
  await waitFor(() => expect(current.result.current.data).toBe('consulta da sessão atual'))
})
