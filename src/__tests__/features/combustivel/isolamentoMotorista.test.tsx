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
import { Redirecionar } from '@/app/components/Redirecionar'

function Onde() { return <p data-testid="onde">{useLocation().pathname}</p> }

function abrir(caminho: string) {
  render(
    <MemoryRouter initialEntries={[caminho]}>
      <Onde />
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<p>DASHBOARD</p>} />
          <Route path="produtos" element={<p>PRODUTOS</p>} />
          <Route path="frota" element={<p>FROTA</p>} />
          <Route path="abastecimento/pedir" element={<p>PEDIR</p>} />
          <Route path="abastecimento" element={<p>PEDIDOS</p>} />
          <Route path="abastecimento/historico" element={<p>HISTORICO</p>} />
          <Route path="abastecimento/pedido/:id" element={<p>PEDIDO</p>} />
          <Route path="abastecer/pedido/:id" element={<Redirecionar para="/abastecimento/pedido/:id" />} />
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
  it.each(['/', '/produtos', '/frota'])('motorista em %s vai para o pedido de abastecimento', async caminho => {
    m.papel = 'motorista'
    abrir(caminho)
    expect(await screen.findByText('PEDIR')).toBeInTheDocument()
    expect(screen.getByTestId('onde')).toHaveTextContent('/abastecimento/pedir')
  })

  it.each([['/abastecimento/pedir', 'PEDIR'], ['/abastecimento', 'PEDIDOS'], ['/abastecimento/pedido/p1', 'PEDIDO'], ['/ajuda', 'AJUDA']])(
    'motorista fica em %s', async (caminho, texto) => {
      m.papel = 'motorista'
      abrir(caminho)
      expect(await screen.findByText(texto)).toBeInTheDocument()
    })

  it.each([['admin', '/abastecimento/historico', 'HISTORICO'], ['gestor', '/', 'DASHBOARD'], ['armazem', '/abastecimento/pedir', 'PEDIR'], ['mecanico', '/frota', 'FROTA']])(
    '%s continua a navegar como antes (%s)', async (p, caminho, texto) => {
      m.papel = p
      abrir(caminho)
      expect(await screen.findByText(texto)).toBeInTheDocument()
    })

  it('navegação móvel do motorista: Pedir, Pedidos, Ajuda', async () => {
    m.papel = 'motorista'
    abrir('/abastecimento/pedido/p1')
    const nav = screen.getAllByRole('navigation').at(-1)!
    const links = within(nav).getAllByRole('link')
    expect(links.map(l => l.getAttribute('href'))).toEqual(['/abastecimento/pedir', '/abastecimento', '/ajuda'])
    // No ecrã de um pedido, o separador ativo é "Pedidos"
    expect(links[1].firstElementChild?.className).toMatch(/text-primary/)
    expect(links[0].firstElementChild?.className).not.toMatch(/text-primary/)
  })
})

describe('menu lateral do abastecimento', () => {
  it('motorista vê só o pedido, os pedidos e a ajuda', () => {
    expect(menu('motorista')).toEqual(['Pedir combustível', 'Os meus pedidos', 'O meu perfil', 'Ajuda'])
  })

  it('o mecânico continua só com a Frota e a Ajuda', () => {
    expect(menu('mecanico')).toEqual(['Frota', 'O meu perfil', 'Ajuda'])
  })

  it('os outros papéis têm um só item "Abastecimento" (sem duplicados de combustível)', () => {
    for (const p of ['admin', 'gestor', 'armazem', 'leitura']) {
      const itens = menu(p)
      expect(itens.filter(i => /abastec|combust/i.test(i))).toEqual(['Abastecimento'])
      cleanup()
    }
  })

  it('o item do módulo fica ativo nas sub-páginas', () => {
    m.papel = 'admin'
    render(<MemoryRouter initialEntries={['/abastecimento/analise']}><Sidebar /></MemoryRouter>)
    const link = within(screen.getAllByRole('navigation')[0]).getByRole('link', { name: /Abastecimento/ })
    expect(link).toHaveAttribute('href', '/abastecimento')
    expect(link).toHaveClass('bg-sidebar-primary', 'text-sidebar-primary-foreground')
    for (const outro of within(screen.getAllByRole('navigation')[0]).getAllByRole('link').filter(item => item !== link)) {
      expect(outro).not.toHaveClass('bg-sidebar-primary')
    }
  })

  it('endereço antigo de um pedido leva ao mesmo pedido', async () => {
    m.papel = 'motorista'
    abrir('/abastecer/pedido/p9?x=1')
    expect(await screen.findByText('PEDIDO')).toBeInTheDocument()
    expect(screen.getByTestId('onde')).toHaveTextContent('/abastecimento/pedido/p9')
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
