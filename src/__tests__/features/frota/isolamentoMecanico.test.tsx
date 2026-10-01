import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router'

const papel = vi.hoisted(() => ({ atual: 'mecanico' }))

vi.mock('@/features/auth/useRole', () => ({
  useRole: () => ({
    role: papel.atual, isAdmin: papel.atual === 'admin', isGestor: papel.atual === 'gestor',
    isMecanico: papel.atual === 'mecanico', podeArmazem: ['admin', 'gestor', 'armazem'].includes(papel.atual),
  }),
}))
// O layout em si é o que se testa; o resto da moldura não interessa aqui
vi.mock('@/app/components/Sidebar', () => ({ Sidebar: () => null }))
vi.mock('@/app/components/Header', () => ({ Header: () => null }))
vi.mock('@/app/components/OfflineSyncBanner', () => ({ OfflineSyncBanner: () => null }))
vi.mock('@/app/components/PushSetup', () => ({ PushSetup: () => null }))
// ScrollRestoration exige o router de dados, que em jsdom colide com o AbortSignal do Node
vi.mock('react-router', async orig => ({ ...(await orig<typeof import('react-router')>()), ScrollRestoration: () => null }))

import { MainLayout } from '@/app/layouts/MainLayout'

function Onde() {
  return <p data-testid="onde">{useLocation().pathname}</p>
}

function abrir(caminho: string) {
  render(
    <MemoryRouter initialEntries={[caminho]}>
      <Onde />
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<p>DASHBOARD</p>} />
          <Route path="produtos" element={<p>PRODUTOS</p>} />
          <Route path="abastecimento" element={<p>COMBUSTIVEL</p>} />
          <Route path="frota" element={<p>FROTA</p>} />
          <Route path="frota/viatura/:id" element={<p>FICHA</p>} />
          <Route path="ajuda" element={<p>AJUDA</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(cleanup)

describe('isolamento do mecânico', () => {
  it.each(['/', '/produtos', '/abastecimento'])('mecânico em %s vai para a Frota', async caminho => {
    papel.atual = 'mecanico'
    abrir(caminho)
    expect(await screen.findByText('FROTA')).toBeInTheDocument()
    expect(screen.getByTestId('onde')).toHaveTextContent('/frota')
  })

  it.each([['/frota', 'FROTA'], ['/frota/viatura/v1', 'FICHA'], ['/ajuda', 'AJUDA']])('mecânico fica em %s', async (caminho, texto) => {
    papel.atual = 'mecanico'
    abrir(caminho)
    expect(await screen.findByText(texto)).toBeInTheDocument()
  })

  it.each([['admin', '/produtos', 'PRODUTOS'], ['gestor', '/', 'DASHBOARD'], ['armazem', '/abastecimento', 'COMBUSTIVEL']])(
    '%s continua a navegar como antes (%s)', async (p, caminho, texto) => {
      papel.atual = p
      abrir(caminho)
      expect(await screen.findByText(texto)).toBeInTheDocument()
    })

  it('navegação móvel do mecânico só tem Frota e Ajuda', async () => {
    papel.atual = 'mecanico'
    abrir('/frota')
    const links = (await screen.findAllByRole('link')).map(l => l.getAttribute('href'))
    expect(links).toEqual(['/frota', '/ajuda'])
  })
})
