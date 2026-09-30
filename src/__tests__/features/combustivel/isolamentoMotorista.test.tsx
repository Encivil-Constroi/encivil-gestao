import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router'

const m = vi.hoisted(() => ({ papel: 'motorista', podeAprovar: false, aguardam: 0, contagemPedida: [] as boolean[] }))

vi.mock('@/features/auth/useRole', () => ({
  useRole: () => ({
    role: m.papel, isAdmin: m.papel === 'admin', isGestor: m.papel === 'gestor',
    isMecanico: m.papel === 'mecanico', isMotorista: m.papel === 'motorista',
    podeArmazem: ['admin', 'gestor', 'armazem'].includes(m.papel),
  }),
}))
vi.mock('@/features/combustivel/hooks/useAprovacao', () => ({
  usePodeAprovar: () => ({ podeAprovar: m.podeAprovar, loading: false }),
  useContagemAguardam: (ativo: boolean) => { m.contagemPedida.push(ativo); return ativo ? m.aguardam : 0 },
}))
vi.mock('@/app/components/Header', () => ({ Header: () => null }))
vi.mock('@/app/components/OfflineSyncBanner', () => ({ OfflineSyncBanner: () => null }))
vi.mock('@/app/components/PushSetup', () => ({ PushSetup: () => null }))
vi.mock('react-router', async orig => ({ ...(await orig<typeof import('react-router')>()), ScrollRestoration: () => null }))

import { MainLayout } from '@/app/layouts/MainLayout'
import { Sidebar } from '@/app/components/Sidebar'

function Onde() { return <p data-testid="onde">{useLocation().pathname}</p> }

function abrir(caminho: string) {
  render(
    <MemoryRouter initialEntries={[caminho]}>
      <Onde />
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<p>DASHBOARD</p>} />
          <Route path="combustivel" element={<p>COMBUSTIVEL</p>} />
          <Route path="frota" element={<p>FROTA</p>} />
          <Route path="abastecer" element={<p>PEDIR</p>} />
          <Route path="abastecer/pedidos" element={<p>PEDIDOS</p>} />
          <Route path="abastecer/pedido/:id" element={<p>PEDIDO</p>} />
          <Route path="ajuda" element={<p>AJUDA</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

function menu(papel: string) {
  m.papel = papel
  render(<MemoryRouter><Sidebar /></MemoryRouter>)
  return within(screen.getAllByRole('navigation')[0]).getAllByRole('link').map(l => l.textContent?.trim() ?? '')
}

afterEach(() => { cleanup(); m.podeAprovar = false; m.aguardam = 0; m.contagemPedida = [] })

describe('isolamento do motorista', () => {
  it.each(['/', '/combustivel', '/frota'])('motorista em %s vai para o pedido de abastecimento', async caminho => {
    m.papel = 'motorista'
    abrir(caminho)
    expect(await screen.findByText('PEDIR')).toBeInTheDocument()
    expect(screen.getByTestId('onde')).toHaveTextContent('/abastecer')
  })

  it.each([['/abastecer', 'PEDIR'], ['/abastecer/pedidos', 'PEDIDOS'], ['/abastecer/pedido/p1', 'PEDIDO'], ['/ajuda', 'AJUDA']])(
    'motorista fica em %s', async (caminho, texto) => {
      m.papel = 'motorista'
      abrir(caminho)
      expect(await screen.findByText(texto)).toBeInTheDocument()
    })

  it.each([['admin', '/combustivel', 'COMBUSTIVEL'], ['gestor', '/', 'DASHBOARD'], ['armazem', '/abastecer', 'PEDIR'], ['mecanico', '/frota', 'FROTA']])(
    '%s continua a navegar como antes (%s)', async (p, caminho, texto) => {
      m.papel = p
      abrir(caminho)
      expect(await screen.findByText(texto)).toBeInTheDocument()
    })

  it('navegação móvel do motorista: Pedir, Pedidos, Ajuda', async () => {
    m.papel = 'motorista'
    abrir('/abastecer/pedido/p1')
    const nav = screen.getAllByRole('navigation').at(-1)!
    const links = within(nav).getAllByRole('link')
    expect(links.map(l => l.getAttribute('href'))).toEqual(['/abastecer', '/abastecer/pedidos', '/ajuda'])
    // No ecrã de um pedido, o separador ativo é "Pedidos"
    expect(links[1].firstElementChild?.className).toMatch(/text-primary/)
    expect(links[0].firstElementChild?.className).not.toMatch(/text-primary/)
  })
})

describe('menu lateral do abastecimento', () => {
  it('motorista vê só o pedido, os pedidos e a ajuda', () => {
    expect(menu('motorista')).toEqual(['Pedir combustível', 'Pedidos combustível', 'Ajuda'])
  })

  it('o mecânico continua só com a Frota e a Ajuda', () => {
    expect(menu('mecanico')).toEqual(['Frota', 'Ajuda'])
  })

  it('outros papéis também podem pedir; o relatório é para gestão', () => {
    const armazem = menu('armazem')
    expect(armazem).toEqual(expect.arrayContaining(['Pedir combustível', 'Pedidos combustível', 'Combustível']))
    expect(armazem).not.toContain('Relatório combustível')
    cleanup()
    expect(menu('gestor')).toContain('Relatório combustível')
  })

  it('quem aprova vê quantos pedidos esperam; os outros não pedem a contagem', () => {
    m.podeAprovar = true; m.aguardam = 3
    menu('admin')
    expect(screen.getByLabelText('3 à espera de decisão')).toHaveTextContent('3')
    cleanup()
    m.podeAprovar = false; m.contagemPedida = []
    menu('gestor')
    expect(m.contagemPedida.every(a => a === false)).toBe(true)
    expect(screen.queryByLabelText(/à espera de decisão/)).not.toBeInTheDocument()
  })

  it('motorista nunca pede a contagem, mesmo se estiver na lista de aprovadores', () => {
    m.podeAprovar = true
    menu('motorista')
    expect(m.contagemPedida.every(a => a === false)).toBe(true)
  })
})
